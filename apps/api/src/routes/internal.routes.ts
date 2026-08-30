import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { UnauthorizedError, ValidationError } from '../lib/errors.js';

const callbackSchema = z.object({
  jobId: z.string().uuid(),
  paperId: z.string().uuid(),
  status: z.enum(['COMPLETED', 'FAILED']),
  extractedText: z.string().optional(),
  pageCount: z.number().int().positive().optional(),
  ocrUsed: z.boolean().optional(),
  errorMessage: z.string().optional(),
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
    if (secret !== env.DOCUMENT_SERVICE_CALLBACK_SECRET) {
      throw new UnauthorizedError('Invalid internal service credentials');
    }

    const input = callbackSchema.parse(request.body);

    const { data: job } = await supabaseAdmin.from('document_processing_jobs').select('id, paper_id').eq('id', input.jobId).maybeSingle();
    if (!job || job.paper_id !== input.paperId) {
      throw new ValidationError('Unknown job/paper combination');
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
