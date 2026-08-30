import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';

/**
 * These tests mock the Supabase boundary (../lib/supabase.js) rather
 * than hitting a real project, so they can run anywhere with no
 * network access. The goal is narrow but important: prove the
 * account-activation state machine is wired correctly end to end in
 * auth.service.ts, since a regression here (e.g. reverting to
 * `status: 'ACTIVE'` at signup) would silently disable the whole
 * "account activation" feature without any type error to catch it.
 */

interface FakeProfileRow {
  id: string;
  student_id: string | null;
  staff_id: string | null;
  contact_email?: string;
  full_name: string;
  status: string;
  failed_login_attempts: number;
  locked_until: string | null;
  deleted_at: string | null;
}

const insertedProfiles: Array<Record<string, unknown>> = [];
let profileTable: FakeProfileRow[] = [];

interface FakeQueryResult {
  data: unknown;
  error: null;
}

interface FakeQueryBuilder {
  select: () => FakeQueryBuilder;
  eq: (col: string, value: unknown) => FakeQueryBuilder;
  maybeSingle: () => Promise<FakeQueryResult>;
  single: () => Promise<FakeQueryResult>;
  insert: (row: Record<string, unknown>) => { error: null };
  update: (patch: Record<string, unknown>) => { eq: (col: string, value: unknown) => Promise<{ error: null }> };
}

function makeQueryBuilder(table: string): FakeQueryBuilder {
  const filters: Array<[string, unknown]> = [];

  const maybeSingle = async (): Promise<FakeQueryResult> => {
    if (table !== 'profiles') return { data: null, error: null };
    const row = profileTable.find((r) => filters.every(([col, value]) => (r as unknown as Record<string, unknown>)[col] === value));
    return { data: row ?? null, error: null };
  };

  const builder: FakeQueryBuilder = {
    select: () => builder,
    eq: (col, value) => {
      filters.push([col, value]);
      return builder;
    },
    maybeSingle,
    single: async () => {
      if (table === 'roles') return { data: { id: 'role-student-id' }, error: null };
      return maybeSingle();
    },
    insert: (row) => {
      if (table === 'profiles') {
        insertedProfiles.push(row);
        profileTable.push({
          id: row.id as string,
          student_id: row.student_id as string,
          staff_id: null,
          full_name: row.full_name as string,
          status: row.status as string,
          failed_login_attempts: 0,
          locked_until: null,
          deleted_at: null,
        });
      }
      return { error: null };
    },
    update: (patch) => ({
      eq: async (col, value) => {
        const row = profileTable.find((r) => (r as unknown as Record<string, unknown>)[col] === value);
        if (row) Object.assign(row, patch);
        return { error: null };
      },
    }),
  };
  return builder;
}

// Real credential checking happens inside Supabase Auth, entirely
// outside this fake - here, the single sentinel password
// 'wrong-password' simulates a failed sign-in (any other password
// "succeeds", matching every other test in this file that doesn't care
// about the actual password value) so the staff lockout tests below
// can drive repeated failures deterministically without needing a real
// project.
vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: (table: string) => makeQueryBuilder(table),
    auth: {
      admin: {
        createUser: vi.fn(async () => ({ data: { user: { id: 'new-user-id' } }, error: null })),
        deleteUser: vi.fn(async () => ({ error: null })),
      },
      signInWithPassword: vi.fn(async ({ email, password }: { email: string; password: string }) => {
        if (password === 'wrong-password') {
          return { data: { session: null, user: null }, error: { message: 'Invalid login credentials' } };
        }
        const matched = profileTable.find((p) => p.contact_email === email);
        return {
          data: {
            session: { access_token: 'at', refresh_token: 'rt', expires_at: 1 },
            user: { id: matched?.id ?? 'new-user-id' },
          },
          error: null,
        };
      }),
    },
  },
}));

vi.mock('../lib/email.js', () => ({ emailProvider: { send: vi.fn() } }));
vi.mock('./audit.service.js', () => ({ recordAuditEvent: vi.fn() }));

const { signupStudent, loginStudent, loginStaff } = await import('./auth.service.js');

describe('signupStudent (account activation)', () => {
  beforeEach(() => {
    insertedProfiles.length = 0;
    profileTable = [];
  });

  it('creates the profile as PENDING, never ACTIVE, so self-registration cannot skip activation', async () => {
    const result = await signupStudent({
      studentId: 'NJ2024TEST01',
      fullName: 'Test Student',
      password: 'Abcdefg1',
      programmeId: '11111111-1111-1111-1111-111111111111',
      entryYear: 2024,
    });

    expect(insertedProfiles[0]?.status).toBe('PENDING');
    expect(result.profile.status).toBe('PENDING');
  });
});

describe('loginStudent (account activation gate)', () => {
  beforeEach(() => {
    profileTable = [
      {
        id: 'pending-user',
        student_id: 'NJ2024PENDING',
        staff_id: null,
        full_name: 'Pending Student',
        status: 'PENDING',
        failed_login_attempts: 0,
        locked_until: null,
        deleted_at: null,
      },
    ];
  });

  it('rejects a PENDING account with a clear, non-generic message before attempting sign-in', async () => {
    await expect(loginStudent('NJ2024PENDING', 'whatever-password')).rejects.toBeInstanceOf(ForbiddenError);
    await expect(loginStudent('NJ2024PENDING', 'whatever-password')).rejects.toThrow(/awaiting activation/i);
  });
});

/**
 * Loop 11 (security hardening): loginStaff previously had NO
 * per-account lockout at all - only loginStudent did - which left
 * privileged accounts (LECTURER/LIBRARY_STAFF/ADMIN/SUPER_ADMIN)
 * protected only by the shared per-IP route rate limit. These tests
 * prove the same failed_login_attempts/locked_until mechanism now
 * genuinely applies to staff sign-in too.
 */
describe('loginStaff (account lockout, Loop 11)', () => {
  beforeEach(() => {
    profileTable = [
      {
        id: 'staff-user-1',
        student_id: null,
        staff_id: 'STF001',
        contact_email: 'lecturer@example.com',
        full_name: 'Test Lecturer',
        status: 'ACTIVE',
        failed_login_attempts: 0,
        locked_until: null,
        deleted_at: null,
      },
    ];
  });

  it('locks a staff account after 5 failed sign-in attempts, and rejects even a correct password while locked', async () => {
    for (let i = 0; i < 5; i++) {
      await expect(loginStaff('lecturer@example.com', 'wrong-password')).rejects.toBeInstanceOf(UnauthorizedError);
    }

    const row = profileTable.find((p) => p.id === 'staff-user-1');
    expect(row?.failed_login_attempts).toBe(5);
    expect(row?.locked_until).not.toBeNull();

    // Even the real, correct password must now be rejected - the
    // account is locked, not just the specific bad guesses.
    await expect(loginStaff('lecturer@example.com', 'correct-password')).rejects.toBeInstanceOf(ForbiddenError);
    await expect(loginStaff('lecturer@example.com', 'correct-password')).rejects.toThrow(/temporarily locked/i);
  });

  it('a successful staff login resets failed_login_attempts back to 0', async () => {
    await expect(loginStaff('lecturer@example.com', 'wrong-password')).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(loginStaff('lecturer@example.com', 'wrong-password')).rejects.toBeInstanceOf(UnauthorizedError);
    expect(profileTable[0]?.failed_login_attempts).toBe(2);

    await loginStaff('lecturer@example.com', 'correct-password');
    expect(profileTable[0]?.failed_login_attempts).toBe(0);
    expect(profileTable[0]?.locked_until).toBeNull();
  });
});
