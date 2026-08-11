/**
 * Middleware barrel export
 */

// Core middleware
export * from './cors.js';
export * from './errorHandler.js';
export * from './validation.js';
export * from './rateLimit.js';
export * from './requestId.js';

// Auth middleware (will be implemented in task 4.1)
export * from './auth.js';

// Middleware composition utilities
import type { VercelResponse } from '@vercel/node';
import type { AuthenticatedRequest, Middleware } from '../types/api';

/**
 * Compose multiple middleware functions
 */
export function composeMiddleware(...middlewares: Middleware[]) {
  return async (
    req: AuthenticatedRequest,
    res: VercelResponse,
    finalHandler: () => void | Promise<void>
  ) => {
    let index = 0;

    async function run(): Promise<void> {
      if (index >= middlewares.length) {
        await finalHandler();
        return;
      }

      const middleware = middlewares[index++];

      // The downstream chain is started by `next()`. We keep a handle to it so
      // we can await it even when a middleware calls `next()` WITHOUT
      // awaiting/returning it (e.g. a synchronous `next();` as its last line).
      // Historically the pipeline only awaited the middleware's own return
      // value, so a downstream rejection — like `authenticateJWT` throwing on a
      // missing/expired/invalid token — was orphaned: the error never reached
      // `asyncHandler`'s catch, no response was sent, and the request hung
      // until the platform timeout instead of returning 401. Awaiting the
      // captured downstream promise here closes that hole for every current
      // and future middleware, regardless of how it calls `next()`.
      let downstream: Promise<void> | undefined;
      const next = (): Promise<void> => {
        if (!downstream) downstream = run();
        return downstream;
      };

      await middleware(req, res, next);
      if (downstream) await downstream;
    }

    await run();
  };
}

/**
 * Create a middleware pipeline
 */
export class MiddlewarePipeline {
  private middlewares: Middleware[] = [];

  use(middleware: Middleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  async execute(
    req: AuthenticatedRequest,
    res: VercelResponse,
    finalHandler: () => void
  ): Promise<void> {
    let index = 0;
    const middlewares = this.middlewares;

    async function next(): Promise<void> {
      if (index >= middlewares.length) {
        return finalHandler();
      }

      const middleware = middlewares[index++];
      await middleware(req, res, next);
    }

    await next();
  }
}

/**
 * Conditional middleware wrapper
 */
export function conditionalMiddleware(
  condition: (req: AuthenticatedRequest) => boolean,
  middleware: Middleware
): Middleware {
  return async (req, res, next) => {
    if (condition(req)) {
      await middleware(req, res, next);
    } else {
      next();
    }
  };
}

/**
 * Method-specific middleware wrapper
 */
export function methodMiddleware(
  method: string | string[],
  middleware: Middleware
): Middleware {
  const methods = Array.isArray(method) ? method : [method];

  return conditionalMiddleware(
    (req) => methods.includes(req.method || ''),
    middleware
  );
}
