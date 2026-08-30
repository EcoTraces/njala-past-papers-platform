import { supabaseAdmin } from '../lib/supabase.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { createSignedUrl } from './storage.service.js';

/**
 * Hands a paper off to apps/document-service for text extraction/OCR.
 * Fire-and-forget from the API's point of view: it creates the job row
 * immediately (status QUEUED) and returns, so the request that
 * triggered processing (an upload) never blocks on OCR. The Python
 * service reports back to
 * POST /api/internal/processing-callback when it finishes.
 */
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

  const { data: paper } = await supabaseAdmin
    .from('examination_papers')
    .select('storage_path')
    .eq('id', paperId)
    .single();

  if (paper) {
    const fileUrl = await createSignedUrl(paper.storage_path);
    // Best-effort dispatch to the Python service. A failure here does
    // not fail the upload - the job stays QUEUED and can be retried;
    // see docs/architecture/document-processing.md.
    fetch(`${env.DOCUMENT_SERVICE_URL}/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': env.DOCUMENT_SERVICE_CALLBACK_SECRET },
      body: JSON.stringify({ jobId: job.id, paperId, fileUrl }),
    }).catch((err) => {
      logger.error({ err, jobId: job.id }, 'Failed to dispatch document processing job');
    });
  }

  return job.id as string;
}
