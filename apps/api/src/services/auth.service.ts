import type { AppRole, StudentSignupInput } from '@njala/shared';
import { supabaseAdmin } from '../lib/supabase.js';
import { env } from '../config/env.js';
import { emailProvider } from '../lib/email.js';
import { recordAuditEvent } from './audit.service.js';
import { ConflictError, ForbiddenError, UnauthorizedError, ValidationError } from '../lib/errors.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

/**
 * Supabase Auth requires an email-shaped identifier. Students log in
 * with a Student ID, so we synthesize
 * "<student-id>@<STUDENT_AUTH_IDENTIFIER_DOMAIN>" purely as an internal
 * GoTrue identifier. It is never surfaced to the client, never used to
 * send real mail, and the domain is configured to something that
 * cannot resolve to a real mailbox (see .env.example).
 */
function studentAuthIdentifier(studentId: string): string {
  return `${studentId.toLowerCase()}@${env.STUDENT_AUTH_IDENTIFIER_DOMAIN}`;
}

interface AuthResult {
  session: { accessToken: string; refreshToken: string; expiresAt: number };
  profile: {
    id: string;
    studentId: string | null;
    staffId: string | null;
    fullName: string;
    status: string;
    roles: AppRole[];
  };
}

async function loadRoles(userId: string): Promise<AppRole[]> {
  const { data } = await supabaseAdmin.from('user_roles').select('roles(name)').eq('user_id', userId);
  return (data ?? [])
    .map((r) => (r as unknown as { roles: { name: AppRole } | null }).roles?.name)
    .filter((r): r is AppRole => Boolean(r));
}

/**
 * Self-service registration. Always creates exactly a STUDENT account
 * regardless of anything the client sends - there is no "role" field
 * accepted here at all. Privileged accounts can only be provisioned
 * through the admin-only staff-account endpoint.
 */
export async function signupStudent(input: StudentSignupInput): Promise<AuthResult> {
  const { data: existing } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('student_id', input.studentId)
    .maybeSingle();
  if (existing) {
    throw new ConflictError('This Student ID is already registered');
  }

  const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email: studentAuthIdentifier(input.studentId),
    password: input.password,
    email_confirm: true,
  });
  if (createError || !created?.user) {
    throw new ValidationError(createError?.message ?? 'Could not create account');
  }

  const { error: profileError } = await supabaseAdmin.from('profiles').insert({
    id: created.user.id,
    student_id: input.studentId,
    full_name: input.fullName,
    contact_email: input.contactEmail ?? null,
    programme_id: input.programmeId,
    entry_year: input.entryYear,
    // Self-registration cannot verify a Student ID against the
    // institution's real roster, so new accounts start PENDING and
    // require a LIBRARY_STAFF/ADMIN to activate them (PATCH
    // /api/admin/users/:id/status). Both loginStudent() and the
    // authenticate() middleware reject non-ACTIVE accounts.
    status: 'PENDING',
  });

  if (profileError) {
    // Compensating action: don't leave an orphaned auth user behind.
    await supabaseAdmin.auth.admin.deleteUser(created.user.id);
    throw new ValidationError(`Could not create profile: ${profileError.message}`);
  }

  const { data: studentRole } = await supabaseAdmin.from('roles').select('id').eq('name', 'STUDENT').single();
  await supabaseAdmin.from('user_roles').insert({ user_id: created.user.id, role_id: studentRole!.id });

  // Signed in immediately so the frontend has a session to show the
  // "your account is pending activation" screen with (and so the
  // session is ready to go the moment an admin activates the
  // account) - but every subsequent authenticated API call will be
  // rejected by authenticate() until an admin flips the status to
  // ACTIVE, exactly as it would be for any other PENDING account.
  const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
    email: studentAuthIdentifier(input.studentId),
    password: input.password,
  });
  if (signInError || !signIn.session) {
    throw new ValidationError('Account created but automatic sign-in failed; please log in.');
  }

  await recordAuditEvent({ actorId: created.user.id, action: 'user.signup', entityType: 'profiles', entityId: created.user.id });

  return {
    session: {
      accessToken: signIn.session.access_token,
      refreshToken: signIn.session.refresh_token,
      expiresAt: signIn.session.expires_at ?? 0,
    },
    profile: {
      id: created.user.id,
      studentId: input.studentId,
      staffId: null,
      fullName: input.fullName,
      status: 'PENDING',
      roles: ['STUDENT'],
    },
  };
}

async function registerFailedAttempt(profileId: string, currentAttempts: number): Promise<void> {
  const attempts = currentAttempts + 1;
  const lockedUntil = attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString() : null;
  await supabaseAdmin
    .from('profiles')
    .update({ failed_login_attempts: attempts, locked_until: lockedUntil })
    .eq('id', profileId);
}

async function finalizeSuccessfulLogin(profileId: string): Promise<void> {
  await supabaseAdmin
    .from('profiles')
    .update({ failed_login_attempts: 0, locked_until: null, last_login_at: new Date().toISOString() })
    .eq('id', profileId);
}

export async function loginStudent(studentId: string, password: string): Promise<AuthResult> {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, student_id, staff_id, full_name, status, failed_login_attempts, locked_until, deleted_at')
    .eq('student_id', studentId)
    .maybeSingle();

  // Generic message whether the ID doesn't exist or the password is
  // wrong - avoids confirming which Student IDs are registered.
  const invalidCredentials = () => new UnauthorizedError('Invalid Student ID or password');

  if (!profile || profile.deleted_at) throw invalidCredentials();

  if (profile.locked_until && new Date(profile.locked_until) > new Date()) {
    throw new ForbiddenError('This account is temporarily locked due to repeated failed sign-in attempts. Try again later.');
  }
  if (profile.status === 'SUSPENDED') throw new ForbiddenError('This account has been suspended.');
  if (profile.status === 'DEACTIVATED') throw new ForbiddenError('This account has been deactivated.');
  if (profile.status === 'PENDING') {
    throw new ForbiddenError('This account is awaiting activation by an administrator or library staff member.');
  }

  const { data: signIn, error } = await supabaseAdmin.auth.signInWithPassword({
    email: studentAuthIdentifier(studentId),
    password,
  });

  if (error || !signIn.session) {
    await registerFailedAttempt(profile.id, profile.failed_login_attempts);
    await recordAuditEvent({ actorId: profile.id, action: 'auth.login_failed', entityType: 'profiles', entityId: profile.id });
    throw invalidCredentials();
  }

  await finalizeSuccessfulLogin(profile.id);
  await recordAuditEvent({ actorId: profile.id, action: 'auth.login_success', entityType: 'profiles', entityId: profile.id });

  const roles = await loadRoles(profile.id);
  return {
    session: {
      accessToken: signIn.session.access_token,
      refreshToken: signIn.session.refresh_token,
      expiresAt: signIn.session.expires_at ?? 0,
    },
    profile: {
      id: profile.id,
      studentId: profile.student_id,
      staffId: profile.staff_id,
      fullName: profile.full_name,
      status: profile.status,
      roles,
    },
  };
}

export async function loginStaff(email: string, password: string): Promise<AuthResult> {
  // Staff accounts (LECTURER/LIBRARY_STAFF/ADMIN/SUPER_ADMIN - the most
  // privileged accounts on the platform) previously had NO per-account
  // lockout at all, unlike loginStudent below - only the shared per-IP
  // route rate limit (10/minute) stood between an attacker and
  // unlimited password guesses against, say, a SUPER_ADMIN account, as
  // long as they stayed under that per-IP budget (or spread guesses
  // across IPs). `contact_email` is set to the same value as the
  // Supabase Auth identifier at staff-account creation time (see
  // admin.routes.ts's `/staff` provisioning route), so it's used here
  // to look the profile up *before* attempting sign-in, mirroring
  // loginStudent's pattern - if it's ever edited to diverge from the
  // real Auth email, this just degrades to "no lockout tracked" rather
  // than blocking a legitimate login.
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, student_id, staff_id, full_name, status, failed_login_attempts, locked_until, deleted_at')
    .eq('contact_email', email)
    .maybeSingle();

  const invalidCredentials = () => new UnauthorizedError('Invalid email or password');

  if (profile?.locked_until && new Date(profile.locked_until) > new Date()) {
    throw new ForbiddenError('This account is temporarily locked due to repeated failed sign-in attempts. Try again later.');
  }

  const { data: signIn, error } = await supabaseAdmin.auth.signInWithPassword({ email, password });
  if (error || !signIn.session || !signIn.user) {
    if (profile && !profile.deleted_at) {
      await registerFailedAttempt(profile.id, profile.failed_login_attempts);
      await recordAuditEvent({ actorId: profile.id, action: 'auth.login_failed', entityType: 'profiles', entityId: profile.id });
    }
    throw invalidCredentials();
  }

  const { data: confirmedProfile } = await supabaseAdmin
    .from('profiles')
    .select('id, student_id, staff_id, full_name, status, deleted_at')
    .eq('id', signIn.user.id)
    .maybeSingle();

  if (!confirmedProfile || confirmedProfile.deleted_at) throw invalidCredentials();
  if (confirmedProfile.status !== 'ACTIVE') throw new ForbiddenError('This account is not active. Contact an administrator.');

  await finalizeSuccessfulLogin(confirmedProfile.id);
  await recordAuditEvent({ actorId: confirmedProfile.id, action: 'auth.login_success', entityType: 'profiles', entityId: confirmedProfile.id });

  const roles = await loadRoles(confirmedProfile.id);
  return {
    session: {
      accessToken: signIn.session.access_token,
      refreshToken: signIn.session.refresh_token,
      expiresAt: signIn.session.expires_at ?? 0,
    },
    profile: {
      id: confirmedProfile.id,
      studentId: confirmedProfile.student_id,
      staffId: confirmedProfile.staff_id,
      fullName: confirmedProfile.full_name,
      status: confirmedProfile.status,
      roles,
    },
  };
}

/**
 * Staff accounts use their real email as the Supabase Auth identifier,
 * so Supabase's own recovery-link flow works unmodified: the frontend
 * calls supabase.auth.resetPasswordForEmail() directly and later
 * exchanges the recovery token for a session client-side. For students
 * (whose Auth identifier is synthetic), we generate the recovery link
 * server-side via the Admin API and deliver it to their optional
 * contact_email instead.
 */
export async function requestStudentPasswordReset(studentId: string): Promise<void> {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('id, contact_email')
    .eq('student_id', studentId)
    .maybeSingle();

  // Always behave the same way whether or not the account/email exists,
  // to avoid leaking which Student IDs are registered.
  if (!profile?.contact_email) return;

  const { data: link } = await supabaseAdmin.auth.admin.generateLink({
    type: 'recovery',
    email: studentAuthIdentifier(studentId),
  });

  if (link?.properties?.action_link) {
    await emailProvider.send({
      to: profile.contact_email,
      subject: 'Reset your Njala Past Papers password',
      body: `Use this link to reset your password: ${link.properties.action_link}\nThis link expires shortly and can only be used once.`,
    });
  }
}
