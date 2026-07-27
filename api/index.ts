/**
 * Single catch-all API function.
 *
 * Vercel's Hobby tier caps deployments at 12 serverless functions; the
 * per-file handlers under ../server-handlers (formerly api/*) numbered
 * 36. This dispatcher keeps every handler byte-for-byte intact and
 * routes to it by path, restoring the dynamic-segment params that
 * Vercel's filesystem router would have injected (req.query.id).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';

import health from '../server-handlers/health.js';
import test from '../server-handlers/test.js';
import authLogin from '../server-handlers/auth/login.js';
import authLogout from '../server-handlers/auth/logout.js';
import authMe from '../server-handlers/auth/me.js';
import authVerify from '../server-handlers/auth/verify.js';
import authRefresh from '../server-handlers/auth/refresh.js';
import authRegister from '../server-handlers/auth/register.js';
import authGoogle from '../server-handlers/auth/google/index.js';
import authGoogleCallback from '../server-handlers/auth/google/callback.js';
import authGoogleVerify from '../server-handlers/auth/google/verify.js';
import account from '../server-handlers/account/index.js';
import googleCalendar from '../server-handlers/google/calendar.js';
import googleMeeting from '../server-handlers/google/meeting.js';
import attachments from '../server-handlers/attachments/index.js';
import attachmentsCleanup from '../server-handlers/attachments/cleanup.js';
import attachmentsStats from '../server-handlers/attachments/stats.js';
import attachmentById from '../server-handlers/attachments/[id].js';
import calendars from '../server-handlers/calendars/index.js';
import calendarById from '../server-handlers/calendars/[id].js';
import events from '../server-handlers/events/index.js';
import eventsConflicts from '../server-handlers/events/conflicts.js';
import eventById from '../server-handlers/events/[id].js';
import tags from '../server-handlers/tags/index.js';
import tagsCleanup from '../server-handlers/tags/cleanup.js';
import tagsMerge from '../server-handlers/tags/merge.js';
import tagsStats from '../server-handlers/tags/stats.js';
import tagById from '../server-handlers/tags/[id].js';
import taskLists from '../server-handlers/task-lists/index.js';
import taskListsStats from '../server-handlers/task-lists/stats.js';
import taskListById from '../server-handlers/task-lists/[id].js';
import tasks from '../server-handlers/tasks/index.js';
import tasksBulk from '../server-handlers/tasks/bulk.js';
import tasksStats from '../server-handlers/tasks/stats.js';
import taskById from '../server-handlers/tasks/[id].js';
import upload from '../server-handlers/upload/index.js';

type Handler = (
  req: VercelRequest,
  res: VercelResponse
) => unknown | Promise<unknown>;

/** [segments] → handler; ":name" captures into req.query[name]. */
const ROUTES: Array<[string[], Handler]> = [
  [['health'], health],
  [['test'], test],
  [['auth', 'login'], authLogin],
  [['auth', 'logout'], authLogout],
  [['auth', 'me'], authMe],
  [['auth', 'verify'], authVerify],
  [['auth', 'refresh'], authRefresh],
  [['auth', 'register'], authRegister],
  [['auth', 'google'], authGoogle],
  [['auth', 'google', 'callback'], authGoogleCallback],
  [['auth', 'google', 'verify'], authGoogleVerify],
  [['account'], account],
  [['google', 'calendar'], googleCalendar],
  [['google', 'meeting'], googleMeeting],
  [['attachments'], attachments],
  [['attachments', 'cleanup'], attachmentsCleanup],
  [['attachments', 'stats'], attachmentsStats],
  [['attachments', ':id'], attachmentById],
  [['calendars'], calendars],
  [['calendars', ':id'], calendarById],
  [['events'], events],
  [['events', 'conflicts'], eventsConflicts],
  [['events', ':id'], eventById],
  [['tags'], tags],
  [['tags', 'cleanup'], tagsCleanup],
  [['tags', 'merge'], tagsMerge],
  [['tags', 'stats'], tagsStats],
  [['tags', ':id'], tagById],
  [['task-lists'], taskLists],
  [['task-lists', 'stats'], taskListsStats],
  [['task-lists', ':id'], taskListById],
  [['tasks'], tasks],
  [['tasks', 'bulk'], tasksBulk],
  [['tasks', 'stats'], tasksStats],
  [['tasks', ':id'], taskById],
  [['upload'], upload],
];

function match(
  segments: string[]
): { handler: Handler; params: Record<string, string> } | null {
  // Static patterns win over :param patterns of the same length.
  const candidates = ROUTES.filter(([p]) => p.length === segments.length);
  for (const staticFirst of [true, false]) {
    for (const [pattern, handler] of candidates) {
      const hasParam = pattern.some((s) => s.startsWith(':'));
      if (staticFirst === hasParam) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < pattern.length; i += 1) {
        if (pattern[i].startsWith(':'))
          params[pattern[i].slice(1)] = segments[i];
        else if (pattern[i] !== segments[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return { handler, params };
    }
  }
  return null;
}

export default async function router(req: VercelRequest, res: VercelResponse) {
  // Derive segments from the URL itself — works identically for
  // /api/health and /api/auth/google/callback, no framework routing
  // assumptions.
  const pathname = (req.url ?? '').split('?')[0];
  const segments = pathname
    .replace(/^\/api\/?/, '')
    .split('/')
    .filter(Boolean);

  const found = match(segments);
  if (!found) {
    res.status(404).json({ success: false, error: 'Not found' });
    return;
  }
  Object.assign(req.query, found.params);
  return found.handler(req, res);
}
