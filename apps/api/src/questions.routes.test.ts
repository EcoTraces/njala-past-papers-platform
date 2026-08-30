import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * HTTP-level tests for questions.routes.ts's own defenses (Loop 12
 * QA pass). Two things here had zero test coverage despite being
 * directly relevant to the answer-key-leakage class of bug fixed at
 * the RLS layer in Loop 11:
 *
 * 1. `stripAnswers()` - the API's own JSON-level defense, independent
 *    of RLS, that a non-staff caller never receives
 *    `question_options.is_correct` in the response body. RLS is the
 *    real boundary (see rls_rbac_assertions.sql scenario 27), but this
 *    app-layer stripping is a second, genuinely separate line of
 *    defense and deserves its own regression test - a future change
 *    to this function shouldn't be able to silently stop stripping
 *    without a test failing.
 * 2. `POST /:id/verify`'s validation that `approve` must actually be a
 *    boolean, rejecting a request that omits it (or sends a
 *    non-boolean) with a real 4xx instead of silently doing the wrong
 *    thing or crashing.
 *
 * Role-based rejection (a STUDENT can't create/verify/delete a
 * question at all) is already covered by papers.rbac.test.ts; this
 * file only covers behavior reachable once a request IS authorized.
 */

type Row = Record<string, unknown>;

function makeFakeDb(initialRows: Row[]) {
  const rows: Row[] = initialRows;

  function applyPatch(matched: Row[], patch: Record<string, unknown>) {
    matched.forEach((r) => Object.assign(r, patch));
  }

  function builder(mode: 'select' | 'update', patch?: Record<string, unknown>) {
    const filters: Array<(r: Row) => boolean> = [];
    let rangeArgs: [number, number] | null = null;

    const b: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return b;
      },
      order() {
        return b;
      },
      range(from: number, to: number) {
        rangeArgs = [from, to];
        return b;
      },
      select() {
        return b;
      },
      async maybeSingle() {
        const matched = rows.filter((r) => filters.every((f) => f(r)));
        if (mode === 'update' && patch) applyPatch(matched, patch);
        return { data: matched[0] ?? null, error: null };
      },
      async single() {
        const matched = rows.filter((r) => filters.every((f) => f(r)));
        if (mode === 'update' && patch) applyPatch(matched, patch);
        if (matched.length === 0) return { data: null, error: { message: 'no matching row' } };
        return { data: matched[0], error: null };
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        const matched = rows.filter((r) => filters.every((f) => f(r)));
        const sliced = rangeArgs ? matched.slice(rangeArgs[0], rangeArgs[1] + 1) : matched;
        return Promise.resolve({ data: sliced, error: null, count: matched.length }).then(onFulfilled, onRejected);
      },
    };
    return b;
  }

  return {
    rows,
    from(table: string) {
      if (table !== 'questions') throw new Error(`questions.routes.test.ts fake only supports the questions table, got ${table}`);
      return {
        select: () => builder('select'),
        update: (patch: Record<string, unknown>) => builder('update', patch),
      };
    },
  };
}

vi.mock('./services/audit.service.js', () => ({ recordAuditEvent: vi.fn(async () => undefined) }));

function questionFixture(): Row {
  return {
    id: 'q1000000-0000-0000-0000-000000000001',
    course_id: 'c0000000-0000-0000-0000-000000000001',
    question_text: 'Which is prime?',
    question_type: 'MULTIPLE_CHOICE',
    marks: 5,
    difficulty: 1,
    verification_status: 'VERIFIED',
    author_id: '20000000-0000-0000-0000-000000000001',
    question_options: [
      { id: 'o1', option_label: 'A', option_text: '4', order_index: 0, is_correct: false },
      { id: 'o2', option_label: 'B', option_text: '7', order_index: 1, is_correct: true },
    ],
  };
}

async function buildAppAs(role: 'STUDENT' | 'LECTURER' | 'LIBRARY_STAFF', fakeDb: ReturnType<typeof makeFakeDb>) {
  vi.doMock('./middleware/authenticate.js', () => ({
    authenticate: async (request: { user?: unknown; db?: unknown }) => {
      request.user = { id: '99999999-0000-0000-0000-000000000000', roles: [role] };
      request.db = fakeDb;
    },
  }));
  vi.resetModules();
  const { buildApp } = await import('./app.js');
  const app = await buildApp();
  await app.ready();
  return app;
}

describe('questions.routes.ts (Loop 12 QA pass)', () => {
  afterEach(() => {
    vi.doUnmock('./middleware/authenticate.js');
    vi.resetModules();
  });

  it('strips question_options.is_correct from GET /api/questions for a STUDENT', async () => {
    const fakeDb = makeFakeDb([questionFixture()]);
    const app = await buildAppAs('STUDENT', fakeDb);

    const res = await app.inject({ method: 'GET', url: '/api/questions', headers: { authorization: 'Bearer x' } });
    expect(res.statusCode).toBe(200);
    const options = res.json().items[0].question_options as Array<Record<string, unknown>>;
    for (const opt of options) {
      expect(opt).not.toHaveProperty('is_correct');
    }

    await app.close();
  });

  it('does NOT strip question_options.is_correct from GET /api/questions for a LECTURER', async () => {
    const fakeDb = makeFakeDb([questionFixture()]);
    const app = await buildAppAs('LECTURER', fakeDb);

    const res = await app.inject({ method: 'GET', url: '/api/questions', headers: { authorization: 'Bearer x' } });
    expect(res.statusCode).toBe(200);
    const options = res.json().items[0].question_options as Array<Record<string, unknown>>;
    expect(options.some((o) => 'is_correct' in o)).toBe(true);
    expect(options.find((o) => o.option_label === 'B')?.is_correct).toBe(true);

    await app.close();
  });

  it('strips question_options.is_correct from GET /api/questions/:id for a STUDENT', async () => {
    const fixture = questionFixture();
    const fakeDb = makeFakeDb([fixture]);
    const app = await buildAppAs('STUDENT', fakeDb);

    const res = await app.inject({ method: 'GET', url: `/api/questions/${fixture.id}`, headers: { authorization: 'Bearer x' } });
    expect(res.statusCode).toBe(200);
    const options = res.json().question_options as Array<Record<string, unknown>>;
    for (const opt of options) {
      expect(opt).not.toHaveProperty('is_correct');
    }

    await app.close();
  });

  it('POST /:id/verify with approve=true sets VERIFIED and records the verifier', async () => {
    const fixture = questionFixture();
    fixture.verification_status = 'UNVERIFIED';
    const fakeDb = makeFakeDb([fixture]);
    const app = await buildAppAs('LIBRARY_STAFF', fakeDb);

    const res = await app.inject({
      method: 'POST',
      url: `/api/questions/${fixture.id}/verify`,
      headers: { authorization: 'Bearer x', 'content-type': 'application/json' },
      payload: { approve: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().verification_status).toBe('VERIFIED');
    expect(res.json().verified_by).toBe('99999999-0000-0000-0000-000000000000');

    await app.close();
  });

  it('POST /:id/verify without a boolean "approve" is rejected with a real 4xx, not silently accepted or a 500', async () => {
    const fixture = questionFixture();
    const fakeDb = makeFakeDb([fixture]);
    const app = await buildAppAs('LIBRARY_STAFF', fakeDb);

    const res = await app.inject({
      method: 'POST',
      url: `/api/questions/${fixture.id}/verify`,
      headers: { authorization: 'Bearer x', 'content-type': 'application/json' },
      payload: {},
    });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
    // The fixture's status must be untouched - a rejected request must
    // never have a side effect.
    expect(fixture.verification_status).toBe('VERIFIED');

    await app.close();
  });
});
