/**
 * `createMethodHandler` must actually authenticate the routes that read `req.user`.
 *
 * It previously composed only `cors → requestId → requestLogger → rateLimit`,
 * with no `authenticateJWT()` — unlike `createApiHandler`. Every handler built on
 * it that reads `req.user?.id` therefore saw `undefined` in production and
 * answered 401 unconditionally: tasks/stats, tasks/bulk, events/conflicts,
 * tags/{stats,merge,cleanup}, task-lists/stats, attachments/stats — and
 * auth/logout, whose "log out from all devices" consequently never ran.
 *
 * It failed closed, so it was a capability hole rather than a breach, which is
 * exactly why nothing caught it: **a test that only asserted 401 would have
 * passed against the broken build.** So each case here pins both directions —
 * rejected without a token, and served *with* one.
 *
 * The other half of the fix is that auth is opt-in. This same factory serves
 * routes that must stay public — the health check (both the uptime probe and the
 * Supabase keep-alive depend on it answering unauthenticated), login, register,
 * refresh, and the Google OAuth entry/callback. Those are pinned below too,
 * because making auth the default here would take down login.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockTaskService, mockGetAllServices } = vi.hoisted(() => {
  const service = { getStats: vi.fn() };
  // The handler destructures `{ task: taskService }` from getAllServices().
  return {
    mockTaskService: service,
    mockGetAllServices: vi.fn(() => ({ task: service })),
  };
});

vi.mock('../../lib/services/index.js', () => ({
  getAllServices: mockGetAllServices,
}));

vi.mock('../../lib/config/database.js', () => ({
  query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
  withTransaction: vi.fn(),
  pool: {},
}));

process.env.JWT_SECRET ??= 'test-secret-at-least-32-characters-long!!';

const { generateAccessToken } = await import(
  '../../packages/backend/src/utils/jwt.js'
);
const { createMockRequest, createMockResponse } = await import(
  '../../lib/__tests__/helpers/mockRequest.js'
);
const tasksStats = (await import('../tasks/stats.js')).default;

const USER = { id: 'user-1', email: 'a@example.com' };

function statusOf(res: ReturnType<typeof createMockResponse>) {
  return vi.mocked(res.status).mock.calls.at(-1)?.[0];
}

async function call(headers: Record<string, string> = {}) {
  const req = createMockRequest({
    method: 'GET',
    url: '/api/tasks/stats',
    headers,
  });
  const res = createMockResponse();
  await tasksStats(req, res);
  return { req, res };
}

describe('createMethodHandler authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTaskService.getStats.mockResolvedValue({ total: 0, completed: 0 });
  });

  it('rejects a request with no Authorization header', async () => {
    const { res } = await call();

    expect(statusOf(res)).toBe(401);
    expect(mockTaskService.getStats).not.toHaveBeenCalled();
  });

  it('rejects a malformed Authorization header', async () => {
    const { res } = await call({ authorization: 'Basic abc123' });

    expect(statusOf(res)).toBe(401);
    expect(mockTaskService.getStats).not.toHaveBeenCalled();
  });

  it('serves a request carrying a valid access token', async () => {
    // The direction that was broken. Before the fix this also returned 401,
    // so asserting only the rejection cases would have proven nothing.
    const token = await generateAccessToken(USER.id, USER.email);

    const { req, res } = await call({ authorization: `Bearer ${token}` });

    expect(statusOf(res)).toBe(200);
    expect(mockTaskService.getStats).toHaveBeenCalled();
    // And the identity actually reached the handler.
    expect((req as { user?: { id: string } }).user?.id).toBe(USER.id);
  });
});

describe('routes that must stay public', () => {
  it('the health check answers without a token', async () => {
    // The Supabase keep-alive and the uptime monitor both probe this
    // unauthenticated. If auth ever becomes the default here, they go dark.
    const { healthCheckHandler, __resetHealthProbeForTests } = await import(
      '../../lib/utils/apiHandler.js'
    );
    __resetHealthProbeForTests();

    const req = createMockRequest({ method: 'GET', url: '/api/health' });
    const res = createMockResponse();
    await healthCheckHandler(req, res);

    expect([200, 503]).toContain(statusOf(res));
    expect(statusOf(res)).not.toBe(401);
  });

  it.each([
    ['login', 'auth/login.ts'],
    ['register', 'auth/register.ts'],
    ['refresh', 'auth/refresh.ts'],
    ['google entry', 'auth/google/index.ts'],
    ['google callback', 'auth/google/callback.ts'],
  ])('%s does not opt into requireAuth', async (_name, relative) => {
    // Asserted structurally: these modules must not carry the flag, because
    // requiring a token to log in would lock every user out.
    const { readFile } = await import('node:fs/promises');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const handlersDir = join(dirname(fileURLToPath(import.meta.url)), '..');

    const source = await readFile(join(handlersDir, relative), 'utf8');

    expect(source).not.toContain('requireAuth');
  });
});
