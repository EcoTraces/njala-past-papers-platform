import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../lib/supabase.js';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', { schema: { tags: ['health'], summary: 'Liveness probe' } }, async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  app.get('/health/ready', { schema: { tags: ['health'], summary: 'Readiness probe (checks DB connectivity)' } }, async (_request, reply) => {
    const { error } = await supabaseAdmin.from('system_settings').select('key').limit(1);
    if (error) {
      reply.status(503);
      return { status: 'error', database: 'unreachable' };
    }
    return { status: 'ok', database: 'reachable' };
  });
}
