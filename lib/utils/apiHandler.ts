/**
 * API route handler utilities for Vercel
 */
import type { VercelResponse } from '@vercel/node';
import type { z } from 'zod';
import type {
  AuthenticatedRequest,
  RouteConfig,
  RouteHandler,
} from '../types/api.js';
import { HttpMethod } from '../types/api.js';
import { asyncHandler, sendError } from '../middleware/errorHandler.js';
import { corsMiddleware } from '../middleware/cors.js';
import { requestIdMiddleware, requestLogger } from '../middleware/requestId.js';
import { rateLimit, rateLimitPresets } from '../middleware/rateLimit.js';
import { validateRequest } from '../middleware/validation.js';
import type { ValidationConfig } from '../middleware/validation.js';
import { composeMiddleware } from '../middleware/index.js';
import { devAuth, authenticateJWT } from '../middleware/auth.js';
import { ApiError } from '../types/api.js';
import { query } from '../config/database.js';

/**
 * Resolve a route's `rateLimit` declaration into an actual limiter.
 *
 * Both branches of the old `if (route.rateLimit)` pushed `rateLimitPresets.api`,
 * so every per-route limit in the repo was silently discarded — and since
 * `createCrudHandler` never forwarded its own `rateLimit` option either, that
 * meant EVERY declaration (`server-handlers/account/index.ts` asking for
 * `'write'`, and the explicit windows in `lib/examples/apiRouteExample.ts`) was
 * decoration.
 */
function resolveRouteRateLimit(
  method: HttpMethod,
  config: NonNullable<RouteConfig['rateLimit']>
) {
  if (typeof config === 'string') {
    return rateLimitPresets[config];
  }

  return rateLimit({
    bucket: config.bucket ?? `route:${method}:${config.windowMs}:${config.max}`,
    windowMs: config.windowMs,
    max: config.max,
  });
}

/**
 * Create a standardized API route handler
 */
export function createApiHandler(
  routes: Partial<Record<HttpMethod, RouteConfig>>
) {
  return asyncHandler(
    async (req: AuthenticatedRequest, res: VercelResponse) => {
      const method = req.method as HttpMethod;
      const route = routes[method];

      if (!route) {
        return sendError(
          res,
          new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed')
        );
      }

      // Build middleware pipeline
      const middlewares = [
        corsMiddleware(),
        requestIdMiddleware(),
        // Move devAuth before logger so logs show userId in dev
        ...(process.env.NODE_ENV !== 'production' ? [devAuth()] : []),
        requestLogger(),
      ];

      // Add rate limiting if configured
      middlewares.push(
        route.rateLimit
          ? resolveRouteRateLimit(method, route.rateLimit)
          : rateLimitPresets.api // Default rate limiting
      );

      // Add authentication if required
      if (route.requireAuth) {
        middlewares.push(authenticateJWT());
      }

      // Add validation if configured
      const validationConfig: ValidationConfig = {};
      if (route.validateBody) validationConfig.body = route.validateBody;
      if (route.validateQuery) validationConfig.query = route.validateQuery;

      if (Object.keys(validationConfig).length > 0) {
        middlewares.push(validateRequest(validationConfig));
      }

      // Execute middleware pipeline
      // Dev auth injection so req.user exists in development
      // devAuth injected earlier to ensure requestLogger sees userId in dev

      await composeMiddleware(...middlewares)(req, res, async () => {
        await route.handler(req, res);
      });
    }
  );
}

/**
 * Simple method-based route handler
 */
export function createMethodHandler(
  handlers: Partial<Record<HttpMethod, RouteHandler>>,
  options?: {
    rateLimit?: keyof typeof rateLimitPresets;
    /**
     * Attach `authenticateJWT()` so `req.user` is populated.
     *
     * Opt-in rather than default because this same factory serves the routes
     * that MUST stay public: `healthCheckHandler` below (the uptime probe and
     * the Supabase keep-alive both depend on it answering unauthenticated),
     * login, register, refresh, and the Google OAuth entry/callback.
     *
     * Every handler that reads `req.user` needs this. Without it the chain was
     * cors → requestId → requestLogger → rateLimit, so `req.user` was always
     * undefined and nine endpoints answered 401 unconditionally in production
     * — `tasks/stats`, `tasks/bulk`, `events/conflicts`, `tags/{stats,merge,
     * cleanup}`, `task-lists/stats`, `attachments/{stats,cleanup}` — plus
     * `auth/logout`, whose "log out from all devices" therefore never ran.
     */
    requireAuth?: boolean;
    /**
     * Per-method request validation, run after auth and before the handler.
     *
     * Same `validateRequest` middleware that `createApiHandler` drives from
     * `RouteConfig.validateBody/validateQuery`; this factory just had no way to
     * declare it, which is why `events/conflicts` parsed `?start=` with a bare
     * `new Date()` and answered 500 on garbage.
     */
    validate?: Partial<Record<HttpMethod, ValidationConfig>>;
  }
) {
  // Credential routes (login, register) pass `{ rateLimit: 'auth' }` to get the
  // strict 5/15min limiter instead of the lenient 100/15min api default — the
  // difference between a real credential-stuffing throttle and none. Token
  // refresh passes `'authRefresh'`: same family, different bucket, because a
  // live session's own refresh traffic is not a credential guess.
  const limiter = rateLimitPresets[options?.rateLimit ?? 'api'];
  return asyncHandler(
    async (req: AuthenticatedRequest, res: VercelResponse) => {
      const method = req.method as HttpMethod;
      const handler = handlers[method];

      if (!handler) {
        return sendError(
          res,
          new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed')
        );
      }

      const middlewares = [
        corsMiddleware(),
        requestIdMiddleware(),
        requestLogger(),
        limiter,
      ];
      if (options?.requireAuth) {
        middlewares.push(authenticateJWT());
      }

      const validation = options?.validate?.[method];
      if (validation && Object.keys(validation).length > 0) {
        middlewares.push(validateRequest(validation));
      }

      // Apply basic middleware
      await composeMiddleware(...middlewares)(req, res, async () => {
        await handler(req, res);
      });
    }
  );
}

/**
 * Quick handler for simple CRUD operations
 */
export function createCrudHandler(config: {
  get?: (req: AuthenticatedRequest, res: VercelResponse) => Promise<void>;
  post?: (req: AuthenticatedRequest, res: VercelResponse) => Promise<void>;
  put?: (req: AuthenticatedRequest, res: VercelResponse) => Promise<void>;
  patch?: (req: AuthenticatedRequest, res: VercelResponse) => Promise<void>;
  delete?: (req: AuthenticatedRequest, res: VercelResponse) => Promise<void>;
  requireAuth?: boolean;
  rateLimit?: 'read' | 'write' | 'api';
  /**
   * Per-method request validation, keyed by the same lowercase names as the
   * handlers above.
   *
   * This sets `RouteConfig.validateBody` / `validateQuery`, which
   * `createApiHandler` has always honoured — the declaration surface simply had
   * no consumer outside `lib/examples/apiRouteExample.ts`, so no data route
   * validated anything. `GET /api/events?start=garbage` reached
   * `new Date('garbage')`, pg threw `RangeError: Invalid time value`, and the
   * caller got a 500 for a malformed request.
   *
   * The schemas are gates, not parsers: handlers keep reading `req.query` /
   * `req.body`. Zod strips unknown keys by default, so reading
   * `req.validated.query` instead would silently drop every filter the schema
   * did not happen to enumerate.
   */
  validate?: Partial<
    Record<
      'get' | 'post' | 'put' | 'patch' | 'delete',
      { body?: z.ZodSchema; query?: z.ZodSchema }
    >
  >;
}) {
  const routes: Partial<Record<HttpMethod, RouteConfig>> = {};

  if (config.get) {
    routes[HttpMethod.GET] = {
      method: HttpMethod.GET,
      handler: config.get,
      requireAuth: config.requireAuth,
    };
  }

  if (config.post) {
    routes[HttpMethod.POST] = {
      method: HttpMethod.POST,
      handler: config.post,
      requireAuth: config.requireAuth,
    };
  }

  if (config.put) {
    routes[HttpMethod.PUT] = {
      method: HttpMethod.PUT,
      handler: config.put,
      requireAuth: config.requireAuth,
    };
  }

  if (config.patch) {
    routes[HttpMethod.PATCH] = {
      method: HttpMethod.PATCH,
      handler: config.patch,
      requireAuth: config.requireAuth,
    };
  }

  if (config.delete) {
    routes[HttpMethod.DELETE] = {
      method: HttpMethod.DELETE,
      handler: config.delete,
      requireAuth: config.requireAuth,
    };
  }

  // Forward the declared preset to every method. Without this the option was
  // accepted and dropped: `account` asked for `'write'` (50/window) and got the
  // `api` default (100/window).
  if (config.rateLimit) {
    for (const route of Object.values(routes)) {
      if (route) route.rateLimit = config.rateLimit;
    }
  }

  if (config.validate) {
    const methodsByKey = [
      ['get', HttpMethod.GET],
      ['post', HttpMethod.POST],
      ['put', HttpMethod.PUT],
      ['patch', HttpMethod.PATCH],
      ['delete', HttpMethod.DELETE],
    ] as const;

    for (const [key, method] of methodsByKey) {
      const rules = config.validate[key];
      const route = routes[method];
      if (!rules || !route) continue;
      if (rules.body) route.validateBody = rules.body;
      if (rules.query) route.validateQuery = rules.query;
    }
  }

  return createApiHandler(routes);
}

/**
 * Health check handler
 */
/**
 * Readiness probe state.
 *
 * The health endpoint returned a static `{status:'ok'}` and never touched
 * Postgres — so it answered 200 for the entire duration of a database outage,
 * and a monitor pointed at it would have reported the service healthy while
 * every data route failed. That is precisely what happened on 2026-07-31, when
 * a paused database took an API down for 38 minutes undetected.
 *
 * The probe is cached for a few seconds because this endpoint is
 * unauthenticated: without it, anyone could turn a health check into database
 * load. `SELECT 1` is trivial, but free and unbounded is still free and
 * unbounded.
 */
const DB_PROBE_TIMEOUT_MS = 1500;
const DB_PROBE_CACHE_MS = 5000;

interface DbProbe {
  ok: boolean;
  latencyMs?: number;
  error?: string;
  at: number;
}
let lastProbe: DbProbe | null = null;

async function probeDatabase(): Promise<DbProbe> {
  const now = Date.now();
  if (lastProbe && now - lastProbe.at < DB_PROBE_CACHE_MS) return lastProbe;

  const started = Date.now();
  try {
    await Promise.race([
      query('SELECT 1'),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`probe exceeded ${DB_PROBE_TIMEOUT_MS}ms`)),
          DB_PROBE_TIMEOUT_MS
        )
      ),
    ]);
    lastProbe = { ok: true, latencyMs: Date.now() - started, at: now };
  } catch (error: unknown) {
    lastProbe = {
      ok: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
      at: now,
    };
  }
  return lastProbe;
}

/** Test seam — the probe cache is process-local by design. */
export function __resetHealthProbeForTests(): void {
  lastProbe = null;
}

export const healthCheckHandler = createMethodHandler(
  {
    [HttpMethod.GET]: async (
      req: AuthenticatedRequest,
      res: VercelResponse
    ) => {
      const database = await probeDatabase();

      // Every field the previous response carried is still here and unchanged,
      // so anything already reading `status`/`timestamp`/`environment`/`version`
      // keeps working. What is new is that `status` can now be 'error', and that
      // the endpoint answers 503 when the database it depends on is unreachable.
      res.status(database.ok ? 200 : 503).json({
        success: database.ok,
        data: {
          status: database.ok ? 'ok' : 'error',
          timestamp: new Date().toISOString(),
          environment: process.env.NODE_ENV || 'development',
          version: process.env.npm_package_version || '1.0.0',
          checks: {
            database: {
              ok: database.ok,
              latencyMs: database.latencyMs,
              ...(database.error ? { error: database.error } : {}),
            },
          },
        },
      });
    },
  },
  // Its own bucket. This endpoint is the app's scheduled uptime probe and
  // Supabase keep-alive: on the old shared counter its traffic alone kept
  // `/api/auth/login` and `/api/auth/refresh` permanently 429'd.
  { rateLimit: 'health' }
);

/**
 * Not found handler
 */
export const notFoundHandler = asyncHandler(
  async (req: AuthenticatedRequest, res: VercelResponse) => {
    sendError(res, new ApiError(404, 'NOT_FOUND', 'Endpoint not found'));
  }
);
