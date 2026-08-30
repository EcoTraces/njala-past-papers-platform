import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

/**
 * Service-role client. Bypasses RLS entirely - use it ONLY for the
 * narrow set of privileged operations that legitimately require it:
 * creating auth users at signup, admin user management via the
 * Supabase Admin API, writing audit_logs/notifications (which have no
 * client insert policy by design), and storage writes. Never use it as
 * a shortcut around authorization logic for ordinary reads/writes.
 */
export const supabaseAdmin: SupabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Per-request client scoped to the caller's own access token. Queries
 * made with this client are subject to the same Postgres RLS policies
 * the frontend would get talking to Supabase directly - this is the
 * defense-in-depth layer beneath the explicit RBAC middleware.
 */
export function supabaseForUser(accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/**
 * SAFE DEFAULT for request.db before authenticate() runs: an anon-key
 * client with no user token, so RLS applies as the unauthenticated
 * "anon" Postgres role. A route that forgets to add the authenticate
 * preHandler gets essentially no access instead of accidentally
 * inheriting service-role's full bypass of RLS.
 */
export const supabaseAnon: SupabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
