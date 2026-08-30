import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * HTTP-level tests for the Loop 10 dashboard/analytics additions.
 * Focuses on the conditional-query branches that are easy to get
 * wrong silently (no query builder failure, just a wrong or omitted
 * result): a lecturer with zero assigned courses must not query
 * practice_sessions with an empty `.in()` list, a student with no
 * department must get an empty (not erroring) recommendations list,
 * a failed admin_dashboard_stats() RPC must surface as a real error
 * rather than dashboard fields silently defaulting to zero, and the
 * /analytics upload counts must come from a real count query rather
 * than the length of a capped row fetch.
 */

type Row = Record<string, unknown>;

function makeFakeDb(tables: Record<string, Row[]>, rpcResult: { data: Row[] | null; error: { message: string } | null } = { data: [], error: null }) {
  const queriedTables: string[] = [];

  function selectBuilder(table: string, opts?: { count?: string; head?: boolean }) {
    const filters: Array<(r: Row) => boolean> = [];
    let limitN: number | undefined;
    let orderCol: string | undefined;
    let orderAsc = true;

    const rows = tables[table] ?? [];

    const compute = () => {
      let result = rows.filter((r) => filters.every((f) => f(r)));
      if (orderCol) {
        const col = orderCol;
        result = [...result].sort((a, b) => {
          const av = a[col] as string | number;
          const bv = b[col] as string | number;
          if (av === bv) return 0;
          return (av > bv ? 1 : -1) * (orderAsc ? 1 : -1);
        });
      }
      const count = result.length;
      if (limitN !== undefined) result = result.slice(0, limitN);
      return { result, count };
    };

    const builder: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return builder;
      },
      in(col: string, vals: unknown[]) {
        filters.push((r) => vals.includes(r[col]));
        return builder;
      },
      gte(col: string, val: unknown) {
        filters.push((r) => (r[col] as string) >= (val as string));
        return builder;
      },
      order(col: string, o?: { ascending?: boolean }) {
        orderCol = col;
        orderAsc = o?.ascending !== false;
        return builder;
      },
      limit(n: number) {
        limitN = n;
        return builder;
      },
      async maybeSingle() {
        const { result } = compute();
        return { data: result[0] ?? null, error: null };
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        const { result, count } = compute();
        const payload = opts?.head ? { data: null, error: null, count } : { data: result, error: null, count: opts?.count ? count : undefined };
        return Promise.resolve(payload).then(onFulfilled, onRejected);
      },
    };
    return builder;
  }

  return {
    queriedTables,
    from(table: string) {
      queriedTables.push(table);
      return {
        select: (_cols?: string, opts?: { count?: string; head?: boolean }) => selectBuilder(table, opts),
      };
    },
    async rpc(_fn: string) {
      return rpcResult;
    },
  };
}

vi.mock('./services/audit.service.js', () => ({ recordAuditEvent: vi.fn(async () => undefined) }));
vi.mock('./services/notifications.service.js', () => ({ notifyUser: vi.fn(async () => undefined) }));

describe('dashboard routes (Loop 10)', () => {
  afterEach(() => {
    vi.doUnmock('./middleware/authenticate.js');
    vi.resetModules();
  });

  it('lecturer with zero assigned courses gets a zeroed practiceStatistics and never queries practice_sessions with an empty course list', async () => {
    const fakeDb = makeFakeDb({
      examination_papers: [],
      course_lecturers: [], // no courses assigned
      questions: [],
    });
    vi.doMock('./middleware/authenticate.js', () => ({
      authenticate: async (request: { user?: unknown; db?: unknown }) => {
        request.user = { id: '20000000-0000-0000-0000-000000000001', roles: ['LECTURER'] };
        request.db = fakeDb;
      },
    }));
    vi.resetModules();
    const { buildApp: buildFreshApp } = await import('./app.js');
    const freshApp = await buildFreshApp();
    await freshApp.ready();

    const res = await freshApp.inject({ method: 'GET', url: '/api/lecturer/dashboard', headers: { authorization: 'Bearer x' } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.practiceStatistics).toEqual({ totalAttempts: 0, averagePercentage: null });
    expect(fakeDb.queriedTables).not.toContain('practice_sessions');

    await freshApp.close();
  });

  it('lecturer with assigned courses gets a real average computed from SUBMITTED practice_sessions in those courses', async () => {
    const fakeDb = makeFakeDb({
      examination_papers: [],
      course_lecturers: [
        {
          lecturer_id: '20000000-0000-0000-0000-000000000001',
          courses: { id: 'c0000000-0000-0000-0000-000000000001', code: 'CSC101', title: 'Intro' },
        },
      ],
      questions: [],
      practice_sessions: [
        { course_id: 'c0000000-0000-0000-0000-000000000001', status: 'SUBMITTED', percentage: 50 },
        { course_id: 'c0000000-0000-0000-0000-000000000001', status: 'SUBMITTED', percentage: 100 },
        { course_id: 'c0000000-0000-0000-0000-000000000002', status: 'SUBMITTED', percentage: 0 }, // different course - must be excluded
      ],
    });
    vi.doMock('./middleware/authenticate.js', () => ({
      authenticate: async (request: { user?: unknown; db?: unknown }) => {
        request.user = { id: '20000000-0000-0000-0000-000000000001', roles: ['LECTURER'] };
        request.db = fakeDb;
      },
    }));
    vi.resetModules();
    const { buildApp: buildFreshApp } = await import('./app.js');
    const freshApp = await buildFreshApp();
    await freshApp.ready();

    const res = await freshApp.inject({ method: 'GET', url: '/api/lecturer/dashboard', headers: { authorization: 'Bearer x' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().practiceStatistics).toEqual({ totalAttempts: 2, averagePercentage: 75 });

    await freshApp.close();
  });

  it('student with no department_id gets empty recommendations, not an error', async () => {
    const fakeDb = makeFakeDb({
      examination_papers: [],
      bookmarks: [],
      practice_sessions: [],
      notifications: [],
      profiles: [{ id: '10000000-0000-0000-0000-000000000001', department_id: null }],
    });
    vi.doMock('./middleware/authenticate.js', () => ({
      authenticate: async (request: { user?: unknown; db?: unknown }) => {
        request.user = { id: '10000000-0000-0000-0000-000000000001', roles: ['STUDENT'] };
        request.db = fakeDb;
      },
    }));
    vi.resetModules();
    const { buildApp: buildFreshApp } = await import('./app.js');
    const freshApp = await buildFreshApp();
    await freshApp.ready();

    const res = await freshApp.inject({ method: 'GET', url: '/api/student/dashboard', headers: { authorization: 'Bearer x' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().recommendations).toEqual([]);

    await freshApp.close();
  });

  it('admin dashboard surfaces a real 500 when admin_dashboard_stats() errors, instead of silently defaulting stats to zero', async () => {
    const fakeDb = makeFakeDb(
      {
        profiles: [],
        examination_papers: [],
        courses: [],
        audit_logs: [],
      },
      { data: null, error: { message: 'aggregate query failed' } },
    );
    vi.doMock('./middleware/authenticate.js', () => ({
      authenticate: async (request: { user?: unknown; db?: unknown }) => {
        request.user = { id: '40000000-0000-0000-0000-000000000001', roles: ['ADMIN'] };
        request.db = fakeDb;
      },
    }));
    vi.resetModules();
    const { buildApp: buildFreshApp } = await import('./app.js');
    const freshApp = await buildFreshApp();
    await freshApp.ready();

    const res = await freshApp.inject({ method: 'GET', url: '/api/admin/dashboard', headers: { authorization: 'Bearer x' } });
    expect(res.statusCode).toBe(500);

    await freshApp.close();
  });

  it('/analytics reports real total/30-day upload counts via a count query, not the length of a capped row fetch', async () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      id: `p${i}`,
      title: `Paper ${i}`,
      status: 'PUBLISHED',
      view_count: i,
      download_count: i,
      created_at: i < 5 ? '2020-01-01T00:00:00Z' : new Date().toISOString(),
    }));
    const fakeDb = makeFakeDb({ examination_papers: rows });
    vi.doMock('./middleware/authenticate.js', () => ({
      authenticate: async (request: { user?: unknown; db?: unknown }) => {
        request.user = { id: '30000000-0000-0000-0000-000000000001', roles: ['LIBRARY_STAFF'] };
        request.db = fakeDb;
      },
    }));
    vi.resetModules();
    const { buildApp: buildFreshApp } = await import('./app.js');
    const freshApp = await buildFreshApp();
    await freshApp.ready();

    const res = await freshApp.inject({ method: 'GET', url: '/api/analytics', headers: { authorization: 'Bearer x' } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totalUploads).toBe(12);
    expect(body.uploadsLast30Days).toBe(7);

    await freshApp.close();
  });
});
