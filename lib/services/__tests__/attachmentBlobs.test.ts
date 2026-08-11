/**
 * Attachment deletion must delete the BLOB, not just the row.
 *
 * `server-handlers/upload/index.ts` stores every attachment with
 * `access: 'public'`. There is no signed URL and no auth check on the object —
 * the URL *is* the permission. So a delete that removed the database row and
 * left the object behind did not delete the user's file at all; it deleted the
 * app's ability to see it, and left a permanent public link to a document the
 * user believes is gone. That was the state of things behind four
 * `TODO: delete file from storage` comments and an unused private helper.
 *
 * These tests assert the call is actually issued, and — just as important —
 * that it is NOT issued when the delete was refused, when there is no token, or
 * for the dev path's `data:` URIs.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

import { AttachmentService } from '../AttachmentService';
import { TaskService } from '../TaskService';
import { query as mockQuery } from '../../config/database.js';
import { createQueryResult } from './helpers/mockDatabase';

vi.mock('../../config/database.js', () => {
  const query = vi.fn();
  return {
    query,
    withTransaction: vi.fn(async (cb) => cb({ query })),
    pool: { query },
  };
});

const del = vi.fn(async () => undefined);
vi.mock('@vercel/blob', () => ({ del: (...args: unknown[]) => del(...args) }));

const mockedQuery = vi.mocked(mockQuery);
const ctx = { userId: 'user-123', requestId: 'req-1' };

const FULL = 'https://blob.vercel-storage.com/report-abc.pdf';
const THUMB = 'https://blob.vercel-storage.com/report-abc.thumb.webp';

const attachmentRow = {
  id: 'att-1',
  taskId: 'task-1',
  fileName: 'report.pdf',
  fileUrl: FULL,
  fileType: 'application/pdf',
  fileSize: 1024,
  thumbnailUrl: THUMB,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('attachment blob cleanup', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
    del.mockClear();
    process.env.BLOB_READ_WRITE_TOKEN = 'test-token';
  });

  it('AttachmentService.delete removes the object as well as the row', async () => {
    const svc = new AttachmentService();
    mockedQuery
      .mockResolvedValueOnce(createQueryResult([attachmentRow])) // ownership + urls
      .mockResolvedValueOnce(createQueryResult([], 1)); // DELETE

    await expect(svc.delete('att-1', ctx)).resolves.toBe(true);

    // Both the original and its thumbnail — a thumbnail left behind is just as
    // public as the file it previews.
    expect(del).toHaveBeenCalledTimes(1);
    expect(del).toHaveBeenCalledWith([FULL, THUMB]);
  });

  it('does NOT delete objects when the row delete was refused', async () => {
    const svc = new AttachmentService();
    // Ownership check finds nothing: another tenant's attachment id.
    mockedQuery.mockResolvedValueOnce(createQueryResult([]));

    await expect(svc.delete('someone-elses', ctx)).rejects.toThrow(
      'AUTHORIZATION_ERROR'
    );
    expect(del).not.toHaveBeenCalled();
  });

  it('AttachmentService.bulkDelete removes every object it deleted rows for', async () => {
    const svc = new AttachmentService();
    const second = {
      ...attachmentRow,
      id: 'att-2',
      fileUrl: 'https://blob.vercel-storage.com/second.png',
      thumbnailUrl: null,
    };
    mockedQuery
      .mockResolvedValueOnce(
        createQueryResult([attachmentRow, second], 2) // ownership + urls
      )
      .mockResolvedValueOnce(createQueryResult([], 2)); // DELETE

    await svc.bulkDelete(['att-1', 'att-2'], ctx);

    expect(del).toHaveBeenCalledWith([FULL, THUMB, second.fileUrl]);
  });

  it('TaskService.delete collects blob urls BEFORE the FK cascade destroys them', async () => {
    const svc = new TaskService();
    mockedQuery
      .mockResolvedValueOnce(
        createQueryResult([{ fileUrl: FULL, thumbnailUrl: THUMB }], 1)
      )
      .mockResolvedValueOnce(createQueryResult([], 1)); // DELETE FROM tasks

    await expect(svc.delete('task-1', ctx)).resolves.toBe(true);

    // Order is the point: the collect runs first, because after the delete the
    // attachment rows are gone and nothing records which objects were theirs.
    const [collectSql] = mockedQuery.mock.calls[0];
    expect(String(collectSql)).toContain('FROM attachments a');
    const [deleteSql] = mockedQuery.mock.calls[1];
    expect(String(deleteSql)).toContain('DELETE FROM tasks');
    expect(del).toHaveBeenCalledWith([FULL, THUMB]);
  });

  it('a refused task delete leaves the objects alone', async () => {
    const svc = new TaskService();
    mockedQuery
      .mockResolvedValueOnce(
        createQueryResult([{ fileUrl: FULL, thumbnailUrl: THUMB }], 1)
      )
      .mockResolvedValueOnce(createQueryResult([], 0)); // not owned → 0 rows

    await expect(svc.delete('task-1', ctx)).resolves.toBe(false);
    expect(del).not.toHaveBeenCalled();
  });

  it('skips data: URIs from the dev upload path', async () => {
    const svc = new AttachmentService();
    mockedQuery
      .mockResolvedValueOnce(
        createQueryResult([
          {
            ...attachmentRow,
            fileUrl: 'data:application/pdf;base64,AAAA',
            thumbnailUrl: 'data:image/png;base64,BBBB',
          },
        ])
      )
      .mockResolvedValueOnce(createQueryResult([], 1));

    await svc.delete('att-1', ctx);

    // There is no remote object for a data URI, and handing one to `del` is an
    // error rather than a no-op.
    expect(del).not.toHaveBeenCalled();
  });

  it('no-ops without BLOB_READ_WRITE_TOKEN instead of throwing', async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const svc = new AttachmentService();
    mockedQuery
      .mockResolvedValueOnce(createQueryResult([attachmentRow]))
      .mockResolvedValueOnce(createQueryResult([], 1));

    // `del()` throws `BlobError: No token found` without one, and local dev
    // legitimately has none — a delete must not 500 because of it.
    await expect(svc.delete('att-1', ctx)).resolves.toBe(true);
    expect(del).not.toHaveBeenCalled();
  });
});
