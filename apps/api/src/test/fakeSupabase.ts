/**
 * Shared fake Supabase boundary for HTTP-level integration tests that
 * boot the real app (buildApp()) and drive it with app.inject(). Only
 * mocks what authenticate() needs (Supabase Auth's getUser() plus the
 * profiles/user_roles lookups) - every scenario these tests cover is
 * expected to be rejected during preHandler or before the handler
 * touches request.db, so request.db/supabaseAdmin table access beyond
 * that is intentionally left throwing (see unauthorizedDbStub) to turn
 * a wrong assumption about "where this gets rejected" into a loud
 * failure instead of a silently-wrong pass.
 *
 * Usage in a test file:
 *
 *   vi.mock('../lib/supabase.js', async () => {
 *     const { createSupabaseMock } = await import('./test/fakeSupabase.js');
 *     return createSupabaseMock();
 *   });
 */

export interface FakeUser {
  id: string;
  studentId: string | null;
  staffId: string | null;
  fullName: string;
  status: string;
  roles: string[];
}

export const FAKE_USERS: Record<string, FakeUser> = {
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

export function unexpectedDbCall(): never {
  throw new Error(
    'A fake-Supabase-backed integration test reached request.db/supabaseAdmin beyond the profiles/user_roles ' +
      'lookups authenticate() needs. Every scenario using this mock is expected to be rejected earlier - if this ' +
      'fires, either an authorization check regressed, or the test itself is asserting the wrong thing.',
  );
}

export const unauthorizedDbStub = new Proxy(
  {},
  {
    get: () => unexpectedDbCall,
  },
);

export function auth(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}

export function createSupabaseMock() {
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
}
