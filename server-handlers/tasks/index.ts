/**
 * Tasks API Route - CRUD operations for tasks
 */
import { createCrudHandler } from '../../lib/utils/apiHandler.js';
import { getAllServices } from '../../lib/services/index.js';
import { sendSuccess, sendError } from '../../lib/middleware/errorHandler.js';
import {
  UnauthorizedError,
  ValidationError,
  InternalServerError,
} from '../../lib/types/api.js';
import type { AuthenticatedRequest } from '../../lib/types/api.js';
import type { VercelResponse } from '@vercel/node';

/**
 * Page-size bounds for the tasks collection.
 *
 * MAX_UNPAGINATED_LIMIT is the safety net for a caller that asks for no page at
 * all — high enough that no current client sees a change, low enough that one
 * user with a large table cannot make the API scan it. MAX_PAGE_LIMIT bounds an
 * explicit `?limit=`, which was previously honoured without any ceiling.
 */
const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 200;
const MAX_UNPAGINATED_LIMIT = 500;
import type {
  CreateTaskDTO,
  TaskFilters,
} from '../../lib/services/TaskService';

export default createCrudHandler({
  get: async (req: AuthenticatedRequest, res: VercelResponse) => {
    try {
      const { task: taskService } = getAllServices();
      const userId = req.user?.id;

      if (!userId) {
        return sendError(
          res,
          new UnauthorizedError('User authentication required')
        );
      }

      // Extract query parameters for filtering
      const {
        completed,
        taskListId,
        priority,
        search,
        overdue,
        scheduledDateFrom,
        scheduledDateTo,
        tags,
        sortBy,
        sortOrder,
        page = '1',
        limit = '20',
      } = req.query;

      // Build filters
      const filters: TaskFilters = {};

      if (completed !== undefined) {
        filters.completed = completed === 'true';
      }

      if (taskListId) {
        filters.taskListId = taskListId as string;
      }

      if (priority) {
        const p = String(priority).toUpperCase();
        if (p === 'LOW' || p === 'MEDIUM' || p === 'HIGH') {
          // Backend enum uses DB form
          filters.priority = p as TaskFilters['priority'];
        }
      }

      if (search) {
        filters.search = search as string;
      }

      if (overdue === 'true') {
        filters.overdue = true;
      }

      if (scheduledDateFrom || scheduledDateTo) {
        filters.scheduledDate = {};
        if (scheduledDateFrom) {
          filters.scheduledDate.from = new Date(scheduledDateFrom as string);
        }
        if (scheduledDateTo) {
          filters.scheduledDate.to = new Date(scheduledDateTo as string);
        }
      }

      if (tags) {
        const tagList = Array.isArray(tags) ? tags : [tags];
        filters.tags = tagList as string[];
      }

      // Sorting support via query params
      if (sortBy) {
        filters.sortBy = sortBy as TaskFilters['sortBy'];
      }
      if (sortOrder) {
        filters.sortOrder = (sortOrder as string) === 'asc' ? 'asc' : 'desc';
      }

      // Always bounded.
      //
      // This read `if (pageNum > 1 || limitNum !== 20)`, and `page`/`limit`
      // default to '1'/'20' above — so the condition was FALSE for a plain
      // `GET /api/tasks` and it took the unbounded `findAll` branch. Asking for
      // the default page size returned the entire table; asking for anything
      // else was correctly paginated. The bound was inverted.
      //
      // The cap for an unpaginated request is deliberately high rather than 20.
      // No client has ever received 20 by default, so capping there would be a
      // silent truncation dressed up as a fix. At 500 nobody's view changes and
      // the sequential scan is gone. `pagination.total` in the response tells a
      // client when it has been truncated.
      const explicitlyPaged =
        req.query.page !== undefined || req.query.limit !== undefined;
      const parsedPage = parseInt(page as string, 10);
      const parsedLimit = parseInt(limit as string, 10);
      const pageNum =
        Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
      const limitNum = explicitlyPaged
        ? Math.min(
            Number.isFinite(parsedLimit) && parsedLimit > 0
              ? parsedLimit
              : DEFAULT_PAGE_LIMIT,
            MAX_PAGE_LIMIT
          )
        : MAX_UNPAGINATED_LIMIT;

      const result = await taskService.findPaginated(
        filters,
        pageNum,
        limitNum,
        {
          userId,
          requestId: req.headers['x-request-id'] as string,
        }
      );

      sendSuccess(res, result);
    } catch (error) {
      console.error('GET /api/tasks error:', error);
      sendError(
        res,
        new InternalServerError(error.message || 'Failed to fetch tasks')
      );
    }
  },

  post: async (req: AuthenticatedRequest, res: VercelResponse) => {
    try {
      const { task: taskService } = getAllServices();
      const userId = req.user?.id;

      if (!userId) {
        return sendError(
          res,
          new UnauthorizedError('User authentication required')
        );
      }

      // Validate request body
      const taskData: CreateTaskDTO = req.body;

      if (!taskData.title?.trim()) {
        return sendError(
          res,
          new ValidationError(
            [
              {
                field: 'title',
                message: 'Task title is required',
                code: 'REQUIRED',
              },
            ],
            'Task title is required'
          )
        );
      }

      // Create the task
      const task = await taskService.create(taskData, {
        userId,
        requestId: req.headers['x-request-id'] as string,
      });

      sendSuccess(res, task, 201);
    } catch (error) {
      console.error('POST /api/tasks error:', error);

      if (error.message?.startsWith('VALIDATION_ERROR:')) {
        const msg = error.message.replace('VALIDATION_ERROR: ', '');
        return sendError(
          res,
          new ValidationError([{ message: msg, code: 'VALIDATION_ERROR' }], msg)
        );
      }

      sendError(
        res,
        new InternalServerError(error.message || 'Failed to create task')
      );
    }
  },

  requireAuth: true,
  rateLimit: 'api',
});
