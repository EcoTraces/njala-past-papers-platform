import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError } from '../lib/errors.js';

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
  student_id: string;
  staff_id: string | null;
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

vi.mock('../lib/supabase.js', () => ({
  supabaseAdmin: {
    from: (table: string) => makeQueryBuilder(table),
    auth: {
      admin: {
        createUser: vi.fn(async () => ({ data: { user: { id: 'new-user-id' } }, error: null })),
        deleteUser: vi.fn(async () => ({ error: null })),
      },
      signInWithPassword: vi.fn(async () => ({
        data: { session: { access_token: 'at', refresh_token: 'rt', expires_at: 1 } },
        session: { access_token: 'at', refresh_token: 'rt', expires_at: 1 },
        error: null,
      })),
    },
  },
}));

vi.mock('../lib/email.js', () => ({ emailProvider: { send: vi.fn() } }));
vi.mock('./audit.service.js', () => ({ recordAuditEvent: vi.fn() }));

const { signupStudent, loginStudent } = await import('./auth.service.js');

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
