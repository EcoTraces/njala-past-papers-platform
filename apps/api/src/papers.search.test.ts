import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * HTTP-level tests for GET /api/papers's two Loop 08 fixes:
 * courseCode was accepted by the query schema but silently never
 * applied as a filter (a typo'd/wrong code returned the full
 * unfiltered list, not zero results - a real discoverability/
 * correctness bug), and sort=relevance fell through to a `recent`
 * sort because the switch statement had no case for it at all. Uses a
 * small in-memory fake (not the auth-only fakeSupabase.ts, since these
 * scenarios are expected to actually reach request.db) rather than a
 * real Postgres instance - the RPC's own SQL correctness (ranking,
 * RLS-via-SECURITY-INVOKER) is proven separately in
 * supabase/tests/rls_rbac_assertions.sql against a real database.
 */

type Row = Record<string, unknown>;

function makeFakeDb() {
  const courses: Row[] = [
    { id: 'c0000000-0000-0000-0000-000000000001', code: 'CSC101' },
    { id: 'c0000000-0000-0000-0000-000000000002', code: 'MTH201' },
  ];
  const papers: Row[] = [
    { id: 'p0000000-0000-0000-0000-000000000001', title: 'CSC101 Final', course_id: 'c0000000-0000-0000-0000-000000000001', status: 'PUBLISHED', created_at: '2024-01-01T00:00:00Z' },
    { id: 'p0000000-0000-0000-0000-000000000002', title: 'MTH201 Final', course_id: 'c0000000-0000-0000-0000-000000000002', status: 'PUBLISHED', created_at: '2024-02-01T00:00:00Z' },
  ];

  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];

  function selectBuilder(table: string) {
    const filters: Array<[string, unknown]> = [];
    let ilikeFilter: { col: string; pattern: string } | null = null;

    const rows = table === 'courses' ? courses : table === 'examination_papers' ? papers : [];

    const applyFilters = (): Row[] =>
      rows.filter((r) => {
        if (ilikeFilter) {
          const value = String(r[ilikeFilter.col] ?? '').toLowerCase();
          const pattern = ilikeFilter.pattern.toLowerCase();
          if (value !== pattern) return false;
        }
        return filters.every(([k, v]) => r[k] === v);
      });

    const builder = {
      eq(col: string, val: unknown) {
        filters.push([col, val]);
        return builder;
      },
      ilike(col: string, pattern: string) {
        ilikeFilter = { col, pattern };
        return builder;
      },
      textSearch() {
        return builder;
      },
      order() {
        return builder;
      },
      async maybeSingle() {
        const result = applyFilters();
        return { data: result[0] ?? null, error: null };
      },
      async range() {
        const result = applyFilters();
        return { data: result, error: null, count: result.length };
      },
      // supabase-js query builders are thenable - range()/maybeSingle()
      // are both awaited directly in papers.routes.ts, so a bare
      // `.then` is never invoked in practice, but keeping the shape
      // consistent avoids surprises if that ever changes.
    };
    return builder;
  }

  return {
    from(table: string) {
      return { select: () => selectBuilder(table) };
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      const matchingCourse = args.p_course_id ? papers.filter((p) => p.course_id === args.p_course_id) : papers;
      return {
        data: matchingCourse.map((p) => ({ ...p, course_code: 'X', course_title: 'Y', rank: 1, total_count: matchingCourse.length })),
        error: null,
      };
    },
    rpcCalls,
  };
}

const fakeDb = makeFakeDb();

vi.mock('./lib/supabase.js', () => ({ supabaseAdmin: fakeDb, supabaseAnon: fakeDb, supabaseForUser: () => fakeDb }));
vi.mock('./middleware/authenticate.js', () => ({
  authenticate: async (request: { user?: unknown; db?: unknown }) => {
    request.user = { id: '10000000-0000-0000-0000-000000000001', roles: ['STUDENT'] };
    request.db = fakeDb;
  },
}));

const { buildApp } = await import('./app.js');

describe('GET /api/papers - search filters and sort (Loop 08)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('resolves courseCode to the matching course and filters by it (case-insensitive)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/papers?courseCode=csc101', headers: { authorization: 'Bearer x' } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].title).toBe('CSC101 Final');
  });

  it('returns zero results (not the unfiltered list) for a courseCode that matches nothing', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/papers?courseCode=DOES-NOT-EXIST', headers: { authorization: 'Bearer x' } });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.items).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  it('sort=relevance calls the search_examination_papers RPC instead of the plain filter path', async () => {
    fakeDb.rpcCalls.length = 0;
    const res = await app.inject({ method: 'GET', url: '/api/papers?q=algebra&sort=relevance', headers: { authorization: 'Bearer x' } });
    expect(res.statusCode).toBe(200);
    expect(fakeDb.rpcCalls).toHaveLength(1);
    expect(fakeDb.rpcCalls[0]?.fn).toBe('search_examination_papers');
    expect(fakeDb.rpcCalls[0]?.args.p_query).toBe('algebra');
  });

  it('sort=relevance combined with courseCode resolves the course first and passes its id to the RPC', async () => {
    fakeDb.rpcCalls.length = 0;
    const res = await app.inject({ method: 'GET', url: '/api/papers?q=algebra&sort=relevance&courseCode=MTH201', headers: { authorization: 'Bearer x' } });
    expect(res.statusCode).toBe(200);
    expect(fakeDb.rpcCalls[0]?.args.p_course_id).toBe('c0000000-0000-0000-0000-000000000002');
    const body = res.json();
    expect(body.items.every((item: { course_id: string }) => item.course_id === 'c0000000-0000-0000-0000-000000000002')).toBe(true);
  });

  it('a non-relevance sort (recent) does not call the RPC at all', async () => {
    fakeDb.rpcCalls.length = 0;
    const res = await app.inject({ method: 'GET', url: '/api/papers?sort=recent', headers: { authorization: 'Bearer x' } });
    expect(res.statusCode).toBe(200);
    expect(fakeDb.rpcCalls).toHaveLength(0);
  });
});
