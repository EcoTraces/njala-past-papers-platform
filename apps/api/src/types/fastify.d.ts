import type { AppRole } from '@njala/shared';
import type { SupabaseClient } from '@supabase/supabase-js';

interface RequestUser {
  id: string;
  studentId: string | null;
  staffId: string | null;
  fullName: string;
  status: string;
  roles: AppRole[];
  accessToken: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: RequestUser;
    /** Supabase client scoped to the caller's access token (RLS applies). */
    db: SupabaseClient;
  }
}
