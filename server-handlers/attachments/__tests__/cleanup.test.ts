/**
 * `DELETE /api/attachments/cleanup` must report a number, not an object.
 *
 * `cleanupOrphanedAttachments` returns `{ deletedCount: number }`
 * (`AttachmentService.ts:824`), and the handler assigned that whole object to a
 * variable named `deletedCount` and interpolated it — so the response read
 * "[object Object] orphaned attachments were removed" and the `deletedCount`
 * field carried an object. Nothing covered this route, which is why a
 * one-character mistake shipped: a typecheck cannot catch it either, because an
 * object interpolates into a template literal perfectly happily.
 *
 * Whether this route should exist at all is a separate, still-open question —
 * see the header of `../cleanup.ts`. It could not be settled here because it
 * turns on the production FK definition, which this session had no way to read.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockAttachmentService, mockGetAllServices } = vi.hoisted(() => {
  const attachment = { cleanupOrphanedAttachments: vi.fn() };
  return {
    mockAttachmentService: attachment,
    mockGetAllServices: vi.fn(() => ({ attachment })),
  };
});

vi.mock('../../../lib/services/index.js', () => ({
  getAllServices: mockGetAllServices,
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
const cleanup = (await import('../cleanup.js')).default;

const USER = { id: 'user-1', email: 'a@example.com' };

async function call() {
  const token = await generateAccessToken(USER.id, USER.email);
  const req = createMockRequest({
    method: 'DELETE',
    url: '/api/attachments/cleanup',
    headers: { authorization: `Bearer ${token}` },
  });
  const res = createMockResponse();
  await cleanup(req, res);
  return res;
}

function bodyOf(res: ReturnType<typeof createMockResponse>) {
  return vi.mocked(res.json).mock.calls.at(-1)?.[0] as {
    data?: { cleaned: boolean; deletedCount: number; message: string };
  };
}

describe('DELETE /api/attachments/cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports the count as a number, not "[object Object]"', async () => {
    mockAttachmentService.cleanupOrphanedAttachments.mockResolvedValue({
      deletedCount: 3,
    });

    const res = await call();

    expect(vi.mocked(res.status)).toHaveBeenCalledWith(200);

    const data = bodyOf(res).data;
    expect(data?.deletedCount).toBe(3);
    expect(data?.message).toBe('3 orphaned attachments were removed');
    expect(data?.message).not.toContain('[object Object]');
  });

  it('reports zero without inventing a count', async () => {
    mockAttachmentService.cleanupOrphanedAttachments.mockResolvedValue({
      deletedCount: 0,
    });

    const data = bodyOf(await call()).data;

    expect(data?.deletedCount).toBe(0);
    expect(data?.message).toBe('0 orphaned attachments were removed');
  });

  it('rejects an unauthenticated caller', async () => {
    const req = createMockRequest({
      method: 'DELETE',
      url: '/api/attachments/cleanup',
    });
    const res = createMockResponse();

    await cleanup(req, res);

    expect(vi.mocked(res.status)).toHaveBeenCalledWith(401);
    expect(
      mockAttachmentService.cleanupOrphanedAttachments
    ).not.toHaveBeenCalled();
  });
});
