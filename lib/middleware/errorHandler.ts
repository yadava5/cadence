/**
 * Global error handling middleware for Vercel API routes
 */
import type { VercelResponse } from '@vercel/node';
import { ZodError } from 'zod';
import type { AuthenticatedRequest, ApiResponse } from '../types/api.js';
import {
  ApiError,
  ValidationError,
  InternalServerError,
} from '../types/api.js';

/**
 * What a 5xx is allowed to say to a client in production.
 *
 * 47 of the 49 `new InternalServerError(...)` sites across `api/`, `lib/` and
 * `server-handlers/` pass `error.message || 'something failed'`, and `error`
 * there is whatever pg threw. Both renderers below used to echo an `ApiError`'s
 * message verbatim, so a failed insert shipped the Postgres column name, the
 * constraint name, and sometimes the offending value straight to the caller —
 * `null value in column "userId" of relation "tasks" violates not-null
 * constraint`, and so on.
 *
 * The fix is here rather than at 47 call sites: the call sites are the right
 * place for a *developer-facing* message, and this is the one place that
 * decides what leaves the process. The real message is still logged with the
 * request id, so nothing is lost operationally — only the client's copy is
 * generic, and it carries the code and the id needed to find the log line.
 *
 * Only 5xx is masked. 4xx messages are the API's contract — a `ValidationError`
 * naming the bad field is the entire point of request validation — and
 * `RATE_LIMIT_EXCEEDED` / `METHOD_NOT_ALLOWED` say nothing about internals.
 */
const MASKED_5XX_MESSAGE = 'An internal error occurred';

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Returns what the client should see, and logs what actually happened.
 *
 * `masked` tells the caller to also drop `details` (an `ApiError` can carry a
 * driver payload there) and to surface a request id, so a masked response is
 * still traceable to the log line above.
 */
function renderErrorMessage(
  statusCode: number,
  message: string,
  requestId: string
): { message: string; masked: boolean } {
  if (statusCode < 500 || !isProduction()) {
    return { message, masked: false };
  }

  console.error(
    `[${requestId}] masked ${statusCode} response body; underlying message:`,
    message
  );
  return { message: MASKED_5XX_MESSAGE, masked: true };
}

/**
 * Error handler middleware
 */
export function errorHandler(
  error: Error,
  req: AuthenticatedRequest,
  res: VercelResponse
): void {
  const requestId = req.requestId || generateRequestId();
  const timestamp = new Date().toISOString();

  // Log error for debugging
  console.error(`[${timestamp}] [${requestId}] Error:`, {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    userId: req.user?.id,
  });

  // Handle different error types
  if (error instanceof ApiError) {
    const rendered = renderErrorMessage(
      error.statusCode,
      error.message,
      requestId
    );

    return sendErrorResponse(res, error.statusCode, {
      success: false,
      error: {
        code: error.code,
        message: rendered.message,
        details: rendered.masked ? undefined : error.details,
        timestamp,
        requestId,
      },
    });
  }

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const validationError = new ValidationError(
      formatZodErrors(error),
      'Request validation failed'
    );

    return sendErrorResponse(res, validationError.statusCode, {
      success: false,
      error: {
        code: validationError.code,
        message: validationError.message,
        details: validationError.details,
        timestamp,
        requestId,
      },
    });
  }

  // Handle unexpected errors
  const internalError = new InternalServerError();
  sendErrorResponse(res, internalError.statusCode, {
    success: false,
    error: {
      code: internalError.code,
      message:
        process.env.NODE_ENV === 'production'
          ? 'An unexpected error occurred'
          : error.message,
      timestamp,
      requestId,
    },
  });
}

/**
 * Send error response
 */
function sendErrorResponse(
  res: VercelResponse,
  statusCode: number,
  body: ApiResponse
): void {
  res.status(statusCode).json(body);
}

/**
 * Format Zod validation errors
 */
function formatZodErrors(error: ZodError): Array<{
  field: string;
  message: string;
  code: string;
}> {
  return error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code,
  }));
}

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Async error wrapper for route handlers
 */
export function asyncHandler(
  handler: (req: AuthenticatedRequest, res: VercelResponse) => Promise<void>
) {
  return async (req: AuthenticatedRequest, res: VercelResponse) => {
    try {
      await handler(req, res);
    } catch (error) {
      errorHandler(error as Error, req, res);
    }
  };
}

/**
 * Success response helper
 */
export function sendSuccess<T>(
  res: VercelResponse,
  data?: T,
  statusCode = 200,
  meta?: Record<string, unknown>
): void {
  const response: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };

  res.status(statusCode).json(response);
}

/**
 * Error response helper
 */
export function sendError(
  res: VercelResponse,
  error: ApiError,
  requestId?: string
): void {
  // A masked response must still be traceable, so mint an id when the caller
  // had none. Callers that pass one keep it, and non-masked responses keep the
  // previous behaviour exactly — `requestId` stays `undefined` and drops out of
  // the JSON — so nothing that reads a 4xx today changes shape.
  const id = requestId ?? generateRequestId();
  const rendered = renderErrorMessage(error.statusCode, error.message, id);

  const response: ApiResponse = {
    success: false,
    error: {
      code: error.code,
      message: rendered.message,
      details: rendered.masked ? undefined : error.details,
      timestamp: new Date().toISOString(),
      requestId: rendered.masked ? id : requestId,
    },
  };

  res.status(error.statusCode).json(response);
}
