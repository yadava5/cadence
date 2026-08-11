/**
 * GET /api/auth/me - Get current authenticated user information
 */
import { createApiHandler } from '../../lib/utils/apiHandler.js';
import { HttpMethod } from '../../lib/types/api.js';
import type { AuthenticatedRequest } from '../../lib/types/api.js';
import type { VercelResponse } from '@vercel/node';
import { authService } from '../../packages/backend/src/services/AuthService.js';

/**
 * `createApiHandler` takes a method-keyed object, not `{ routes: [...] }`.
 *
 * With the array form, `routes['GET']` was `undefined` and the dispatcher fell
 * straight through to `sendError(405, 'METHOD_NOT_ALLOWED')` — so this endpoint
 * answered 405 to every request from the day it was written, in production
 * included. The handler body below never ran once.
 *
 * The shape is an excess-property error (`'routes' does not exist in type
 * Partial<Record<HttpMethod, RouteConfig>>`), which is why the typecheck project
 * added alongside this fix is the durable half of it. Note the limit of that
 * gate: excess-property checking only fires on a fresh object literal at the
 * call site, and `Partial<Record<...>>` has no required keys, so a hoisted
 * `const cfg = { routes: [...] }` would still slip through. The runtime test in
 * `server-handlers/auth/__tests__/me.test.ts` is the second, independent gate.
 *
 * The endpoint is kept rather than deleted: nothing in `src/` calls it today,
 * but it is the canonical identity endpoint and two other implementations of
 * the same route already exist and are exercised — `scripts/dev-server.ts:581`
 * and `packages/backend/src/routes/auth.ts:705`. Deleting the serverless one
 * would leave the local dev server answering a route production does not have.
 */
export default createApiHandler({
  [HttpMethod.GET]: {
    method: HttpMethod.GET,
    requireAuth: true,
    handler: async (req: AuthenticatedRequest, res: VercelResponse) => {
      try {
        // User is already authenticated via middleware
        if (!req.user) {
          return res.status(401).json({
            success: false,
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication required',
              timestamp: new Date().toISOString(),
            },
          });
        }

        // Fetch full user details from database
        const user = await authService.getUserById(req.user.id);

        if (!user) {
          return res.status(404).json({
            success: false,
            error: {
              code: 'USER_NOT_FOUND',
              message: 'User not found',
              timestamp: new Date().toISOString(),
            },
          });
        }

        // Return user information
        return res.status(200).json({
          success: true,
          data: {
            id: user.id,
            email: user.email,
            name: user.name,
            createdAt: user.createdAt,
            profile: user.profile,
          },
          meta: {
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        console.error('Get current user error:', error);
        return res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'An error occurred while fetching user information',
            timestamp: new Date().toISOString(),
          },
        });
      }
    },
  },
});
