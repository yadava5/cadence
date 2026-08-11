/**
 * Best-effort deletion of Vercel Blob objects that no longer have a row.
 *
 * ## Why this file exists
 *
 * `server-handlers/upload/index.ts` stores every attachment with
 * `access: 'public'`, which is not a permission on a URL — it IS the URL. The
 * blob is fetchable by anyone who has ever seen the link, forever, with no auth
 * check of any kind. Meanwhile `AttachmentService` carried four `TODO: delete
 * file from storage` comments and an unused private helper, so deleting an
 * attachment, deleting the task it hung off, or deleting the entire account
 * removed the row and left the object. The user's file stayed on the internet
 * after they deleted it and after they deleted their account.
 *
 * ## Best effort, and deliberately so
 *
 * Every caller has ALREADY removed the database row (or is about to, inside a
 * transaction that must not wait on a network call to a third party). A blob
 * that fails to delete is a leaked object; an exception thrown here would turn
 * that into a failed user-facing request for a delete that has already
 * happened. So: never throw, log what failed, return how many URLs were sent.
 *
 * Callers must invoke this AFTER their transaction commits. Inside an open
 * transaction it would hold a Postgres connection across an HTTP round trip,
 * and a subsequent rollback would leave the blobs gone and the rows intact —
 * the one inconsistency worse than the leak.
 */

import { query, type SqlClient } from '../config/database.js';

/** Vercel Blob's own cap on a single `del` call is generous; batch anyway. */
const BATCH = 100;

/**
 * True for a URL this module can actually delete.
 *
 * The dev/no-token upload path returns `data:` URIs rather than blob URLs (see
 * `server-handlers/upload/index.ts:64`), and those live in the same `fileUrl`
 * column. There is nothing remote to delete for them, and handing one to `del`
 * is an error, not a no-op.
 */
function isBlobUrl(url: unknown): url is string {
  return (
    typeof url === 'string' &&
    (url.startsWith('https://') || url.startsWith('http://'))
  );
}

/**
 * Delete blob objects by URL. Returns the number of distinct URLs submitted
 * (not confirmed deleted — see "best effort" above).
 *
 * No-ops without `BLOB_READ_WRITE_TOKEN`: `del()` throws
 * `BlobError: No token found` in that case, and local dev / tests legitimately
 * run without one. This mirrors the `hasBlob` guard the upload route already
 * uses to decide whether it is talking to Blob at all.
 */
export async function deleteBlobObjects(
  urls: Array<string | null | undefined>
): Promise<number> {
  const targets = Array.from(new Set(urls.filter(isBlobUrl)));
  if (targets.length === 0) return 0;

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    // Not an error: the dev path never wrote to Blob in the first place.
    console.warn(
      `blob cleanup skipped for ${targets.length} url(s): BLOB_READ_WRITE_TOKEN is not set`
    );
    return 0;
  }

  let del: (url: string | string[]) => Promise<void>;
  try {
    ({ del } = await import('@vercel/blob'));
  } catch (error) {
    console.error('blob cleanup unavailable (@vercel/blob):', String(error));
    return 0;
  }

  for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH);
    try {
      await del(batch);
    } catch (error) {
      // One bad URL fails its whole batch, so retry the batch one at a time
      // rather than leaking every object that happened to share it.
      console.error(
        `blob cleanup batch of ${batch.length} failed, retrying individually:`,
        String(error)
      );
      for (const url of batch) {
        try {
          await del(url);
        } catch (individual) {
          console.error(`blob cleanup failed for ${url}:`, String(individual));
        }
      }
    }
  }

  return targets.length;
}

/**
 * Rows returned by both collectors below.
 */
type BlobRow = { fileUrl: string; thumbnailUrl: string | null };

function toUrls(rows: BlobRow[]): string[] {
  return rows.flatMap((r) =>
    [r.fileUrl, r.thumbnailUrl].filter((u): u is string => Boolean(u))
  );
}

/**
 * The blob URLs hanging off a set of the caller's tasks — read BEFORE those
 * tasks are deleted.
 *
 * `attachments_taskId_fkey` is `ON DELETE CASCADE`, so `DELETE FROM tasks`
 * takes the attachment rows with it in the same statement. The instant that
 * returns, nothing anywhere records which objects those rows pointed at, and
 * the blobs — public, permanent URLs — are beyond the reach of any later
 * cleanup. This is the only moment they can be collected, which is why the
 * cascade paths call it before deleting rather than leaving a TODO.
 *
 * Scoped through `tasks."userId"`: a caller cannot enumerate another tenant's
 * file URLs with it.
 */
export async function collectAttachmentBlobUrlsForTasks(
  taskIds: string[],
  userId: string,
  client?: SqlClient
): Promise<string[]> {
  if (taskIds.length === 0 || !userId) return [];
  const placeholders = taskIds.map((_, i) => `$${i + 1}`).join(',');
  const res = await query<BlobRow>(
    `SELECT a."fileUrl", a."thumbnailUrl"
       FROM attachments a
       JOIN tasks t ON t.id = a."taskId"
      WHERE a."taskId" IN (${placeholders}) AND t."userId" = $${taskIds.length + 1}`,
    [...taskIds, userId],
    client
  );
  return toUrls(res.rows);
}

/**
 * Every blob URL belonging to one user — the account-deletion equivalent of the
 * above, read before that account's tasks are removed.
 */
export async function collectAttachmentBlobUrlsForUser(
  userId: string,
  client?: SqlClient
): Promise<string[]> {
  if (!userId) return [];
  const res = await query<BlobRow>(
    `SELECT a."fileUrl", a."thumbnailUrl"
       FROM attachments a
       JOIN tasks t ON t.id = a."taskId"
      WHERE t."userId" = $1`,
    [userId],
    client
  );
  return toUrls(res.rows);
}
