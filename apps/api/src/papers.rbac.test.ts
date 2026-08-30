import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { auth } from './test/fakeSupabase.js';

/**
 * Extends the HTTP-level RBAC integration coverage (see
 * app.rbac.test.ts for the pattern and src/test/fakeSupabase.ts for
 * what's mocked) to the paper workflow, question bank, and practice
 * modules - the core domain objects, and the ones with the most
 * state-dependent authorization (who may move a paper through which
 * workflow transition, who may verify a question, who may manually
 * mark a subjective answer).
 */

vi.mock('./lib/supabase.js', async () => {
  const { createSupabaseMock } = await import('./test/fakeSupabase.js');
  return createSupabaseMock();
});

const { buildApp } = await import('./app.js');

describe('paper workflow / question bank / practice RBAC, end to end through the real HTTP pipeline', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects a STUDENT uploading a paper (POST /api/papers is LECTURER/LIBRARY_STAFF/ADMIN only)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/papers',
      headers: { ...auth('student-token'), 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects a STUDENT approving a paper (POST /api/papers/:id/approve is LIBRARY_STAFF/ADMIN only)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/papers/11111111-1111-1111-1111-111111111111/approve',
      headers: auth('student-token'),
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects a LECTURER approving a paper (only LIBRARY_STAFF/ADMIN drive that step, even for their own course)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/papers/11111111-1111-1111-1111-111111111111/approve',
      headers: auth('lecturer1-token'),
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects a LECTURER rejecting a paper (only LIBRARY_STAFF/ADMIN drive that step)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/papers/11111111-1111-1111-1111-111111111111/reject',
      headers: auth('lecturer1-token'),
      payload: { reason: 'not good enough' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects a LECTURER archiving a published paper', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/papers/11111111-1111-1111-1111-111111111111/archive',
      headers: auth('lecturer1-token'),
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects a LIBRARY_STAFF member permanently deleting a paper (ADMIN/SUPER_ADMIN only)', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/papers/11111111-1111-1111-1111-111111111111',
      headers: auth('library-token'),
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects a STUDENT replacing a paper\'s file (POST /api/papers/:id/versions is staff-upload-role only)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/papers/11111111-1111-1111-1111-111111111111/versions',
      headers: { ...auth('student-token'), 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects a STUDENT creating a question (POST /api/questions is LECTURER/LIBRARY_STAFF/ADMIN only)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/questions',
      headers: auth('student-token'),
      payload: {},
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects a STUDENT verifying a question (POST /api/questions/:id/verify is LIBRARY_STAFF/ADMIN only)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/questions/11111111-1111-1111-1111-111111111111/verify',
      headers: auth('student-token'),
      payload: { approve: true },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects a LECTURER verifying a question (verification is a library/admin action, not the author\'s)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/questions/11111111-1111-1111-1111-111111111111/verify',
      headers: auth('lecturer1-token'),
      payload: { approve: true },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects a STUDENT manually marking a practice answer (POST /api/practice/answers/:id/mark is staff only)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/practice/answers/11111111-1111-1111-1111-111111111111/mark',
      headers: auth('student-token'),
      payload: { marksAwarded: 5 },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects an unauthenticated request to start a practice session (practice requires a session, not just a role check - but still requires one)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/practice/sessions', payload: {} });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an unauthenticated request to the paper search endpoint (no anonymous browsing in this deployment)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/papers' });
    expect(res.statusCode).toBe(401);
  });
});
