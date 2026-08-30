import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { UnauthorizedError, ValidationError } from '../lib/errors.js';
import { autoRetryProcessingJob, shouldAutoRetry } from '../services/documentProcessing.service.js';

/**
 * Loop 11 (security hardening): a plain `!==` string comparison is not
 * constant-time - the JS engine short-circuits at the first mismatched
 * character, so response latency leaks (in principle) how many
 * leading characters of a guess were correct, letting an attacker
 * recover DOCUMENT_SERVICE_CALLBACK_SECRET byte-by-byte over enough
 * requests. Hashing both sides first fixes the "must be equal length"
 * requirement `timingSafeEqual` otherwise imposes (the raw secret and
 * an attacker's guess are rarely the same length) without leaking
 * length as a separate signal, and the digest comparison itself is
 * constant-time.
 */
function secretsMatch(provided: string, expected: string): boolean {
  const providedHash = createHash('sha256').update(provided).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

const callbackSchema = z.object({
  jobId: z.string().uuid(),
  paperId: z.string().uuid(),
  status: z.enum(['PROCESSING', 'COMPLETED', 'FAILED']),
  extractedText: z.string().optional(),
  pageCount: z.number().int().positive().optional(),
  ocrUsed: z.boolean().optional(),
  errorMessage: z.string().optional(),
  // Only meaningful when status === 'FAILED' - see
  // apps/document-service's ProcessingCallback for what sets this.
  recoverable: z.boolean().optional(),
});

/**
 * Receives the result of a document-processing job from
 * apps/document-service. Trust boundary: the Python service must
 * present the shared secret configured in
 * DOCUMENT_SERVICE_CALLBACK_SECRET - this endpoint is not reachable by
 * ordinary API clients (it isn't behind authenticate()/RBAC because
 * the caller is a machine, not a logged-in user).
 */
export async function internalRoutes(app: FastifyInstance): Promise<void> {
  app.post('/processing-callback', { schema: { tags: ['health'], summary: 'Internal: document-service job completion callback' } }, async (request, reply) => {
    const secret = request.headers['x-internal-secret'];
    if (typeof secret !== 'string' || !secretsMatch(secret, env.DOCUMENT_SERVICE_CALLBACK_SECRET)) {
      throw new UnauthorizedError('Invalid internal service credentials');
    }

    const input = callbackSchema.parse(request.body);

    const { data: job } = await supabaseAdmin.from('document_processing_jobs').select('id, paper_id, attempts').eq('id', input.jobId).maybeSingle();
    if (!job || job.paper_id !== input.paperId) {
      throw new ValidationError('Unknown job/paper combination');
    }

    if (input.status === 'PROCESSING') {
      // Sent once, as soon as the Python service's background task
      // actually starts extraction - distinct from QUEUED (set the
      // instant this API created the job row, before the file has even
      // been dispatched). Gives the paper's ocr_status a genuine
      // PROCESSING state instead of that enum value going unused.
      await supabaseAdmin.from('document_processing_jobs').update({ status: 'PROCESSING', started_at: new Date().toISOString() }).eq('id', input.jobId);
      await supabaseAdmin.from('examination_papers').update({ ocr_status: 'PROCESSING' }).eq('id', input.paperId);
      reply.status(204);
      return;
    }

    if (input.status === 'FAILED' && input.recoverable && shouldAutoRetry((job.attempts as number) ?? 0)) {
      // A failure the Python service itself flagged as worth retrying
      // (couldn't download the file, timed out, an unexpected error) -
      // automatically re-queue rather than leaving it FAILED for a
      // human to notice and manually retry via POST /:id/reprocess.
      // Bounded by MAX_AUTO_REPROCESS_ATTEMPTS so a persistently broken
      // file doesn't retry forever.
      request.log.warn({ jobId: input.jobId, paperId: input.paperId, attempts: job.attempts, error: input.errorMessage }, 'Recoverable processing failure - automatically re-queuing');
      await autoRetryProcessingJob(input.jobId, input.paperId, (job.attempts as number) ?? 0);
      reply.status(204);
      return;
    }

    await supabaseAdmin
      .from('document_processing_jobs')
      .update({
        status: input.status,
        error_message: input.errorMessage ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', input.jobId);

    await supabaseAdmin
      .from('examination_papers')
      .update({
        ocr_status: input.status === 'COMPLETED' ? 'COMPLETED' : 'FAILED',
        extracted_text: input.extractedText ?? null,
        page_count: input.pageCount ?? null,
      })
      .eq('id', input.paperId);

    reply.status(204);
  });
}
