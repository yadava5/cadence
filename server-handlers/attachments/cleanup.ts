/**
 * Attachment Cleanup API Route - Remove orphaned attachments
 *
 * ## Kept, not deleted — and why the deletion case is still open
 *
 * Two claims say this route can never do anything:
 *   1. `attachments_taskId_fkey` is `ON DELETE CASCADE`, so deleting a task
 *      takes its attachments with it and an orphan cannot be created.
 *   2. Under RLS the orphan-finding query cannot match anyway: the attachments
 *      policy is an `EXISTS` over the parent task, and an orphan has no parent.
 *
 * Both are plausible and (1) is visible in `lib/__tests__/fixtures/schema.sql`
 * — but that is a *test fixture*, not the production schema, and this session
 * had no route to the production database (no psql, no admin credentials) to
 * check `pg_constraint`. Deleting a live route on the strength of a fixture is
 * exactly the wrong-artifact mistake, so the route stays and the response bug
 * is fixed. If someone confirms the FK cascades in production, deleting this
 * handler and its `['attachments','cleanup']` entry in `api/index.ts` is the
 * right follow-up — `AttachmentService.cleanupOrphanedAttachments` goes with
 * it.
 */
import { createMethodHandler } from '../../lib/utils/apiHandler.js';
import { getAllServices } from '../../lib/services/index.js';
import { sendSuccess, sendError } from '../../lib/middleware/errorHandler.js';
import { HttpMethod } from '../../lib/types/api.js';
import type { AuthenticatedRequest } from '../../lib/types/api.js';
import type { VercelResponse } from '@vercel/node';
import {
  UnauthorizedError,
  ForbiddenError,
  InternalServerError,
} from '../../lib/types/api.js';

export default createMethodHandler(
  {
    [HttpMethod.DELETE]: async (
      req: AuthenticatedRequest,
      res: VercelResponse
    ) => {
      try {
        const { attachment: attachmentService } = getAllServices();
        const userId = req.user?.id;

        if (!userId) {
          return sendError(
            res,
            new UnauthorizedError('User authentication required')
          );
        }

        // `cleanupOrphanedAttachments` returns `{ deletedCount }`, not a
        // number. Assigning the whole object to a variable called
        // `deletedCount` made the response read
        // "[object Object] orphaned attachments were removed", and put an
        // object where the field's name promises a count.
        const { deletedCount } =
          await attachmentService.cleanupOrphanedAttachments({
            userId,
            requestId: req.headers['x-request-id'] as string,
          });

        sendSuccess(res, {
          cleaned: true,
          deletedCount,
          message: `${deletedCount} orphaned attachments were removed`,
        });
      } catch (error) {
        console.error('DELETE /api/attachments/cleanup error:', error);

        if (error.message?.includes('AUTHORIZATION_ERROR')) {
          return sendError(res, new ForbiddenError('Access denied'));
        }

        sendError(
          res,
          new InternalServerError(
            error.message || 'Failed to cleanup orphaned attachments'
          )
        );
      }
    },
  },
  { requireAuth: true }
);
