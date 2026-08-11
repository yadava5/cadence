/**
 * DELETE /api/account — permanently delete the authenticated user's account.
 *
 * STRICTLY user-scoped: every statement is filtered by the caller's own
 * `userId` (or the user's own `id`), run inside a single transaction. This
 * co-tenants a shared Supabase project (Cadence lives in the `public` schema),
 * so we NEVER issue an unscoped delete and never reach another tenant's schema.
 * The pool pins `search_path=public` for every connection, so unqualified table
 * names resolve to Cadence's own tables only.
 *
 * `tags` is deleted too. It used to be described here as "global, shared, left
 * untouched"; that stopped being true at `0001_tags_add_userid.sql`, which gave
 * tags a `userId` and a `tags_userId_fkey ... ON DELETE CASCADE`. The tags were
 * therefore already being deleted — by the foreign key, one line below the
 * comment saying they were not. They are now deleted explicitly, in dependency
 * order with everything else, so the statement and the comment agree and the
 * returned counts say what actually went.
 *
 * ## Sessions and files outlived the account
 *
 * Two things survived deletion and no longer do.
 *
 * Refresh tokens: with revocation living in a per-process Map there was nothing
 * to revoke, so a deleted user's session simply continued. Their rows in
 * `refresh_tokens` (migration 0005) are deleted here, which fails their next
 * refresh closed. Their ACCESS token still works until it expires — up to 15
 * minutes — and that is a deliberate trade, not an oversight: see
 * `RefreshTokenService`. It buys nothing, because every tenant table is scoped
 * by `userId` and those rows are gone; the requests just return empty.
 *
 * Attachment blobs: uploads are stored `access: 'public'`, so the URL IS the
 * permission. Deleting the rows left every file the user ever attached
 * permanently fetchable by anyone who had seen the link — after they deleted
 * their account. The URLs are collected inside the transaction (the cascade
 * destroys the only record of them) and the objects are deleted AFTER the
 * commit: a network call inside an open transaction would hold a Postgres
 * connection across an HTTP round trip, and a rollback afterwards would leave
 * the files gone and the account intact.
 *
 * ## The shared demo account cannot be deleted, and that guard lives HERE
 *
 * `john@example.com / password123` is printed on the landing page and wired to
 * a one click "Sign in as the demo account" button, so a valid token for the
 * demo user is one click away for any visitor on the internet. Before this
 * guard the only thing between that visitor and the permanent end of the public
 * demo was typing `DELETE` into a text field. Deleting it would also break the
 * promise the landing page makes ("the demo user keeps its seeded week between
 * visits") and the keep alive cron, which answers "Demo account not found" once
 * the row is gone.
 *
 * The Settings screen now disables the control for that account, but the client
 * is a courtesy: it is trivially bypassed with one `fetch`. The refusal below is
 * the actual protection, and it resolves the identity from the `users` row by
 * id rather than from the JWT's `email` claim, so it cannot be talked out of by
 * a token minted before an address changed. The lookup is the same shape login
 * and demo/reanchor.ts already use: `users` is not tenant scoped by RLS (0002
 * excluded it; 0004 enabled RLS with a permissive `FOR ALL TO cadence_app`
 * policy that leaves behaviour identical), so it sees the real row.
 */
import type { VercelResponse } from '@vercel/node';
import { createCrudHandler } from '../../lib/utils/apiHandler.js';
import { query, withTransaction } from '../../lib/config/database.js';
import { DEMO_EMAIL, isDemoEmail } from '../../lib/config/demo.js';
import {
  collectAttachmentBlobUrlsForUser,
  deleteBlobObjects,
} from '../../lib/utils/blobCleanup.js';
import { sendSuccess, sendError } from '../../lib/middleware/errorHandler.js';
import {
  UnauthorizedError,
  ForbiddenError,
  InternalServerError,
} from '../../lib/types/api.js';
import type { AuthenticatedRequest } from '../../lib/types/api.js';

export default createCrudHandler({
  delete: async (req: AuthenticatedRequest, res: VercelResponse) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return sendError(
          res,
          new UnauthorizedError('User authentication required')
        );
      }

      // Fail CLOSED. A missing row means we could not establish whose account
      // this is, and "we are not sure" must never resolve to "delete it": the
      // one account this endpoint most needs to protect is the one whose
      // credentials are public. Refusing an unresolvable account costs a real
      // user a confusing 403 in a case that should not happen; the other way
      // round costs everyone the demo.
      const owner = await query<{ email: string }>(
        'SELECT email FROM public.users WHERE id = $1 LIMIT 1',
        [userId]
      );
      const email = owner.rows[0]?.email;
      if (!email) {
        return sendError(
          res,
          new ForbiddenError(
            'This account could not be verified, so it was not deleted. Sign in again and retry.'
          )
        );
      }
      if (isDemoEmail(email)) {
        return sendError(
          res,
          new ForbiddenError(
            `${DEMO_EMAIL} is the shared public demo account, so it cannot be deleted. ` +
              'Its credentials are published for anyone to try Cadence with, and deleting it ' +
              'would end the demo for everyone. Register your own account to get one you can delete.'
          )
        );
      }

      let blobUrls: string[] = [];

      const counts = await withTransaction(async (client) => {
        // Dependency order. task_tags + attachments hang off the user's tasks;
        // events/tasks/task_lists/calendars/tags/user_profiles are directly
        // user-owned; refresh_tokens is keyed on the user id.

        // FIRST, while the rows still exist: the blob URLs. After the delete
        // below (and the FK cascade behind it) nothing records which objects
        // these rows pointed at, and the files are unreachable forever.
        blobUrls = await collectAttachmentBlobUrlsForUser(userId, client);

        await client.query(
          `DELETE FROM "task_tags" WHERE "taskId" IN (SELECT id FROM tasks WHERE "userId" = $1)`,
          [userId]
        );
        await client.query(
          `DELETE FROM attachments WHERE "taskId" IN (SELECT id FROM tasks WHERE "userId" = $1)`,
          [userId]
        );
        const tasks = await client.query(
          `DELETE FROM tasks WHERE "userId" = $1`,
          [userId]
        );
        const events = await client.query(
          `DELETE FROM events WHERE "userId" = $1`,
          [userId]
        );
        const taskLists = await client.query(
          `DELETE FROM "task_lists" WHERE "userId" = $1`,
          [userId]
        );
        const calendars = await client.query(
          `DELETE FROM calendars WHERE "userId" = $1`,
          [userId]
        );
        const tags = await client.query(
          `DELETE FROM tags WHERE "userId" = $1`,
          [userId]
        );
        // Revocation. `refresh_tokens_userId_fkey` is ON DELETE CASCADE so the
        // row below would take these anyway; saying it explicitly means the
        // account's sessions end even if that FK is ever dropped, and it puts
        // the count in the response.
        const refreshTokens = await client.query(
          `DELETE FROM refresh_tokens WHERE "userId" = $1`,
          [userId]
        );
        await client.query(`DELETE FROM user_profiles WHERE "userId" = $1`, [
          userId,
        ]);
        const users = await client.query(`DELETE FROM users WHERE id = $1`, [
          userId,
        ]);

        return {
          tasks: tasks.rowCount ?? 0,
          events: events.rowCount ?? 0,
          taskLists: taskLists.rowCount ?? 0,
          calendars: calendars.rowCount ?? 0,
          tags: tags.rowCount ?? 0,
          refreshTokens: refreshTokens.rowCount ?? 0,
          user: users.rowCount ?? 0,
        };
      });

      // AFTER the commit — see the header. Best effort: the account is already
      // gone, and a Blob outage must not turn a completed deletion into a 500.
      await deleteBlobObjects(blobUrls);

      sendSuccess(res, { deleted: true, counts });
    } catch (error) {
      console.error('DELETE /api/account error:', error);
      sendError(
        res,
        new InternalServerError(
          (error as Error).message || 'Failed to delete account'
        )
      );
    }
  },

  requireAuth: true,
  rateLimit: 'write',
});
