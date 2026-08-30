import { supabaseAdmin } from '../lib/supabase.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { createSignedUrl } from './storage.service.js';
import { NotFoundError } from '../lib/errors.js';

/**
 * Hands a paper off to apps/document-service for text extraction/OCR.
 * Fire-and-forget from the caller's point of view: it creates the job
 * row immediately (status QUEUED) and returns, so the request that
 * triggered processing (an upload) never blocks on OCR. The Python
 * service reports back to POST /api/internal/processing-callback with
 * PROCESSING (once extraction actually starts), then COMPLETED/FAILED.
 */

// How many times to retry *dispatching* the job (the initial POST
// /jobs call to the Python service) before giving up - covers a
// transient network blip or the service being briefly unreachable
// (e.g. mid-deploy). Deliberately small and fast: this runs in the
// background after the upload has already responded to the client, but
// should still resolve to a definite QUEUED/FAILED state quickly
// rather than hanging indefinitely.
const DISPATCH_MAX_ATTEMPTS = 3;
const DISPATCH_RETRY_BASE_DELAY_MS = 500;

// How many times the Node API will automatically re-queue a job the
// Python service reported as a *recoverable* failure (network/timeout/
// unexpected-error - see apps/document-service's ProcessingCallback)
// before leaving it permanently FAILED for a human to retry via
// POST /api/papers/:id/reprocess. Counted against document_processing_
// jobs.attempts, which starts at 0 on the first, non-retry attempt.
const MAX_AUTO_REPROCESS_ATTEMPTS = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function queueDocumentProcessing(paperId: string, requestedBy: string): Promise<string> {
  const { data: job, error } = await supabaseAdmin
    .from('document_processing_jobs')
    .insert({ paper_id: paperId, job_type: 'FULL_PROCESS', status: 'QUEUED', requested_by: requestedBy })
    .select('id')
    .single();

  if (error || !job) {
    throw new Error(`Failed to create processing job: ${error?.message}`);
  }

  await supabaseAdmin.from('examination_papers').update({ ocr_status: 'QUEUED' }).eq('id', paperId);

  // Not awaited: dispatchProcessingJob retries internally and always
  // resolves to a terminal DB write on its own (QUEUED stays QUEUED
  // only if the Python service actually accepted the job) - the
  // caller (an upload/version-replace request) must not wait on it.
  dispatchProcessingJob(job.id as string, paperId).catch((err: unknown) => {
    logger.error({ err, jobId: job.id }, 'Unexpected error dispatching document processing job');
  });

  return job.id as string;
}

/**
 * Staff-triggered manual retry for a paper stuck in a FAILED (or,
 * defensively, any non-terminal) processing state - the counterpart to
 * the library dashboard's "processing failures" list, which previously
 * had no remediation action attached to it at all. Reuses the most
 * recent job row for the paper (incrementing its attempts counter)
 * rather than creating a parallel one, so history/attempts stay on a
 * single row per paper the way document_processing_jobs.attempts
 * implies. Awaited by the route handler (unlike queueDocumentProcessing)
 * since this *is* the action the caller asked for, not a side effect of
 * something else - a failure to even dispatch should be visible in the
 * response, not just logged.
 */
export async function reprocessPaper(paperId: string, requestedBy: string): Promise<{ jobId: string; ocrStatus: string }> {
  const { data: paper, error: paperError } = await supabaseAdmin
    .from('examination_papers')
    .select('id')
    .eq('id', paperId)
    .maybeSingle();
  if (paperError) throw paperError;
  if (!paper) throw new NotFoundError('Examination paper');

  const { data: existingJob } = await supabaseAdmin
    .from('document_processing_jobs')
    .select('id, attempts')
    .eq('paper_id', paperId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let jobId: string;
  if (existingJob) {
    jobId = existingJob.id as string;
    await supabaseAdmin
      .from('document_processing_jobs')
      .update({ status: 'QUEUED', attempts: (existingJob.attempts as number) + 1, error_message: null, started_at: null, completed_at: null })
      .eq('id', jobId);
  } else {
    const { data: job, error } = await supabaseAdmin
      .from('document_processing_jobs')
      .insert({ paper_id: paperId, job_type: 'FULL_PROCESS', status: 'QUEUED', requested_by: requestedBy })
      .select('id')
      .single();
    if (error || !job) throw new Error(`Failed to create processing job: ${error?.message}`);
    jobId = job.id as string;
  }

  await supabaseAdmin.from('examination_papers').update({ ocr_status: 'QUEUED' }).eq('id', paperId);
  await dispatchProcessingJob(jobId, paperId);

  const { data: updatedPaper } = await supabaseAdmin.from('examination_papers').select('ocr_status').eq('id', paperId).maybeSingle();
  return { jobId, ocrStatus: (updatedPaper?.ocr_status as string) ?? 'QUEUED' };
}

/**
 * Called by internal.routes.ts when the Python service reports a
 * FAILED job with recoverable=true and the job hasn't exhausted
 * MAX_AUTO_REPROCESS_ATTEMPTS yet - re-queues and re-dispatches the
 * same job row automatically, no human involved.
 */
export async function autoRetryProcessingJob(jobId: string, paperId: string, currentAttempts: number): Promise<void> {
  await supabaseAdmin
    .from('document_processing_jobs')
    .update({ status: 'QUEUED', attempts: currentAttempts + 1, started_at: null })
    .eq('id', jobId);
  await supabaseAdmin.from('examination_papers').update({ ocr_status: 'QUEUED' }).eq('id', paperId);
  await dispatchProcessingJob(jobId, paperId);
}

export function shouldAutoRetry(attempts: number): boolean {
  return attempts < MAX_AUTO_REPROCESS_ATTEMPTS;
}

/**
 * POSTs the job to apps/document-service, retrying a couple of times
 * on a network-level failure (the service being briefly unreachable)
 * before giving up. On final failure, writes a terminal FAILED status
 * to both document_processing_jobs and examination_papers.ocr_status -
 * previously this was a fire-and-forget fetch().catch(logger.error)
 * with no DB write at all, so a dispatch failure left the job silently
 * stuck at QUEUED forever: invisible to the library dashboard's
 * "processing failures" list (which filters on status = FAILED) and
 * with no path back to a working state short of a database edit.
 */
async function dispatchProcessingJob(jobId: string, paperId: string): Promise<void> {
  const { data: paper } = await supabaseAdmin.from('examination_papers').select('storage_path').eq('id', paperId).maybeSingle();
  if (!paper) {
    logger.error({ jobId, paperId }, 'Cannot dispatch processing job - paper no longer exists');
    await supabaseAdmin
      .from('document_processing_jobs')
      .update({ status: 'FAILED', error_message: 'Paper no longer exists' })
      .eq('id', jobId);
    return;
  }

  for (let attempt = 1; attempt <= DISPATCH_MAX_ATTEMPTS; attempt += 1) {
    try {
      const fileUrl = await createSignedUrl(paper.storage_path);
      const response = await fetch(`${env.DOCUMENT_SERVICE_URL}/jobs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': env.DOCUMENT_SERVICE_CALLBACK_SECRET },
        body: JSON.stringify({ jobId, paperId, fileUrl }),
      });
      if (!response.ok) {
        throw new Error(`document-service responded ${response.status}`);
      }
      return;
    } catch (err) {
      logger.warn({ err, jobId, attempt, maxAttempts: DISPATCH_MAX_ATTEMPTS }, 'Failed to dispatch document processing job');
      if (attempt === DISPATCH_MAX_ATTEMPTS) {
        const message = err instanceof Error ? err.message : String(err);
        await supabaseAdmin
          .from('document_processing_jobs')
          .update({ status: 'FAILED', error_message: `Could not reach the document processing service after ${DISPATCH_MAX_ATTEMPTS} attempts: ${message}` })
          .eq('id', jobId);
        await supabaseAdmin.from('examination_papers').update({ ocr_status: 'FAILED' }).eq('id', paperId);
        return;
      }
      await sleep(DISPATCH_RETRY_BASE_DELAY_MS * attempt);
    }
  }
}
