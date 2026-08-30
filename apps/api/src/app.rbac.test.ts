import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { FAKE_USERS, auth } from './test/fakeSupabase.js';

/**
 * Integration tests that hit the real Fastify app end to end
 * (routing → preHandler chain → handler) via app.inject(), exactly as
 * an attacker calling the API directly - never through the frontend -
 * would. This is deliberately a different kind of test from
 * middleware/authorize.test.ts (which unit-tests requireRole/
 * requirePermission against a hand-built fake request) and from
 * supabase/tests/rls_rbac_assertions.sql (which proves the database
 * itself is the final backstop). This file proves the middle layer -
 * the API's own RBAC enforcement - actually rejects requests when
 * wired into real route registration, real Zod parsing, and real
 * error handling. See src/test/fakeSupabase.ts for what is and isn't
 * mocked and why.
 */

vi.mock('./lib/supabase.js', async () => {
  const { createSupabaseMock } = await import('./test/fakeSupabase.js');
  return createSupabaseMock();
});

const { buildApp } = await import('./app.js');

describe('RBAC enforced end to end through the real HTTP pipeline (no frontend involved)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects any request to an admin endpoint with no token at all', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/users' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a STUDENT calling GET /api/admin/users (student accessing an admin endpoint)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/users', headers: auth('student-token') });
    expect(res.statusCode).toBe(403);
  });

  it('rejects a STUDENT calling PATCH /api/admin/users/:id/status (student modifying another user\'s account)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/admin/users/${FAKE_USERS['lecturer1-token']!.id}/status`,
      headers: auth('student-token'),
      payload: { status: 'SUSPENDED' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects a STUDENT calling GET /api/admin/audit-logs', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/audit-logs', headers: auth('student-token') });
    expect(res.statusCode).toBe(403);
  });

  it('rejects a LECTURER modifying a course (an unauthorized administrative action, not just an unauthorized course)', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/courses/11111111-1111-1111-1111-111111111111',
      headers: auth('lecturer1-token'),
      payload: { title: 'Hacked title' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects a LECTURER creating a new course', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/courses',
      headers: auth('lecturer1-token'),
      payload: { departmentId: '11111111-1111-1111-1111-111111111111', code: 'HAX101', title: 'Hacked course' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects a LECTURER creating a new faculty (a distinct, unrelated lecturer never granted this)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/faculties',
      headers: auth('lecturer2-token'),
      payload: { name: 'Hacked Faculty', code: 'HAX' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects LIBRARY_STAFF reading admin-only system settings', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/system-settings', headers: auth('library-token') });
    expect(res.statusCode).toBe(403);
  });

  it('rejects LIBRARY_STAFF provisioning a staff account (an ADMIN-only action)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/staff',
      headers: auth('library-token'),
      payload: { fullName: 'x', email: 'x@example.com', staffId: 'X1', role: 'LECTURER' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects role escalation: a plain ADMIN cannot provision a SUPER_ADMIN via POST /api/admin/staff', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/staff',
      headers: auth('admin-token'),
      payload: { fullName: 'Evil', email: 'evil@example.com', staffId: 'EVIL1', role: 'SUPER_ADMIN' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ error: { message: expect.stringMatching(/SUPER_ADMIN/i) } });
  });

  it('rejects role escalation via manipulated request parameters: a plain ADMIN cannot grant SUPER_ADMIN via POST /api/admin/users/:id/roles', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${FAKE_USERS['student-token']!.id}/roles`,
      headers: auth('admin-token'),
      payload: { role: 'SUPER_ADMIN' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects role escalation via manipulated request parameters: a plain ADMIN cannot revoke SUPER_ADMIN via DELETE /api/admin/users/:id/roles/:role', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/admin/users/${FAKE_USERS['super-admin-token']!.id}/roles/SUPER_ADMIN`,
      headers: auth('admin-token'),
    });
    expect(res.statusCode).toBe(403);
  });

  it('allows a SUPER_ADMIN to pass the same escalation check a plain ADMIN was rejected by (proves the check is role-specific, not a blanket admin lockout)', async () => {
    // Reaches the DB layer next (role lookup + insert), which this
    // suite intentionally does not mock - so a request.db call is
    // expected here and is what proves the authorization check itself
    // passed. Assert on the specific failure mode instead of asserting
    // a 2xx, to keep this test from depending on unrelated DB mocking.
    const res = await app.inject({
      method: 'POST',
      url: `/api/admin/users/${FAKE_USERS['student-token']!.id}/roles`,
      headers: auth('super-admin-token'),
      payload: { role: 'SUPER_ADMIN' },
    });
    expect(res.statusCode).not.toBe(403);
  });

  it('rejects a request with no Authorization header from ever reaching a protected handler (manipulated/missing parameters cannot substitute for a session)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/users/00000000-0000-0000-0000-000000000000/roles',
      payload: { role: 'ADMIN' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an unrecognized/forged bearer token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/admin/users', headers: auth('totally-made-up-token') });
    expect(res.statusCode).toBe(401);
  });
});
