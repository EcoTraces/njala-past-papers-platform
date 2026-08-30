import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * HTTP-level tests for the practice-session routes' RPC wiring
 * (Loop 09): pause/resume/submit must call the real Postgres
 * functions (practice_pause_session/practice_resume_session/
 * practice_submit_session), not a plain UPDATE - the plain-UPDATE
 * version this replaced never recorded real elapsed time, and the
 * submit RPC is what enforces authoritative, server-computed scoring.
 * The RPC's own SQL correctness (time accumulation, RLS, the mark-
 * tampering/question-scope fixes) is proven separately in
 * rls_rbac_assertions.sql against a real Postgres instance - this file
 * only proves the Node route calls the right RPC with the right id.
 */

type Row = Record<string, unknown>;

function makeFakeDb() {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const sessions: Row[] = [{ id: '11111111-1111-1111-1111-111111111111', user_id: '10000000-0000-0000-0000-000000000001', status: 'IN_PROGRESS' }];

  return {
    rpcCalls,
    async rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      if (fn === 'practice_pause_session') return { data: { ...sessions[0], status: 'PAUSED' }, error: null };
      if (fn === 'practice_resume_session') return { data: { ...sessions[0], status: 'IN_PROGRESS' }, error: null };
      if (fn === 'practice_submit_session') return { data: { ...sessions[0], status: 'SUBMITTED', percentage: 100 }, error: null };
      return { data: null, error: { message: `unexpected rpc ${fn}` } };
    },
    from() {
      throw new Error('practice.session.test.ts scenarios should only ever reach rpc(), not from()');
    },
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
vi.mock('./services/audit.service.js', () => ({ recordAuditEvent: vi.fn(async () => undefined) }));
vi.mock('./services/notifications.service.js', () => ({ notifyUser: vi.fn(async () => undefined) }));

const { buildApp } = await import('./app.js');

describe('practice session pause/resume/submit RPC wiring (Loop 09)', () => {
  let app: FastifyInstance;
  const sessionId = '11111111-1111-1111-1111-111111111111';

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    fakeDb.rpcCalls.length = 0;
  });

  it('POST /practice/sessions/:id/pause calls practice_pause_session with the session id', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/practice/sessions/${sessionId}/pause`, headers: { authorization: 'Bearer x' } });
    expect(res.statusCode).toBe(200);
    expect(fakeDb.rpcCalls).toEqual([{ fn: 'practice_pause_session', args: { p_session_id: sessionId } }]);
    expect(res.json().status).toBe('PAUSED');
  });

  it('POST /practice/sessions/:id/resume calls practice_resume_session with the session id', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/practice/sessions/${sessionId}/resume`, headers: { authorization: 'Bearer x' } });
    expect(res.statusCode).toBe(200);
    expect(fakeDb.rpcCalls).toEqual([{ fn: 'practice_resume_session', args: { p_session_id: sessionId } }]);
    expect(res.json().status).toBe('IN_PROGRESS');
  });

  it('POST /practice/sessions/:id/submit calls practice_submit_session with the session id (the only path that computes an authoritative score)', async () => {
    const res = await app.inject({ method: 'POST', url: `/api/practice/sessions/${sessionId}/submit`, headers: { authorization: 'Bearer x' } });
    expect(res.statusCode).toBe(200);
    expect(fakeDb.rpcCalls).toEqual([{ fn: 'practice_submit_session', args: { p_session_id: sessionId } }]);
    expect(res.json().status).toBe('SUBMITTED');
  });
});
