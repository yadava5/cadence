/**
 * `DELETE /api/account` must refuse the shared public demo account — and must
 * still delete a real one.
 *
 * The demo credentials are printed on the landing page and wired to a one click
 * "Sign in as the demo account" button, so a valid demo token is one click away
 * for anyone on the internet. Until this guard existed, the only thing between a
 * curious visitor and the permanent end of the public demo was typing `DELETE`
 * into a text field: the handler deleted the `users` row with no exception for
 * that account, the landing page's promise that "the demo user keeps its seeded
 * week between visits" would have become false forever, and the keep alive cron
 * in demo/reanchor.ts would have started answering "Demo account not found".
 *
 * WHY BOTH DIRECTIONS ARE PINNED
 *
 * A test that only asserted "the demo account gets a 403" would pass against a
 * handler that refuses everybody, which is a different and equally bad bug —
 * account deletion is a data rights obligation, not a nicety. So the normal
 * account case asserts a 200 AND that the deletes actually ran, scoped to the
 * caller. And the demo case asserts `withTransaction` was never entered at all,
 * because "returned 403" and "destroyed nothing" are not the same claim: a guard
 * that refused after the transaction had already run would satisfy the first.
 *
 * WHY IDENTITY COMES FROM THE DATABASE
 *
 * The handler resolves the account's email from the `users` row by id rather
 * than trusting the JWT's `email` claim. The last case here pins that: a token
 * whose claim says someone else, presented for the demo user's id, is still
 * refused. A guard keyed on the claim would be fail open the moment an address
 * could change, and this is the one account where fail open is unaffordable.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockQuery, mockWithTransaction, mockClient } = vi.hoisted(() => {
  const client = { query: vi.fn() };
  return {
    mockClient: client,
    mockQuery: vi.fn(),
    mockWithTransaction: vi.fn(),
  };
});

vi.mock('../../../lib/config/database.js', () => ({
  query: mockQuery,
  withTransaction: mockWithTransaction,
  pool: {},
}));

process.env.JWT_SECRET ??= 'test-secret-at-least-32-characters-long!!';

const { generateAccessToken } = await import(
  '../../../packages/backend/src/utils/jwt.js'
);
const { createMockRequest, createMockResponse } = await import(
  '../../../lib/__tests__/helpers/mockRequest.js'
);
const { DEMO_EMAIL } = await import('../../../lib/config/demo.js');
const accountHandler = (await import('../index.js')).default;

type MockRes = ReturnType<typeof createMockResponse>;

const statusOf = (res: MockRes) => vi.mocked(res.status).mock.calls.at(-1)?.[0];

const bodyOf = (res: MockRes) =>
  vi.mocked(res.json).mock.calls.at(-1)?.[0] as
    | {
        success?: boolean;
        data?: { deleted?: boolean };
        error?: { message?: string };
      }
    | undefined;

/** Issue a real, correctly signed access token and call the handler with it. */
async function deleteAccountAs(userId: string, claimedEmail: string) {
  const token = await generateAccessToken(userId, claimedEmail);
  const req = createMockRequest({
    method: 'DELETE',
    url: '/api/account',
    headers: { authorization: `Bearer ${token}` },
  });
  const res = createMockResponse();
  await accountHandler(req, res);
  return res;
}

/** What the `users` lookup in the handler will find for this request. */
function accountRowIs(email: string | null) {
  mockQuery.mockResolvedValue({
    rows: email === null ? [] : [{ email }],
    rowCount: email === null ? 0 : 1,
  });
}

describe('DELETE /api/account — the shared demo account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.query.mockResolvedValue({ rowCount: 1 });
    mockWithTransaction.mockImplementation(
      async (fn: (client: typeof mockClient) => unknown) => fn(mockClient)
    );
  });

  it('refuses to delete the demo account, and runs no transaction at all', async () => {
    accountRowIs(DEMO_EMAIL);

    const res = await deleteAccountAs('demo-user-id', DEMO_EMAIL);

    expect(statusOf(res)).toBe(403);
    // Nothing was destroyed: the guard returns before any delete is issued.
    expect(mockWithTransaction).not.toHaveBeenCalled();
    expect(mockClient.query).not.toHaveBeenCalled();
    // And it says why, in words a visitor can act on.
    expect(bodyOf(res)?.error?.message).toContain('demo account');
    expect(bodyOf(res)?.error?.message).toContain(DEMO_EMAIL);
  });

  it('refuses it whatever case the address is stored in', async () => {
    // `users.email` is plain TEXT, and login matches it with
    // `LOWER(email) = LOWER($1)` — so a row written as `John@Example.COM` signs
    // in as the demo user perfectly well while slipping a case sensitive guard.
    accountRowIs('  John@Example.COM  ');

    const res = await deleteAccountAs('demo-user-id', DEMO_EMAIL);

    expect(statusOf(res)).toBe(403);
    expect(mockWithTransaction).not.toHaveBeenCalled();
  });

  it('refuses on the demo row even when the token claims another address', async () => {
    // Identity is read from the users row, never from the token's claim.
    accountRowIs(DEMO_EMAIL);

    const res = await deleteAccountAs(
      'demo-user-id',
      'someone.else@example.com'
    );

    expect(statusOf(res)).toBe(403);
    expect(mockWithTransaction).not.toHaveBeenCalled();
    // The lookup was keyed on the authenticated caller's own id.
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('FROM public.users'),
      ['demo-user-id']
    );
  });

  it('fails closed when the account cannot be resolved', async () => {
    // "We are not sure whose account this is" must never resolve to "delete it".
    accountRowIs(null);

    const res = await deleteAccountAs('ghost-user-id', 'ghost@example.com');

    expect(statusOf(res)).toBe(403);
    expect(mockWithTransaction).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/account — an ordinary account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.query.mockResolvedValue({ rowCount: 1 });
    mockWithTransaction.mockImplementation(
      async (fn: (client: typeof mockClient) => unknown) => fn(mockClient)
    );
  });

  it('still deletes, scoped to the caller', async () => {
    // The direction a "refuse the demo" guard is most likely to break. Deleting
    // your own account is an obligation, so this is not an optional half.
    accountRowIs('real.person@example.dev');

    const res = await deleteAccountAs('user-42', 'real.person@example.dev');

    expect(statusOf(res)).toBe(200);
    expect(bodyOf(res)?.success).toBe(true);
    expect(bodyOf(res)?.data?.deleted).toBe(true);
    expect(mockWithTransaction).toHaveBeenCalledTimes(1);

    const statements = mockClient.query.mock.calls.map((c) => String(c[0]));
    expect(
      statements.some((s) => /DELETE FROM users WHERE id = \$1/.test(s))
    ).toBe(true);
    // Every statement carried the caller's own id — this handler co-tenants a
    // shared Postgres, so an unscoped delete here reaches another tenant.
    expect(
      mockClient.query.mock.calls.every(
        (c) => (c[1] as unknown[] | undefined)?.[0] === 'user-42'
      )
    ).toBe(true);
  });
});
