/**
 * /api/google/meeting — create a Google Calendar meeting from Cadence.
 *
 * GET  → { connected } — whether the signed-in user has connected Google
 *        Calendar (a stored refresh token), so the UI can show a "Connect
 *        Google first" prompt before the compose form.
 * POST → { summary, description?, start, end, timeZone, attendees[], addMeet }
 *        Creates the event on the user's primary calendar with
 *        `sendUpdates=all`, so Google emails every attendee a calendar invite
 *        (Accept/Decline) — no Gmail send scope needed — and, when `addMeet`
 *        is set, attaches a Google Meet video link. Returns the event's
 *        htmlLink, the Meet URL (if any), and the attendee list.
 *
 * Auth mirrors google/calendar.ts: a Bearer JWT resolves to the userId, and
 * the Google refresh token never leaves the server. Attendee emails are
 * validated server-side.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  verifyToken,
  extractTokenFromHeader,
} from '../../packages/backend/src/utils/jwt.js';
import { googleOAuthService } from '../../packages/backend/src/services/GoogleOAuthService.js';
import { query } from '../../lib/config/database.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Google Calendar caps a single event at ~200 sendable attendees.
const MAX_ATTENDEES = 200;

async function requireUser(req: VercelRequest): Promise<string | null> {
  const token = extractTokenFromHeader(req.headers.authorization);
  if (!token) return null;
  try {
    const payload = await verifyToken(token);
    return payload.type === 'access' ? payload.userId : null;
  } catch {
    return null;
  }
}

interface MeetingRequestBody {
  summary?: unknown;
  description?: unknown;
  start?: unknown;
  end?: unknown;
  timeZone?: unknown;
  attendees?: unknown;
  addMeet?: unknown;
}

export default async function meetingHandler(
  req: VercelRequest,
  res: VercelResponse
) {
  const fail = (status: number, code: string, message: string) =>
    res.status(status).json({
      success: false,
      error: { code, message, timestamp: new Date().toISOString() },
    });

  if (!googleOAuthService.isConfigured()) {
    return fail(
      503,
      'GOOGLE_OAUTH_NOT_CONFIGURED',
      'Google integration is not configured on this server'
    );
  }

  const userId = await requireUser(req);
  if (!userId) return fail(401, 'UNAUTHORIZED', 'Sign in first');

  try {
    if (req.method === 'GET') {
      const row = await query<{ googleRefreshToken: string | null }>(
        `SELECT "googleRefreshToken" FROM users WHERE id = $1 LIMIT 1`,
        [userId]
      );
      const connected = Boolean(row.rows[0]?.googleRefreshToken);
      return res.status(200).json({ success: true, data: { connected } });
    }

    if (req.method === 'POST') {
      const b = (req.body ?? {}) as MeetingRequestBody;

      const summary = typeof b.summary === 'string' ? b.summary.trim() : '';
      if (!summary) {
        return fail(400, 'INVALID_SUMMARY', 'A meeting title is required');
      }

      const start = typeof b.start === 'string' ? b.start : '';
      const end = typeof b.end === 'string' ? b.end : '';
      const startMs = Date.parse(start);
      const endMs = Date.parse(end);
      if (!start || !end || Number.isNaN(startMs) || Number.isNaN(endMs)) {
        return fail(
          400,
          'INVALID_TIME',
          'start and end must be valid ISO 8601 date-times'
        );
      }
      if (endMs <= startMs) {
        return fail(400, 'INVALID_TIME', 'end must be after start');
      }

      const timeZone =
        typeof b.timeZone === 'string' && b.timeZone.trim()
          ? b.timeZone.trim()
          : 'UTC';

      const attendeesRaw = Array.isArray(b.attendees) ? b.attendees : [];
      const attendees = Array.from(
        new Set(
          attendeesRaw
            .map((a) => String(a).trim().toLowerCase())
            .filter(Boolean)
        )
      );
      const invalid = attendees.find((a) => !EMAIL_RE.test(a));
      if (invalid) {
        return fail(400, 'INVALID_ATTENDEE', `Not a valid email: ${invalid}`);
      }
      if (attendees.length > MAX_ATTENDEES) {
        return fail(
          400,
          'TOO_MANY_ATTENDEES',
          `A meeting can invite at most ${MAX_ATTENDEES} people`
        );
      }

      const description =
        typeof b.description === 'string' && b.description.trim()
          ? b.description.trim()
          : undefined;
      const addMeet = Boolean(b.addMeet);

      const created = await googleOAuthService.insertCalendarEvent(userId, {
        summary,
        description,
        start,
        end,
        timeZone,
        attendees,
        addMeet,
      });

      return res.status(201).json({
        success: true,
        data: { ...created, invitesSent: attendees.length },
      });
    }

    return fail(405, 'METHOD_NOT_ALLOWED', 'Use GET or POST');
  } catch (error) {
    const message = (error as Error).message ?? 'unknown';
    if (message === 'GOOGLE_NOT_CONNECTED') {
      return fail(409, 'GOOGLE_NOT_CONNECTED', 'Connect Google Calendar first');
    }
    if (message === 'NO_REFRESH_TOKEN') {
      return fail(
        409,
        'NO_REFRESH_TOKEN',
        'Google did not return a refresh token — reconnect Google Calendar in Settings'
      );
    }
    if (message === 'GOOGLE_CALENDAR_REAUTH_REQUIRED') {
      return fail(
        403,
        'GOOGLE_CALENDAR_REAUTH_REQUIRED',
        'Your Google connection needs calendar access — reconnect Google Calendar in Settings'
      );
    }
    console.error('Google meeting handler error:', error);
    return fail(500, 'GOOGLE_MEETING_ERROR', 'Could not create the meeting');
  }
}
