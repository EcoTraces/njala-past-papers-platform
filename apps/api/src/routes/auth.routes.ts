import type { FastifyInstance } from 'fastify';
import { studentLoginSchema, staffLoginSchema, studentSignupSchema, passwordResetRequestSchema } from '@njala/shared';
import { loginStaff, loginStudent, requestStudentPasswordReset, signupStudent } from '../services/auth.service.js';
import { authenticate } from '../middleware/authenticate.js';
import { supabaseAdmin } from '../lib/supabase.js';

// Stricter than the API-wide default (see app.ts) - these are the
// endpoints a credential-stuffing/enumeration attack would actually
// hit, so they get their own tighter per-IP budget on top of the
// global one. Per-account lockout (profiles.failed_login_attempts,
// see auth.service.ts) is the other half of this defense: an attacker
// distributing guesses across many Student IDs from one IP is capped
// here; one who distributes IPs to dodge this is capped per-account.
const LOGIN_RATE_LIMIT = { max: 10, timeWindow: '1 minute' };
const SIGNUP_RATE_LIMIT = { max: 5, timeWindow: '1 minute' };
const PASSWORD_RESET_RATE_LIMIT = { max: 5, timeWindow: '1 minute' };

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/signup',
    { config: { rateLimit: SIGNUP_RATE_LIMIT }, schema: { tags: ['auth'], summary: 'Student self-registration (STUDENT role only)' } },
    async (request, reply) => {
      const input = studentSignupSchema.parse(request.body);
      const result = await signupStudent(input);
      reply.status(201);
      return result;
    },
  );

  app.post(
    '/login',
    { config: { rateLimit: LOGIN_RATE_LIMIT }, schema: { tags: ['auth'], summary: 'Student login with Student ID + password' } },
    async (request) => {
      const input = studentLoginSchema.parse(request.body);
      return loginStudent(input.studentId, input.password);
    },
  );

  app.post(
    '/staff-login',
    { config: { rateLimit: LOGIN_RATE_LIMIT }, schema: { tags: ['auth'], summary: 'Staff login with email + password' } },
    async (request) => {
      const input = staffLoginSchema.parse(request.body);
      return loginStaff(input.email, input.password);
    },
  );

  app.post('/logout', { preHandler: authenticate, schema: { tags: ['auth'], summary: 'Invalidate the current session' } }, async (request, reply) => {
    await supabaseAdmin.auth.admin.signOut(request.user!.accessToken);
    reply.status(204);
  });

  app.get('/me', { preHandler: authenticate, schema: { tags: ['auth'], summary: 'Current authenticated user' } }, async (request) => {
    return { user: request.user };
  });

  app.post(
    '/password-reset/request',
    {
      config: { rateLimit: PASSWORD_RESET_RATE_LIMIT },
      schema: { tags: ['auth'], summary: 'Request a password reset link (student, via contact email on file)' },
    },
    async (request, reply) => {
      const input = passwordResetRequestSchema.parse(request.body);
      if (input.studentId) {
        await requestStudentPasswordReset(input.studentId);
      }
      // Staff use supabase.auth.resetPasswordForEmail() directly from
      // the client - their Auth identifier IS their real email.
      reply.status(202);
      return { message: 'If an account matching that information exists, reset instructions have been sent.' };
    },
  );
}
