/**
 * Core API types for Vercel serverless functions
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import type { RateLimitPresetName } from '../middleware/rateLimit.js';

/**
 * Extended request interface with user context
 */
export interface AuthenticatedRequest extends VercelRequest {
  user?: {
    id: string;
    email: string;
    name?: string;
  };
  requestId?: string;
  validated?: {
    body?: unknown;
    query?: unknown;
    params?: unknown;
  };
}

/**
 * Standard API response format
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
    timestamp: string;
    requestId?: string;
  };
  meta?: {
    pagination?: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    timestamp: string;
  };
}

/**
 * API error class
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Common API error types
 */
export class ValidationError extends ApiError {
  constructor(details: unknown, message = 'Request validation failed') {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

export class NotFoundError extends ApiError {
  constructor(resource: string) {
    super(404, 'NOT_FOUND', `${resource} not found`);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(401, 'UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') {
    super(403, 'FORBIDDEN', message);
  }
}

export class ConflictError extends ApiError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
  }
}

export class RateLimitError extends ApiError {
  constructor(message = 'Rate limit exceeded') {
    super(429, 'RATE_LIMIT_EXCEEDED', message);
  }
}

export class InternalServerError extends ApiError {
  constructor(message = 'Internal server error') {
    super(500, 'INTERNAL_ERROR', message);
  }
}

/**
 * HTTP methods enum
 */
export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE',
  OPTIONS = 'OPTIONS',
}

/**
 * Route handler type
 */
/**
 * The return value is deliberately `unknown`, not `void`.
 *
 * Every handler in `server-handlers/auth/**` is written as
 * `return res.status(...).json(...)` — an early-return idiom that yields
 * `Promise<VercelResponse>`. Against a `Promise<void>` signature that is
 * TS2418 at each of the eight computed-property sites, and the call sites
 * `await` the result and discard it, so widening loses nothing.
 */
export type RouteHandler = (
  req: AuthenticatedRequest,
  res: VercelResponse
) => Promise<unknown> | unknown;

/**
 * Route configuration
 */
export interface RouteConfig {
  method: HttpMethod;
  handler: RouteHandler;
  requireAuth?: boolean;
  validateBody?: z.ZodSchema;
  validateQuery?: z.ZodSchema;
  /**
   * Either a preset name, or explicit numbers for a one-off limiter.
   *
   * A one-off limiter gets its own bucket, derived from the route's method and
   * limits unless `bucket` names one explicitly — never the shared `api`
   * bucket, and never derived from `req.url` (dynamic `[id]` routes would mint
   * an unbounded number of buckets).
   */
  rateLimit?:
    | RateLimitPresetName
    | {
        windowMs: number;
        max: number;
        bucket?: string;
      };
}

/**
 * Middleware function type
 */
export type Middleware = (
  req: AuthenticatedRequest,
  res: VercelResponse,
  next: () => void
) => Promise<void> | void;

/**
 * CORS configuration
 */
export interface CorsConfig {
  origin: string | string[] | boolean;
  methods: string[];
  allowedHeaders: string[];
  credentials: boolean;
  maxAge?: number;
}
