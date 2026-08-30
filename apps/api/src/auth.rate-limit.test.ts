import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * Proves the per-route rate limit configured on /api/auth/login (see
 * routes/auth.routes.ts) actually engages, rather than trusting that
 * the `config.rateLimit` option was wired correctly. Every attempt
 * here fails student-lookup (the mock always returns "not found"), so
 * this also incidentally proves the limiter runs regardless of the
 * handler's own outcome - it isn't only counting successful logins.
 */

vi.mock('./lib/supabase.js', () => ({
  supabaseAdmin: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  },
  supabaseAnon: {},
  supabaseForUser: () => ({}),
}));

const { buildApp } = await import('./app.js');

describe('auth endpoint rate limiting', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 429 after exceeding the login endpoint\'s per-IP budget, well before the API-wide limit', async () => {
    const attempt = () =>
      app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { studentId: 'NJ2024NOBODY', password: 'wrong-password' },
      });

    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) {
      const res = await attempt();
      statuses.push(res.statusCode);
    }

    // The route's own limit is 10/minute (LOGIN_RATE_LIMIT); the first
    // 10 should be handled normally (401 - student not found) and at
    // least one of the last 2 should be rate-limited. Asserting "at
    // least one 429 appears" rather than an exact index keeps this
    // robust to the limiter's own bucket bookkeeping.
    expect(statuses.filter((s) => s === 401).length).toBeGreaterThanOrEqual(10);
    expect(statuses).toContain(429);

    const limited = await attempt();
    expect(limited.statusCode).toBe(429);
    // The centralized error handler must pass the plugin's real 429
    // through, not mask it as a generic 500 (see app.ts's error
    // handler - a real bug found and fixed while writing this test).
    expect(limited.json()).toMatchObject({ error: { message: expect.any(String) } });
  });
});
