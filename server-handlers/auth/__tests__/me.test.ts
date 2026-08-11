/**
 * `GET /api/auth/me` must actually reach its handler.
 *
 * It never did. The file called
 * `createApiHandler({ routes: [{ method: GET, ... }] })`, but
 * `createApiHandler` takes a method-keyed object — so `routes['GET']` was
 * `undefined` and every request, authenticated or not, fell through to
 * `sendError(405, 'METHOD_NOT_ALLOWED')`. Verified against production before
 * the fix: 405.
 *
 * The typecheck project added in the same change rejects that exact shape
 * (TS2353, excess property). This file is the second gate, and it is not
 * redundant: excess-property checking only fires on a fresh object literal at
 * the call site, so hoisting the argument into a `const` would defeat it while
 * these assertions would still fail.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockGetUserById } = vi.hoisted(() => ({
  mockGetUserById: vi.fn(),
}));

vi.mock('../../../packages/backend/src/services/AuthService.js', () => ({
  authService: { getUserById: mockGetUserById },
}));

vi.mock('../../../lib/config/database.js', () => ({
  query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
  withTransaction: vi.fn(),
  pool: {},
}));

process.env.JWT_SECRET ??= 'test-secret-at-least-32-characters-long!!';

const { generateAccessToken } = await import(
  '../../../packages/backend/src/utils/jwt.js'
);
const { createMockRequest, createMockResponse } = await import(
  '../../../lib/__tests__/helpers/mockRequest.js'
);
const meHandler = (await import('../me.js')).default;

const USER = {
  id: 'user-1',
  email: 'someone@example.com',
  name: 'Someone',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  profile: { theme: 'dark' },
};

function statusOf(res: ReturnType<typeof createMockResponse>) {
  return vi.mocked(res.status).mock.calls.at(-1)?.[0];
}

function bodyOf(res: ReturnType<typeof createMockResponse>) {
  return vi.mocked(res.json).mock.calls.at(-1)?.[0] as {
    success: boolean;
    data?: Record<string, unknown>;
    error?: { code: string; message: string };
  };
}

async function call(
  headers: Record<string, string> = {},
  method = 'GET'
): Promise<ReturnType<typeof createMockResponse>> {
  const req = createMockRequest({
    method,
    url: '/api/auth/me',
    headers,
  });
  const res = createMockResponse();
  await meHandler(req, res);
  return res;
}

describe('GET /api/auth/me', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUserById.mockResolvedValue(USER);
  });

  it('answers 200 with the user for an authenticated caller', async () => {
    const token = await generateAccessToken(USER.id, USER.email);
    const res = await call({ authorization: `Bearer ${token}` });

    // The regression this pins: before the fix this was 405.
    expect(statusOf(res)).toBe(200);

    const body = bodyOf(res);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ id: USER.id, email: USER.email });
    expect(mockGetUserById).toHaveBeenCalledWith(USER.id);
  });

  it('does not answer 405 to a GET', async () => {
    const token = await generateAccessToken(USER.id, USER.email);
    const res = await call({ authorization: `Bearer ${token}` });

    expect(statusOf(res)).not.toBe(405);
    expect(bodyOf(res).error?.code).not.toBe('METHOD_ALLOWED');
  });

  it('rejects a request with no Authorization header', async () => {
    const res = await call();

    expect(statusOf(res)).toBe(401);
    expect(mockGetUserById).not.toHaveBeenCalled();
  });

  it('answers 404 when the token is valid but the user is gone', async () => {
    mockGetUserById.mockResolvedValue(null);
    const token = await generateAccessToken(USER.id, USER.email);

    const res = await call({ authorization: `Bearer ${token}` });

    expect(statusOf(res)).toBe(404);
    expect(bodyOf(res).error?.code).toBe('USER_NOT_FOUND');
  });

  it('still answers 405 to a method it does not serve', async () => {
    const token = await generateAccessToken(USER.id, USER.email);
    const res = await call({ authorization: `Bearer ${token}` }, 'POST');

    expect(statusOf(res)).toBe(405);
  });
});
