import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

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
 * error handling.
 *
 * Every scenario here is a case where the API is expected to reject
 * the request during preHandler or before the handler touches the
 * database, so the only thing that needs mocking is the
 * authenticate() middleware's dependency on Supabase Auth + the
 * profiles/user_roles tables - never request.db itself. If a test
 * ever reaches request.db, the fake client below throws, which turns
 * "this test's assumption about where the rejection happens was
 * wrong" into a loud failure instead of a silently-wrong pass.
 */

interface FakeUser {
  id: string;
  studentId: string | null;
  staffId: string | null;
  fullName: string;
  status: string;
  roles: string[];
}

const FAKE_USERS: Record<string, FakeUser> = {
  'student-token': {
    id: '10000000-0000-0000-0000-000000000001',
    studentId: 'NJ2024STU01',
    staffId: null,
    fullName: 'Test Student',
    status: 'ACTIVE',
    roles: ['STUDENT'],
  },
  'lecturer1-token': {
    id: '20000000-0000-0000-0000-000000000001',
    studentId: null,
    staffId: 'STF0001',
    fullName: 'Test Lecturer One',
    status: 'ACTIVE',
    roles: ['LECTURER'],
  },
  'lecturer2-token': {
    id: '20000000-0000-0000-0000-000000000002',
    studentId: null,
    staffId: 'STF0002',
    fullName: 'Test Lecturer Two',
    status: 'ACTIVE',
    roles: ['LECTURER'],
  },
  'library-token': {
    id: '30000000-0000-0000-0000-000000000001',
    studentId: null,
    staffId: 'STF0003',
    fullName: 'Test Library Staff',
    status: 'ACTIVE',
    roles: ['LIBRARY_STAFF'],
  },
  'admin-token': {
    id: '40000000-0000-0000-0000-000000000001',
    studentId: null,
    staffId: 'STF0004',
    fullName: 'Test Admin (not super)',
    status: 'ACTIVE',
    roles: ['ADMIN'],
  },
  'super-admin-token': {
    id: '50000000-0000-0000-0000-000000000001',
    studentId: null,
    staffId: 'STF0005',
    fullName: 'Test Super Admin',
    status: 'ACTIVE',
    roles: ['SUPER_ADMIN'],
  },
};

function unexpectedDbCall(): never {
  throw new Error(
    'A test in app.rbac.test.ts reached request.db, meaning the API did not reject the request before touching the database. ' +
      'Every scenario in this file is expected to be rejected earlier (preHandler or an in-handler check before any DB call) - ' +
      'if this fires, either the authorization check regressed, or the test itself is asserting the wrong thing.',
  );
}

const unauthorizedDbStub = new Proxy(
  {},
  {
    get: () => unexpectedDbCall,
  },
);

// authenticate() makes two lookups against the real Supabase client:
// profiles (.maybeSingle()) and user_roles (an array via .eq()) - the
// fake `from()` below branches per table to match both shapes exactly.
vi.mock('./lib/supabase.js', async () => {
  const admin = {
    auth: {
      getUser: async (token: string) => {
        const user = FAKE_USERS[token];
        if (!user) return { data: { user: null }, error: { message: 'invalid token' } };
        return { data: { user: { id: user.id } }, error: null };
      },
    },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: (_col: string, value: string) => ({
              maybeSingle: async () => {
                const user = Object.values(FAKE_USERS).find((u) => u.id === value);
                if (!user) return { data: null, error: null };
                return {
                  data: {
                    id: user.id,
                    student_id: user.studentId,
                    staff_id: user.staffId,
                    full_name: user.fullName,
                    status: user.status,
                    deleted_at: null,
                  },
                  error: null,
                };
              },
            }),
          }),
        };
      }
      if (table === 'user_roles') {
        return {
          select: () => ({
            eq: async (_col: string, value: string) => {
              const user = Object.values(FAKE_USERS).find((u) => u.id === value);
              return { data: (user?.roles ?? []).map((name) => ({ roles: { name } })), error: null };
            },
          }),
        };
      }
      return unauthorizedDbStub;
    },
  };
  return { supabaseAdmin: admin, supabaseAnon: unauthorizedDbStub, supabaseForUser: () => unauthorizedDbStub };
});

const { buildApp } = await import('./app.js');

function auth(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}

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
