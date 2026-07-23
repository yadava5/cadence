/**
 * /api/google/calendar — Google Calendar connect + one-way pull sync.
 *
 * GET  → { authUrl } for an incremental calendar.readonly consent
 *        (offline access, state="calendar"; ?redirectUri= from the SPA).
 * POST → with { code, redirectUri }: finishes the connect grant for the
 *        signed-in user (stores the refresh token server-side).
 *        with {}: runs a pull sync — mints a fresh access token from the
 *        stored refresh token, pulls -30d…+90d events from the primary
 *        calendar, and upserts them into a per-user "Google" calendar,
 *        deduped on ("userId","googleEventId").
 *
 * Security: the Google refresh token never leaves the server; requests
 * use the official google-auth-library client with the least-privilege
 * calendar.events scope (read + write on events only — never full calendar
 * management and never any Gmail access).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  verifyToken,
  extractTokenFromHeader,
} from '../../packages/backend/src/utils/jwt.js';
import { googleOAuthService } from '../../packages/backend/src/services/GoogleOAuthService.js';
import { query } from '../../lib/config/database.js';

// calendar.events grants read + write on the user's events — enough to run the
// pull sync below AND to create meetings with attendees and Google Meet links
// (see google/meeting.ts) — without full-calendar management or any Gmail
// scope. Upgraded from calendar.readonly; existing read-only grants must
// reconnect (the connect flow uses prompt=consent, so they re-consent cleanly).
const CAL_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const GOOGLE_CAL_NAME = 'Google';
const GOOGLE_CAL_COLOR = '#0f9d76';

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

interface GoogleEventItem {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

async function ensureGoogleCalendar(userId: string): Promise<string> {
  const existing = await query<{ id: string }>(
    `SELECT id FROM calendars WHERE "userId" = $1 AND name = $2 LIMIT 1`,
    [userId, GOOGLE_CAL_NAME]
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await query<{ id: string }>(
    `INSERT INTO calendars (id, name, color, description, "isVisible", "isDefault", "userId", "createdAt", "updatedAt")
     VALUES (gen_random_uuid()::text, $1, $2, 'Synced from Google Calendar', true, false, $3, NOW(), NOW())
     RETURNING id`,
    [GOOGLE_CAL_NAME, GOOGLE_CAL_COLOR, userId]
  );
  return created.rows[0].id;
}

async function pullSync(userId: string): Promise<{ synced: number }> {
  const accessToken = await googleOAuthService.getFreshAccessToken(userId);
  const calendarId = await ensureGoogleCalendar(userId);

  const timeMin = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const timeMax = new Date(Date.now() + 90 * 86_400_000).toISOString();
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });
  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!resp.ok) {
    throw new Error(`GOOGLE_CALENDAR_FETCH_FAILED_${resp.status}`);
  }
  const body = (await resp.json()) as { items?: GoogleEventItem[] };
  const items = (body.items ?? []).filter(
    (e) =>
      e.id && e.status !== 'cancelled' && (e.start?.dateTime || e.start?.date)
  );

  let synced = 0;
  for (const item of items) {
    const allDay = !item.start?.dateTime;
    const start = item.start?.dateTime ?? `${item.start?.date}T00:00:00.000Z`;
    const end =
      item.end?.dateTime ??
      (item.end?.date ? `${item.end.date}T00:00:00.000Z` : start);
    await query(
      `INSERT INTO events (id, title, description, start, "end", "allDay", location, "userId", "calendarId", "googleEventId", "createdAt", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       ON CONFLICT ("userId", "googleEventId") WHERE "googleEventId" IS NOT NULL
       DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description,
                     start = EXCLUDED.start, "end" = EXCLUDED."end",
                     "allDay" = EXCLUDED."allDay", location = EXCLUDED.location,
                     "updatedAt" = NOW()`,
      [
        item.summary?.slice(0, 255) || '(untitled)',
        item.description?.slice(0, 2000) || null,
        start,
        end,
        allDay,
        item.location?.slice(0, 255) || null,
        userId,
        calendarId,
        item.id,
      ]
    );
    synced += 1;
  }
  return { synced };
}

export default async function calendarHandler(
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
      const redirectUri = String(req.query.redirectUri ?? '');
      if (!redirectUri) {
        return fail(400, 'MISSING_REDIRECT_URI', 'redirectUri is required');
      }
      const authUrl = googleOAuthService.getAuthUrl({
        redirectUri,
        scopes: [CAL_SCOPE],
        state: 'calendar',
      });
      return res.status(200).json({ success: true, data: { authUrl } });
    }

    if (req.method === 'POST') {
      const { code, redirectUri } = (req.body ?? {}) as {
        code?: string;
        redirectUri?: string;
      };
      if (code) {
        if (!redirectUri) {
          return fail(400, 'MISSING_REDIRECT_URI', 'redirectUri is required');
        }
        await googleOAuthService.connectCalendar(userId, code, redirectUri);
        // First sync immediately so the grid lights up on return.
        const { synced } = await pullSync(userId);
        return res
          .status(200)
          .json({ success: true, data: { connected: true, synced } });
      }
      const { synced } = await pullSync(userId);
      return res.status(200).json({ success: true, data: { synced } });
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
        'Google did not return a refresh token — remove the app at myaccount.google.com/permissions and retry'
      );
    }
    console.error('Google Calendar handler error:', error);
    return fail(500, 'GOOGLE_CALENDAR_ERROR', 'Google Calendar request failed');
  }
}
