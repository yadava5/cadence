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

/** Reuses the shared EventEmitter-backed mocks so the middleware chain runs. */
function mockReqRes() {
  const req = createMockRequest({ method: 'GET', url: '/api/health' });
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
});
