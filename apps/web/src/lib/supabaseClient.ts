import { createClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * The frontend only ever uses the anon key. Session tokens are
 * obtained from our own Node API (POST /api/auth/login etc, which
 * validates Student ID / staff email + password against Supabase Auth
 * server-side) and then handed to this client via setSession() so
 * supabase-js takes over automatic token refresh from that point on.
 * The frontend never talks to Supabase Auth's password grant directly.
 */
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
