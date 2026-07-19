/**
 * DELETE /api/account — permanently delete the authenticated user's account.
 *
 * STRICTLY user-scoped: every statement is filtered by the caller's own
 * `userId` (or the user's own `id`), run inside a single transaction. This
 * co-tenants a shared Supabase project (TaskFlow lives in the `public` schema),
 * so we NEVER issue an unscoped delete and NEVER touch the global `tags` table
 * (shared, no user column) or any other tenant's schema. The pool pins
 * `search_path=public` for every connection, so unqualified table names resolve
 * to TaskFlow's own tables only.
 */
import type { VercelResponse } from '@vercel/node';
import { createCrudHandler } from '../../lib/utils/apiHandler.js';
import { withTransaction } from '../../lib/config/database.js';
import { sendSuccess, sendError } from '../../lib/middleware/errorHandler.js';
import { UnauthorizedError, InternalServerError } from '../../lib/types/api.js';
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

      const counts = await withTransaction(async (client) => {
        // Dependency order. task_tags + attachments hang off the user's tasks;
        // events/tasks/task_lists/calendars/user_profiles are directly
        // user-owned. The global `tags` table is shared and left untouched.
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
          user: users.rowCount ?? 0,
        };
      });

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
