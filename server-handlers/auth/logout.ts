/**
 * POST /api/auth/logout - Logout user and invalidate refresh token
 */
import { createMethodHandler } from '../../lib/utils/apiHandler.js';
import { HttpMethod } from '../../lib/types/api.js';
import type { AuthenticatedRequest } from '../../lib/types/api.js';
import type { VercelResponse } from '@vercel/node';
import { refreshTokenService } from '../../packages/backend/src/services/RefreshTokenService.js';
import { z } from 'zod';

const logoutSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
  logoutAll: z.boolean().optional(), // Logout from all devices
});

export default createMethodHandler(
  {
    [HttpMethod.POST]: async (
      req: AuthenticatedRequest,
      res: VercelResponse
    ) => {
      try {
        // Validate request body
        const validationResult = logoutSchema.safeParse(req.body);

        if (!validationResult.success) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid logout request',
              details: validationResult.error.errors,
              timestamp: new Date().toISOString(),
            },
          });
        }

        const { refreshToken, logoutAll } = validationResult.data;

        // AWAITED, both branches. Revocation is a database write now
        // (packages/backend/.../RefreshTokenService + migration 0005); firing it
        // and returning would let the response claim a revocation that had not
        // happened yet — and on a serverless instance the invocation can be
        // frozen the moment the response is sent, so it might never happen.
        if (logoutAll && req.user) {
          // Every device. This used to iterate a per-process Map that is empty
          // on a cold instance: it invalidated nothing while the response below
          // said "Logged out from all devices".
          await refreshTokenService.invalidateAllUserTokens(req.user.id);
        } else {
          // Only this token — and only if it is the CALLER'S token. The route
          // requires auth, so `req.user` is the verified caller; passing the id
          // means one user cannot revoke another user's session by posting a
          // refresh token they got hold of.
          await refreshTokenService.invalidateRefreshToken(
            refreshToken,
            req.user?.id
          );
        }

        return res.status(200).json({
          success: true,
          data: {
            message: logoutAll
              ? 'Logged out from all devices'
              : 'Logged out successfully',
          },
          meta: {
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        // Even if there's an error, we still want to indicate success
        // since the token is likely already invalid
        console.error('Logout error:', error);
        return res.status(200).json({
          success: true,
          data: {
            message: 'Logged out successfully',
          },
          meta: {
            timestamp: new Date().toISOString(),
          },
        });
      }
    },
  },
  { requireAuth: true }
);
