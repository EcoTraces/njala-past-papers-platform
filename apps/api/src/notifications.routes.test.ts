import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * HTTP-level tests for notifications.routes.ts (Loop 12 QA pass) -
 * previously zero test coverage. The one thing worth a real regression
 * test here: PATCH /:id/read scopes its UPDATE with both `.eq('id',
 * id)` AND `.eq('user_id', callerId)` - defense in depth on top of RLS
 * so a user can never mark ANOTHER user's notification as read, even
 * if they can guess/enumerate its id. Also covers the ordinary list/
 * mark-all-read paths, which had no coverage at all.
 */

type Row = Record<string, unknown>;

function makeFakeDb(rows: Row[]) {
  function builder(mode: 'select' | 'update', patch?: Record<string, unknown>) {
    const filters: Array<(r: Row) => boolean> = [];
    const b: Record<string, unknown> = {
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return b;
      },
      order() {
        return b;
      },
      limit() {
        return b;
      },
      select() {
        return b;
      },
      async single() {
        const matched = rows.filter((r) => filters.every((f) => f(r)));
        if (mode === 'update' && patch) matched.forEach((r) => Object.assign(r, patch));
        if (matched.length === 0) return { data: null, error: { message: 'no matching row' } };
        return { data: matched[0], error: null };
      },
      then(onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) {
        const matched = rows.filter((r) => filters.every((f) => f(r)));
        if (mode === 'update' && patch) matched.forEach((r) => Object.assign(r, patch));
        return Promise.resolve({ data: matched, error: null }).then(onFulfilled, onRejected);
      },
    };
    return b;
  }

  return {
    rows,
    from(table: string) {
      if (table !== 'notifications') throw new Error(`notifications.routes.test.ts fake only supports notifications, got ${table}`);
      return {
        select: () => builder('select'),
        update: (patch: Record<string, unknown>) => builder('update', patch),
      };
    },
  };
}

const CALLER_ID = '10000000-0000-0000-0000-000000000001';
const OTHER_USER_ID = '10000000-0000-0000-0000-000000000002';

let fakeDb: ReturnType<typeof makeFakeDb>;

vi.mock('./middleware/authenticate.js', () => ({
  authenticate: async (request: { user?: unknown; db?: unknown }) => {
    request.user = { id: CALLER_ID, roles: ['STUDENT'] };
    request.db = fakeDb;
  },
}));

const { buildApp } = await import('./app.js');

describe('notifications.routes.ts (Loop 12 QA pass)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    fakeDb = makeFakeDb([
      { id: 'n1', user_id: CALLER_ID, title: 'Mine', is_read: false },
      { id: 'n2', user_id: OTHER_USER_ID, title: 'Not mine', is_read: false },
    ]);
  });

  it('GET / only ever returns the caller\'s own notifications', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/notifications', headers: { authorization: 'Bearer x' } });
    expect(res.statusCode).toBe(200);
    const items = res.json().items as Row[];
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe('n1');
  });

  it('PATCH /:id/read on the caller\'s own notification marks it read', async () => {
    const res = await app.inject({ method: 'PATCH', url: '/api/notifications/n1/read', headers: { authorization: 'Bearer x' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().is_read).toBe(true);
  });

  it('PATCH /:id/read on ANOTHER user\'s notification id does not mark it read (IDOR check)', async () => {
    const res = await app.inject({ method: 'PATCH', url: '/api/notifications/n2/read', headers: { authorization: 'Bearer x' } });
    // The row-scoped update matches 0 rows, so this must never report
    // success - and critically, the other user's row must be
    // untouched regardless of what status code comes back.
    expect(res.statusCode).not.toBe(200);
    const otherRow = fakeDb.rows.find((r) => r.id === 'n2')!;
    expect(otherRow.is_read).toBe(false);
  });

  it('POST /read-all only marks the caller\'s own unread notifications as read', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/notifications/read-all', headers: { authorization: 'Bearer x' } });
    expect(res.statusCode).toBe(204);
    expect(fakeDb.rows.find((r) => r.id === 'n1')!.is_read).toBe(true);
    expect(fakeDb.rows.find((r) => r.id === 'n2')!.is_read).toBe(false);
  });
});
