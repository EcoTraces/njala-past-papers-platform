import type { FastifyInstance } from 'fastify';
import { supabaseAdmin } from '../lib/supabase.js';

/**
 * A handful of read-only, non-sensitive lookups needed before a user
 * has an account at all (the student sign-up form needs to list
 * programmes to pick from). Deliberately uses the service-role client
 * rather than request.db - not a bypass of anything sensitive, just
 * publishing the same academic catalogue anyone can already read once
 * signed in, to a page that by definition has no signed-in user yet.
 */
export async function publicRoutes(app: FastifyInstance): Promise<void> {
  app.get('/programmes', { schema: { tags: ['academic'], summary: 'Public: list programmes for the sign-up form' } }, async () => {
    const { data, error } = await supabaseAdmin
      .from('programmes')
      .select('id, name, code, level, departments(name, faculties(name))')
      .is('deleted_at', null)
      .order('name');
    if (error) throw error;
    return { items: data };
  });
}
