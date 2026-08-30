import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppRole } from '@njala/shared';
import { supabaseAdmin, supabaseForUser } from '../lib/supabase.js';
import { UnauthorizedError, ForbiddenError } from '../lib/errors.js';

/**
 * Verifies the bearer token against Supabase Auth, loads the caller's
 * profile + roles, and rejects anything but an ACTIVE account. Attaches
 * request.user and swaps request.db for a client scoped to the
 * caller's own token so downstream queries are still subject to RLS.
 */
export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new UnauthorizedError();
  }
  const accessToken = header.slice('Bearer '.length).trim();
  if (!accessToken) {
    throw new UnauthorizedError();
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
  if (authError || !authData?.user) {
    throw new UnauthorizedError('Invalid or expired session');
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, student_id, staff_id, full_name, status, deleted_at')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.deleted_at) {
    throw new UnauthorizedError('Account not found');
  }

  if (profile.status === 'SUSPENDED') {
    throw new ForbiddenError('This account has been suspended. Contact an administrator.');
  }
  if (profile.status === 'DEACTIVATED') {
    throw new ForbiddenError('This account has been deactivated.');
  }
  if (profile.status === 'PENDING') {
    throw new ForbiddenError('This account is awaiting activation.');
  }

  const { data: roleRows } = await supabaseAdmin
    .from('user_roles')
    .select('roles(name)')
    .eq('user_id', profile.id);

  const roles = (roleRows ?? [])
    .map((r) => (r as unknown as { roles: { name: AppRole } | null }).roles?.name)
    .filter((r): r is AppRole => Boolean(r));

  request.user = {
    id: profile.id,
    studentId: profile.student_id,
    staffId: profile.staff_id,
    fullName: profile.full_name,
    status: profile.status,
    roles,
    accessToken,
  };
  request.db = supabaseForUser(accessToken);
}

/** Attaches request.user when a valid token is present, but never rejects. */
export async function optionalAuthenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return;
  try {
    await authenticate(request, reply);
  } catch {
    // Anonymous access is fine for optional auth routes.
  }
}
