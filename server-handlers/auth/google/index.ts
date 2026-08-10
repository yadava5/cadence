/**
 * /api/auth/google
 *   GET  — return a Google OAuth authorization URL
 *   POST — exchange { code, redirectUri } for a Cadence session
 *          (the shape the SPA's GoogleCallback page sends)
 */
import { createMethodHandler } from '../../../lib/utils/apiHandler.js';
import { HttpMethod } from '../../../lib/types/api.js';
import type { AuthenticatedRequest } from '../../../lib/types/api.js';
import type { VercelResponse } from '@vercel/node';
import { googleOAuthService } from '../../../packages/backend/src/services/GoogleOAuthService.js';

export default createMethodHandler({
  [HttpMethod.POST]: async (req: AuthenticatedRequest, res: VercelResponse) => {
    try {
      if (!googleOAuthService.isConfigured()) {
        return res.status(503).json({
          success: false,
          error: {
            code: 'GOOGLE_OAUTH_NOT_CONFIGURED',
            message: 'Google OAuth is not configured on this server',
            timestamp: new Date().toISOString(),
          },
        });
      }

      const { code, redirectUri } = (req.body ?? {}) as {
        code?: string;
        redirectUri?: string;
      };
      if (!code) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_AUTH_CODE',
            message: 'Authorization code is required',
            timestamp: new Date().toISOString(),
          },
        });
      }

      const authResult = await googleOAuthService.handleCallback(
        code,
        redirectUri
      );
      return res.status(200).json({
        success: true,
        data: authResult,
        meta: { timestamp: new Date().toISOString() },
      });
    } catch (error) {
      const err = error as Error;
      const failed = err.message === 'GOOGLE_OAUTH_FAILED';
      console.error('Google sign-in exchange error:', err);
      return res.status(failed ? 400 : 500).json({
        success: false,
        error: {
          code: failed ? 'GOOGLE_OAUTH_FAILED' : 'INTERNAL_ERROR',
          message: failed
            ? 'Failed to authenticate with Google'
            : 'An error occurred during Google authentication',
          timestamp: new Date().toISOString(),
        },
      });
    }
  },
  [HttpMethod.GET]: async (req: AuthenticatedRequest, res: VercelResponse) => {
    try {
      // Check if Google OAuth is configured
      if (!googleOAuthService.isConfigured()) {
        return res.status(503).json({
          success: false,
          error: {
            code: 'GOOGLE_OAUTH_NOT_CONFIGURED',
            message: 'Google OAuth is not configured on this server',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // Generate Google OAuth authorization URL
      const authUrl = googleOAuthService.getAuthUrl();

      return res.status(200).json({
        success: true,
        data: {
          authUrl,
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('Google OAuth URL generation error:', error);
      return res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to generate Google OAuth URL',
          timestamp: new Date().toISOString(),
        },
      });
    }
  },
});
