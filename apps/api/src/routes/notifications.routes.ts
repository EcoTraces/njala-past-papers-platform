import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';

export async function notificationsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: authenticate, schema: { tags: ['dashboards'], summary: 'List the current user\'s notifications' } }, async (request) => {
    const { data, error } = await request.db
      .from('notifications')
      .select('*')
      .eq('user_id', request.user!.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return { items: data };
  });

  app.patch('/:id/read', { preHandler: authenticate, schema: { tags: ['dashboards'] } }, async (request) => {
    const { id } = request.params as { id: string };
    const { data, error } = await request.db
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('user_id', request.user!.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  });

  app.post('/read-all', { preHandler: authenticate, schema: { tags: ['dashboards'] } }, async (request, reply) => {
    const { error } = await request.db.from('notifications').update({ is_read: true }).eq('user_id', request.user!.id).eq('is_read', false);
    if (error) throw error;
    reply.status(204);
  });
}
