/**
 * A 5xx must not tell the client what Postgres said.
 *
 * 47 of the 49 `new InternalServerError(...)` sites across `api/`, `lib/` and
 * `server-handlers/` pass `error.message || 'something failed'`, where `error`
 * is whatever the pg driver threw. Both renderers — `sendError` and the
 * `ApiError` branch of `errorHandler` — echoed that message verbatim, so column
 * names, constraint names and sometimes the offending value reached the caller.
 *
 * The masking lives in one place on purpose; these tests exercise both
 * renderers because both were leaking, and they pin the *conditions* as much as
 * the behaviour: only 5xx, only in production. Masking 4xx would destroy the
 * validation errors the same change set adds.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { sendError, errorHandler, asyncHandler } from '../errorHandler.js';
import {
  ApiError,
  InternalServerError,
  NotFoundError,
  ValidationError,
} from '../../types/api.js';
import {
  createMockRequest,
  createMockResponse,
} from '../../__tests__/helpers/mockRequest.js';
import type { AuthenticatedRequest } from '../../types/api.js';

const PG_LEAK =
  'null value in column "userId" of relation "tasks" violates not-null constraint';

const originalEnv = process.env.NODE_ENV;

afterEach(() => {
  process.env.NODE_ENV = originalEnv;
  vi.clearAllMocks();
});

function bodyOf(res: ReturnType<typeof createMockResponse>) {
  return vi.mocked(res.json).mock.calls.at(-1)?.[0] as {
    success: boolean;
    error?: {
      code: string;
      message: string;
      details?: unknown;
      requestId?: string;
    };
  };
}

describe('5xx message masking', () => {
  describe('sendError', () => {
    it('does not echo the underlying message in production', () => {
      process.env.NODE_ENV = 'production';
      const res = createMockResponse();

      sendError(res, new InternalServerError(PG_LEAK));

      expect(vi.mocked(res.status)).toHaveBeenCalledWith(500);

      const body = bodyOf(res);
      expect(body.error?.message).not.toContain('userId');
      expect(body.error?.message).not.toContain('constraint');
      expect(body.error?.message).toBe('An internal error occurred');
    });

    it('keeps the error code and supplies a request id when it masks', () => {
      process.env.NODE_ENV = 'production';
      const res = createMockResponse();

      sendError(res, new InternalServerError(PG_LEAK));

      const body = bodyOf(res);
      expect(body.error?.code).toBe('INTERNAL_ERROR');
      expect(body.error?.requestId).toMatch(/^req_\d+_[a-z0-9]+$/);
    });

    it('drops details on a masked response', () => {
      process.env.NODE_ENV = 'production';
      const res = createMockResponse();

      sendError(
        res,
        new ApiError(503, 'DB_UNAVAILABLE', PG_LEAK, {
          table: 'tasks',
          column: 'userId',
        })
      );

      const body = bodyOf(res);
      expect(body.error?.details).toBeUndefined();
      expect(body.error?.message).toBe('An internal error occurred');
    });

    it('still echoes the message outside production', () => {
      process.env.NODE_ENV = 'development';
      const res = createMockResponse();

      sendError(res, new InternalServerError(PG_LEAK));

      // The negative control: without this the test above would pass even if
      // the message were hard-coded for every environment.
      expect(bodyOf(res).error?.message).toBe(PG_LEAK);
    });

    it('never masks a 4xx, even in production', () => {
      process.env.NODE_ENV = 'production';

      const notFound = createMockResponse();
      sendError(notFound, new NotFoundError('Task'));
      expect(bodyOf(notFound).error?.message).toBe('Task not found');

      const invalid = createMockResponse();
      const details = [{ field: 'query.start', message: 'bad date' }];
      sendError(invalid, new ValidationError(details, 'start is invalid'));
      expect(bodyOf(invalid).error?.message).toBe('start is invalid');
      expect(bodyOf(invalid).error?.details).toEqual(details);
    });

    it('leaves the request id absent on an unmasked response', () => {
      // Pins the shape 4xx callers see today: `sendError(res, error)` with no
      // id still renders `requestId: undefined`.
      process.env.NODE_ENV = 'production';
      const res = createMockResponse();

      sendError(res, new NotFoundError('Task'));

      expect(bodyOf(res).error?.requestId).toBeUndefined();
    });
  });

  describe('errorHandler', () => {
    it('masks a thrown 5xx ApiError in production', () => {
      process.env.NODE_ENV = 'production';
      const req = createMockRequest() as AuthenticatedRequest;
      req.requestId = 'req-abc';
      const res = createMockResponse();

      errorHandler(new InternalServerError(PG_LEAK), req, res);

      expect(vi.mocked(res.status)).toHaveBeenCalledWith(500);
      const body = bodyOf(res);
      expect(body.error?.message).toBe('An internal error occurred');
      expect(body.error?.requestId).toBe('req-abc');
    });

    it('masks a 5xx that reaches it through asyncHandler', async () => {
      process.env.NODE_ENV = 'production';
      const req = createMockRequest() as AuthenticatedRequest;
      const res = createMockResponse();

      await asyncHandler(async () => {
        throw new InternalServerError(PG_LEAK);
      })(req, res);

      expect(bodyOf(res).error?.message).toBe('An internal error occurred');
    });

    it('still echoes a thrown 5xx outside production', () => {
      process.env.NODE_ENV = 'development';
      const req = createMockRequest() as AuthenticatedRequest;
      const res = createMockResponse();

      errorHandler(new InternalServerError(PG_LEAK), req, res);

      expect(bodyOf(res).error?.message).toBe(PG_LEAK);
    });
  });
});
