import type { FastifyInstance } from 'fastify';
import { studentLoginSchema, staffLoginSchema, studentSignupSchema, passwordResetRequestSchema } from '@njala/shared';
import { loginStaff, loginStudent, requestStudentPasswordReset, signupStudent } from '../services/auth.service.js';
import { authenticate } from '../middleware/authenticate.js';
import { supabaseAdmin } from '../lib/supabase.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/signup', { schema: { tags: ['auth'], summary: 'Student self-registration (STUDENT role only)' } }, async (request, reply) => {
    const input = studentSignupSchema.parse(request.body);
    const result = await signupStudent(input);
    reply.status(201);
    return result;
  });

  app.post('/login', { schema: { tags: ['auth'], summary: 'Student login with Student ID + password' } }, async (request) => {
    const input = studentLoginSchema.parse(request.body);
    return loginStudent(input.studentId, input.password);
  });

  app.post('/staff-login', { schema: { tags: ['auth'], summary: 'Staff login with email + password' } }, async (request) => {
    const input = staffLoginSchema.parse(request.body);
    return loginStaff(input.email, input.password);
  });

  app.post('/logout', { preHandler: authenticate, schema: { tags: ['auth'], summary: 'Invalidate the current session' } }, async (request, reply) => {
    await supabaseAdmin.auth.admin.signOut(request.user!.accessToken);
    reply.status(204);
  });

  app.get('/me', { preHandler: authenticate, schema: { tags: ['auth'], summary: 'Current authenticated user' } }, async (request) => {
    return { user: request.user };
  });

  app.post(
    '/password-reset/request',
    { schema: { tags: ['auth'], summary: 'Request a password reset link (student, via contact email on file)' } },
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
