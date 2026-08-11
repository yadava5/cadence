/**
 * POST /api/auth/refresh - Refresh access token using refresh token
 */
import { createMethodHandler } from '../../lib/utils/apiHandler.js';
import { HttpMethod } from '../../lib/types/api.js';
import type { AuthenticatedRequest } from '../../lib/types/api.js';
import type { VercelResponse } from '@vercel/node';
import { refreshTokenService } from '../../packages/backend/src/services/RefreshTokenService.js';
import { z } from 'zod';

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export default createMethodHandler(
  {
    [HttpMethod.POST]: async (
      req: AuthenticatedRequest,
      res: VercelResponse
    ) => {
      try {
        // Validate request body
        const validationResult = refreshSchema.safeParse(req.body);

        if (!validationResult.success) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid refresh token request',
              details: validationResult.error.errors,
              timestamp: new Date().toISOString(),
            },
          });
        }

        const { refreshToken } = validationResult.data;

        // Check for token reuse (security breach)
        const isTokenReuse =
          await refreshTokenService.detectTokenReuse(refreshToken);
        if (isTokenReuse) {
          return res.status(401).json({
            success: false,
            error: {
              code: 'TOKEN_REUSE_DETECTED',
              message:
                'Refresh token reuse detected. All tokens have been invalidated for security.',
              timestamp: new Date().toISOString(),
            },
          });
        }

        // Rotate refresh token (invalidate old, create new pair)
        const newTokenPair =
          await refreshTokenService.rotateRefreshToken(refreshToken);

        // Return new token pair
        return res.status(200).json({
          success: true,
          data: newTokenPair,
          meta: {
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        const err = error as Error;

        // Every way a refresh token can be refused is a 401, not a 500. The
        // last two used to fall through to the generic 500 below and nobody
        // noticed, because revocation lived in a per-process Set that was
        // almost always empty. Now that it is a durable row (migration 0005)
        // REFRESH_TOKEN_REVOKED is the ORDINARY outcome of "this user logged
        // out", and REFRESH_TOKEN_NOT_FOUND is the ordinary outcome of a token
        // whose row was rotated away — answering 500 to either would tell the
        // client "server broken, retry" instead of "sign in again".
        if (
          err.message === 'REFRESH_TOKEN_NOT_FOUND' ||
          err.message === 'REFRESH_TOKEN_REVOKED' ||
          err.message === 'TOKEN_USER_MISMATCH' ||
          err.message === 'TOKEN_EXPIRED' ||
          err.message === 'TOKEN_INVALID'
        ) {
          return res.status(401).json({
            success: false,
            error: {
              code: 'INVALID_REFRESH_TOKEN',
              message: 'Invalid or expired refresh token',
              timestamp: new Date().toISOString(),
            },
          });
        }

        if (err.message === 'INVALID_TOKEN_TYPE') {
          return res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_TOKEN_TYPE',
              message: 'Token must be a refresh token',
              timestamp: new Date().toISOString(),
            },
          });
        }

        // Generic server error
        console.error('Token refresh error:', err);
        return res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'An error occurred during token refresh',
            timestamp: new Date().toISOString(),
          },
        });
      }
    },
  },
  // NOT the credential-stuffing bucket: a live session refreshes on its own
  // schedule and after any 401, and a 429 here makes `authStore` clear auth and
  // force a re-login that the login limiter then blocks too.
  { rateLimit: 'authRefresh' }
);
