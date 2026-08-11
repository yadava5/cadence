/**
 * The health endpoint must fail when the database is down.
 *
 * It previously returned a static `{ status: 'ok' }` and never queried
 * Postgres, so it answered 200 throughout a database outage — a monitor
 * pointed at it would have reported the service healthy while every data route
 * returned errors. These tests pin the behaviour that makes it useful:
 * 200 + ok when the database answers, 503 + error when it does not.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/database.js', () => ({
  query: vi.fn(),
  pool: {},
  withTransaction: vi.fn(),
}));

const { query } = await import('../../config/database.js');
const mockedQuery = vi.mocked(query);
const { healthCheckHandler, __resetHealthProbeForTests } = await import(
  '../apiHandler.js'
);

const { createMockRequest, createMockResponse } = await import(
  '../../__tests__/helpers/mockRequest.js'
);

const { rateLimitPresets, resetRateLimitStore } = await import(
  '../../middleware/rateLimit.js'
);

/** Reuses the shared EventEmitter-backed mocks so the middleware chain runs. */
function mockReqRes(headers?: Record<string, string>) {
  // Spread conditionally: `headers: undefined` would REPLACE the mock's default
  // headers with undefined rather than leave them alone.
  const req = createMockRequest({
    method: 'GET',
    url: '/api/health',
    ...(headers ? { headers } : {}),
  });
  const res = createMockResponse();
  return {
    req,
    res,
    get status() {
      return vi.mocked(res.status).mock.calls.at(-1)?.[0];
    },
    get data() {
      const payload = vi.mocked(res.json).mock.calls.at(-1)?.[0] as
        | { data?: Record<string, unknown> }
        | undefined;
      return payload?.data ?? {};
    },
  };
}

describe('healthCheckHandler', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
    __resetHealthProbeForTests();
    // Shared module state: these tests now spend rate-limit budget.
    resetRateLimitStore();
  });

  it('reports ok and 200 when the database answers', async () => {
    mockedQuery.mockResolvedValue({
      rows: [{ '?column?': 1 }],
      rowCount: 1,
    } as never);
    const h = mockReqRes();

    await healthCheckHandler(h.req, h.res);

    expect(h.status).toBe(200);
    expect(h.data.status).toBe('ok');
    expect((h.data.checks as Record<string, unknown>).database).toMatchObject({
      ok: true,
    });
  });

  it('reports error and 503 when the database is unreachable', async () => {
    mockedQuery.mockRejectedValue(
      new Error('ENOTFOUND tenant/user postgres.x')
    );
    const h = mockReqRes();

    await healthCheckHandler(h.req, h.res);

    // This is the case the old handler got wrong: it returned 200.
    expect(h.status).toBe(503);
    expect(h.data.status).toBe('error');
    expect((h.data.checks as Record<string, unknown>).database).toMatchObject({
      ok: false,
    });
  });

  it('keeps the fields the previous response carried, so existing readers do not break', async () => {
    mockedQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
    const h = mockReqRes();

    await healthCheckHandler(h.req, h.res);

    for (const field of ['status', 'timestamp', 'environment', 'version']) {
      expect(h.data, `missing ${field}`).toHaveProperty(field);
    }
  });

  it('caches the probe so an unauthenticated endpoint cannot be turned into database load', async () => {
    mockedQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    for (let i = 0; i < 25; i++) {
      const h = mockReqRes();
      await healthCheckHandler(h.req, h.res);
    }

    expect(mockedQuery).toHaveBeenCalledTimes(1);
  });

  it('does not consume the login allowance of the address it probes from', async () => {
    /*
     * The production outage of 2026-08-10, end to end: every limiter shared one
     * counter per caller, so this scheduled probe (limit 100) spent the budget
     * that `/api/auth/login` reads with a limit of 5. A clean browser's first
     * click on "Sign in as the demo account" got 429 before a credential was
     * ever submitted.
     *
     * Same caller identity throughout — only the bucket differs. With the old
     * global key this fails on the first login attempt.
     */
    mockedQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);
    const headers = { 'x-vercel-forwarded-for': '203.0.113.42' };

    for (let i = 0; i < 12; i++) {
      const h = mockReqRes(headers);
      await healthCheckHandler(h.req, h.res);
      expect(h.status).toBe(200);
    }

    const next = vi.fn();
    for (let i = 0; i < 5; i++) {
      const login = createMockRequest({ method: 'POST', headers });
      const res = createMockResponse();
      await rateLimitPresets.auth(login, res, next);
      expect(vi.mocked(res.status)).not.toHaveBeenCalledWith(429);
    }
    expect(next).toHaveBeenCalledTimes(5);
  });
});
