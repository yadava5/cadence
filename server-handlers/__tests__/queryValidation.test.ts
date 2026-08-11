/**
 * Malformed input must be a 400, not a 500.
 *
 * No data route validated its body or query. `zod` appeared only in the five
 * auth handlers; `RouteConfig.validateBody/validateQuery` was wired into
 * `apiHandler.ts` but its only consumer was `lib/examples/apiRouteExample.ts`,
 * which is not routed. So `GET /api/events?start=garbage` ran
 * `new Date('garbage')` (`events/index.ts:51`), handed an Invalid Date to pg,
 * and the driver's `RangeError: Invalid time value` surfaced as a 500. Same
 * shape in `events/conflicts.ts` and `tasks/index.ts`.
 *
 * Each route is pinned in BOTH directions. A gate that rejects everything looks
 * identical to a gate that works if you only assert the 400 — and the schemas
 * here are deliberately gates, not parsers: the handlers still read `req.query`,
 * because zod strips unknown keys and reading `req.validated.query` would
 * silently drop every filter a schema forgot to enumerate.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mockEventService, mockTaskService, mockGetAllServices } = vi.hoisted(
  () => {
    const event = {
      findAll: vi.fn(),
      findUpcoming: vi.fn(),
      getConflicts: vi.fn(),
      create: vi.fn(),
    };
    const task = { findPaginated: vi.fn(), findAll: vi.fn(), create: vi.fn() };
    return {
      mockEventService: event,
      mockTaskService: task,
      mockGetAllServices: vi.fn(() => ({ event, task, calendar: {} })),
    };
  }
);

vi.mock('../../lib/services/index.js', () => ({
  getAllServices: mockGetAllServices,
}));

vi.mock('../../lib/config/database.js', () => ({
  query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
  withTransaction: vi.fn(),
  pool: {},
}));

process.env.JWT_SECRET ??= 'test-secret-at-least-32-characters-long!!';

const { generateAccessToken } = await import(
  '../../packages/backend/src/utils/jwt.js'
);
const { createMockRequest, createMockResponse } = await import(
  '../../lib/__tests__/helpers/mockRequest.js'
);
const events = (await import('../events/index.js')).default;
const conflicts = (await import('../events/conflicts.js')).default;
const tasks = (await import('../tasks/index.js')).default;

const USER = { id: 'user-1', email: 'a@example.com' };
const VALID_START = '2026-03-01T00:00:00.000Z';
const VALID_END = '2026-03-31T23:59:59.000Z';

type Handler = (req: unknown, res: unknown) => Promise<unknown>;

function statusOf(res: ReturnType<typeof createMockResponse>) {
  return vi.mocked(res.status).mock.calls.at(-1)?.[0];
}

function bodyOf(res: ReturnType<typeof createMockResponse>) {
  return vi.mocked(res.json).mock.calls.at(-1)?.[0] as {
    success: boolean;
    error?: {
      code: string;
      message: string;
      details?: Array<{ field: string; message: string }>;
    };
  };
}

async function call(
  handler: Handler,
  url: string,
  query: Record<string, string>,
  method = 'GET',
  body?: unknown
) {
  const token = await generateAccessToken(USER.id, USER.email);
  const req = createMockRequest({
    method,
    url,
    query,
    body,
    headers: { authorization: `Bearer ${token}` },
  });
  const res = createMockResponse();
  await handler(req, res);
  return res;
}

describe('request validation on the date-parsing routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEventService.findAll.mockResolvedValue([]);
    mockEventService.getConflicts.mockResolvedValue([]);
    mockTaskService.findPaginated.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
  });

  describe('GET /api/events', () => {
    it('answers 400 and names the field for a malformed start', async () => {
      const res = await call(events as Handler, '/api/events', {
        start: 'garbage',
        end: VALID_END,
      });

      expect(statusOf(res)).toBe(400);

      const body = bodyOf(res);
      expect(body.success).toBe(false);
      expect(body.error?.code).toBe('VALIDATION_ERROR');
      expect(body.error?.details?.[0]?.field).toBe('query.start');
      expect(body.error?.message).toMatch(/start must be a valid date-time/);

      // Never reached the service, so it never reached pg.
      expect(mockEventService.findAll).not.toHaveBeenCalled();
    });

    it('answers 400 for the legacy startDate spelling too', async () => {
      const res = await call(events as Handler, '/api/events', {
        startDate: 'not-a-date',
        endDate: VALID_END,
      });

      expect(statusOf(res)).toBe(400);
      expect(bodyOf(res).error?.details?.[0]?.field).toBe('query.startDate');
    });

    it('still serves a well-formed range', async () => {
      const res = await call(events as Handler, '/api/events', {
        start: VALID_START,
        end: VALID_END,
        calendarId: 'cal-1',
      });

      expect(statusOf(res)).toBe(200);
      expect(mockEventService.findAll).toHaveBeenCalledTimes(1);
    });

    it('answers 400 for a malformed start in a POST body', async () => {
      const res = await call(events as Handler, '/api/events', {}, 'POST', {
        title: 'Retro',
        start: 'garbage',
        end: VALID_END,
        calendarId: 'cal-1',
      });

      expect(statusOf(res)).toBe(400);
      expect(bodyOf(res).error?.details?.[0]?.field).toBe('body.start');
      expect(mockEventService.create).not.toHaveBeenCalled();
    });

    it('answers 400 for a POST with no body at all', async () => {
      // Was `TypeError: Cannot read properties of undefined` inside the
      // handler, i.e. a 500 for an obviously malformed request.
      const res = await call(
        events as Handler,
        '/api/events',
        {},
        'POST',
        undefined
      );

      expect(statusOf(res)).toBe(400);
      expect(mockEventService.create).not.toHaveBeenCalled();
    });

    it('still creates an event from a well-formed POST body', async () => {
      mockEventService.create.mockResolvedValue({ id: 'evt-1' });

      const res = await call(events as Handler, '/api/events', {}, 'POST', {
        title: 'Retro',
        start: VALID_START,
        end: VALID_END,
        calendarId: 'cal-1',
        description: 'weekly',
      });

      expect(statusOf(res)).toBe(201);
      expect(mockEventService.create).toHaveBeenCalledTimes(1);
      // The handler reads `req.body`, so fields the schema does not enumerate
      // still reach the service.
      expect(mockEventService.create.mock.calls[0][0]).toMatchObject({
        title: 'Retro',
        calendarId: 'cal-1',
        description: 'weekly',
      });
    });

    it('does not drop filters the schema does not enumerate', async () => {
      // The handler reads `req.query`, not the stripped `req.validated.query`.
      await call(events as Handler, '/api/events', {
        start: VALID_START,
        end: VALID_END,
        calendarId: 'cal-7',
        search: 'standup',
      });

      const [filters] = mockEventService.findAll.mock.calls[0];
      expect(filters).toMatchObject({ calendarId: 'cal-7', search: 'standup' });
    });
  });

  describe('GET /api/events/conflicts', () => {
    it('answers 400 for a malformed start', async () => {
      const res = await call(conflicts as Handler, '/api/events/conflicts', {
        start: 'garbage',
        end: VALID_END,
      });

      expect(statusOf(res)).toBe(400);
      expect(bodyOf(res).error?.details?.[0]?.field).toBe('query.start');
      expect(mockEventService.getConflicts).not.toHaveBeenCalled();
    });

    it('still serves a well-formed range', async () => {
      const res = await call(conflicts as Handler, '/api/events/conflicts', {
        start: VALID_START,
        end: VALID_END,
      });

      expect(statusOf(res)).toBe(200);
      expect(mockEventService.getConflicts).toHaveBeenCalledTimes(1);
    });

    it('keeps its own required-field 400 when start is absent entirely', async () => {
      const res = await call(conflicts as Handler, '/api/events/conflicts', {});

      expect(statusOf(res)).toBe(400);
      expect(mockEventService.getConflicts).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/tasks', () => {
    it('answers 400 for a malformed scheduledDateFrom', async () => {
      const res = await call(tasks as Handler, '/api/tasks', {
        scheduledDateFrom: 'garbage',
      });

      expect(statusOf(res)).toBe(400);
      expect(bodyOf(res).error?.details?.[0]?.field).toBe(
        'query.scheduledDateFrom'
      );
      expect(mockTaskService.findPaginated).not.toHaveBeenCalled();
    });

    it('answers 400 for a non-numeric limit', async () => {
      const res = await call(tasks as Handler, '/api/tasks', {
        limit: 'abc',
      });

      expect(statusOf(res)).toBe(400);
      expect(bodyOf(res).error?.details?.[0]?.field).toBe('query.limit');
    });

    it('still serves a plain list request', async () => {
      const res = await call(tasks as Handler, '/api/tasks', {});

      expect(statusOf(res)).toBe(200);
      expect(mockTaskService.findPaginated).toHaveBeenCalledTimes(1);
    });

    it('still serves every filter it accepted before', async () => {
      await call(tasks as Handler, '/api/tasks', {
        completed: 'true',
        taskListId: 'list-1',
        priority: 'high',
        search: 'report',
        overdue: 'true',
        scheduledDateFrom: VALID_START,
        scheduledDateTo: VALID_END,
        sortBy: 'updatedAt',
        sortOrder: 'asc',
        page: '2',
        limit: '50',
      });

      const [filters, page, limit] =
        mockTaskService.findPaginated.mock.calls[0];
      expect(filters).toMatchObject({
        completed: true,
        taskListId: 'list-1',
        priority: 'HIGH',
        search: 'report',
        overdue: true,
        sortBy: 'updatedAt',
        sortOrder: 'asc',
      });
      expect(page).toBe(2);
      expect(limit).toBe(50);
    });

    it('answers 400 for a malformed scheduledDate in a POST body', async () => {
      const res = await call(tasks as Handler, '/api/tasks', {}, 'POST', {
        title: 'Write it down',
        scheduledDate: 'garbage',
      });

      expect(statusOf(res)).toBe(400);
      expect(bodyOf(res).error?.details?.[0]?.field).toBe('body.scheduledDate');
      expect(mockTaskService.create).not.toHaveBeenCalled();
    });
  });
});
