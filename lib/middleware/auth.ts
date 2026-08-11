/**
 * Authentication middleware - JWT token verification
 */
import type { VercelResponse } from '@vercel/node';
import type { AuthenticatedRequest, Middleware } from '../types/api.js';
import { UnauthorizedError } from '../types/api.js';
import {
  verifyToken,
  extractTokenFromHeader,
} from '../../packages/backend/src/utils/jwt.js';
import { runWithRls } from '../config/rlsContext.js';

/**
 * JWT authentication middleware
 * Verifies JWT token and attaches user context to request
 *
 * ## Access tokens are NOT checked against a revocation list, on purpose
 *
 * Refresh tokens now are — durably, in `public.refresh_tokens` (migration
 * 0005) — because they live 7 days and a stolen or logged-out one used to keep
 * working for all of them. The obvious next step is to check access tokens the
 * same way here. It is deliberately not taken:
 *
 *  - An access token lives 15 minutes (`JWT_EXPIRES_IN`, packages/backend/src/
 *    utils/jwt.ts:18). Durable refresh revocation already caps a revoked
 *    session at that, so the check would buy at most a 15-minute window.
 *  - The cost is a database round trip on EVERY authenticated request — this
 *    middleware runs before every handler — and it puts Postgres on the
 *    critical path of authentication itself. A pooler hiccup would stop being
 *    "some requests fail" and start being "nobody is logged in".
 *  - It would be the one check with no cheaper equivalent: the tenant tables
 *    are all scoped by `userId`, so an access token for a deleted or
 *    logged-out account already reads and writes nothing. What it buys is
 *    minutes of "session looks alive", not access to data.
 *
 * The in-memory `TokenBlacklistService` is not consulted here either, and that
 * is the same judgement rather than an oversight: per-instance state is empty
 * on a cold serverless instance, so consulting it would provide security that
 * holds only by luck — the exact illusion the refresh-token work removed.
 *
 * If the 15-minute window ever needs closing, the cheap version is a
 * `tokensRevokedAt` column on `users` compared against the token's `iat`,
 * cached per instance — not a per-request blacklist lookup.
 */
export function authenticateJWT(): Middleware {
  return async (
    req: AuthenticatedRequest,
    res: VercelResponse,
    next: () => void
  ) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or invalid authorization header');
    }

    const token = extractTokenFromHeader(authHeader);

    if (!token) {
      throw new UnauthorizedError('Missing JWT token');
    }

    try {
      // Verify JWT token
      const decoded = await verifyToken(token);

      // Ensure it's an access token
      if (decoded.type !== 'access') {
        throw new UnauthorizedError('Invalid token type');
      }

      // Attach user context to request
      req.user = {
        id: decoded.userId,
        email: decoded.email,
        name: decoded.email.split('@')[0], // Extract name from email as fallback
      };

      // Enter the RLS context for the entire downstream chain + handler.
      // `composeMiddleware` starts the downstream chain synchronously inside
      // this `next()` call, so every DB query issued while handling the request
      // runs with `app.user_id` bound to this verified user (see database.ts).
      return runWithRls(decoded.userId, () => next());
    } catch (error) {
      if (error instanceof Error) {
        if (error.message === 'TOKEN_EXPIRED') {
          throw new UnauthorizedError('Token expired');
        } else if (error.message === 'TOKEN_INVALID') {
          throw new UnauthorizedError('Invalid token');
        }
      }
      throw new UnauthorizedError('Authentication failed');
    }
  };
}

/**
 * Optional authentication middleware
 * Adds user context if token is present, but doesn't require it
 */
export function optionalAuth(): Middleware {
  return async (
    req: AuthenticatedRequest,
    res: VercelResponse,
    next: () => void
  ) => {
    try {
      const authHeader = req.headers.authorization;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = extractTokenFromHeader(authHeader);

        if (token) {
          try {
            // Verify JWT token
            const decoded = await verifyToken(token);

            // Ensure it's an access token
            if (decoded.type === 'access') {
              // Attach user context to request
              req.user = {
                id: decoded.userId,
                email: decoded.email,
                name: decoded.email.split('@')[0],
              };
            }
          } catch {
            // Silently ignore verification errors for optional auth
          }
        }
      }
    } catch {
      // Ignore auth errors for optional auth
    }

    next();
  };
}

/**
 * Dev-only auth injection
 * In development, attach a default user so endpoints can run without full JWT.
 */
export function devAuth(): Middleware {
  return async (
    req: AuthenticatedRequest,
    _res: VercelResponse,
    next: () => void
  ) => {
    if (process.env.NODE_ENV !== 'production' && !req.user) {
      req.user = {
        id: 'dev-user-id',
        email: 'dev@example.com',
        name: 'Dev User',
      };
    }
    // Bind the RLS context (real or dev user) for the downstream chain so the
    // local dev server exercises the same GUC path as production.
    return runWithRls(req.user?.id ?? null, () => next());
  };
}

/**
 * Role-based authorization middleware (placeholder)
 * Will be implemented if needed in future tasks
 */
export function requireRole(_role: string): Middleware {
  return async (
    _req: AuthenticatedRequest,
    _res: VercelResponse,
    next: () => void
  ) => {
    if (!_req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    // Reference parameter to satisfy linter until roles are implemented
    void _role;

    // TODO: Implement role checking when user roles are added
    // For now, just pass through
    next();
  };
}

/**
 * Resource ownership middleware
 * Ensures user can only access their own resources
 */
export function requireOwnership(
  getResourceUserId: (req: AuthenticatedRequest) => string | Promise<string>
): Middleware {
  return async (
    req: AuthenticatedRequest,
    res: VercelResponse,
    next: () => void
  ) => {
    if (!req.user) {
      throw new UnauthorizedError('Authentication required');
    }

    const resourceUserId = await getResourceUserId(req);

    if (resourceUserId !== req.user.id) {
      throw new UnauthorizedError('Access denied');
    }

    next();
  };
}
