/**
 * Keep the public demo account's week current.
 *
 * The landing page promises `seeded with a real week` (src/pages/Welcome.tsx).
 * The seed computes its dates from `now` at seed time and runs in no
 * automation, so that sentence was true on the day it was written and false
 * two weeks later: on 2026-08-07 the demo account's eleven events sat between
 * 2026-07-14 and 07-24 with NOT ONE in the current week, and a visitor signing
 * in landed on an empty calendar. Shifting them by hand fixes it for a week and
 * then owes the same debt again, which is why this exists.
 *
 * ## It shifts by WHOLE WEEKS, and that is the whole trick
 *
 * The delta is `date_trunc('week', current_date) - date_trunc('week', min(start))`,
 * a whole number of weeks. Every event keeps its weekday and its time of day —
 * the 9am Tuesday standup stays a 9am Tuesday standup — and the week keeps its
 * internal shape. It is idempotent by construction: run it twice and the second
 * call computes a delta of zero and updates nothing, so a cron that fires more
 * often than needed is free.
 *
 * ## Security posture, which is the point and not an afterthought
 *
 * - It is a POST, and it takes NO input. There is no user id, no date, no
 *   table name in the request. The only thing a caller can ask for is "make
 *   the demo week current", so the worst a leaked secret buys is shifting
 *   demo dates that are already public — not reading anyone's data.
 * - It authenticates with a bearer secret compared in CONSTANT TIME. A plain
 *   `===` on a secret leaks its prefix to a patient attacker through response
 *   timing; `timingSafeEqual` does not. Lengths are compared first because
 *   `timingSafeEqual` throws on a length mismatch.
 * - **It runs as the demo user through the ordinary RLS path**, via
 *   `runWithRls` + `withTransaction`, exactly like a signed-in request. It does
 *   not connect as an owner, it does not bypass RLS, and it holds no second
 *   credential. The `app.user_id` GUC is set to the demo account and the
 *   policies from 0002 do the scoping — so this endpoint physically cannot
 *   touch another tenant's rows, and that is enforced by the database rather
 *   than by this file being careful.
 * - If `DEMO_REANCHOR_SECRET` is unset the route answers 404, not 500 and not
 *   "unconfigured". An endpoint that announces itself when half-configured is
 *   an endpoint that invites probing.
 */
import { randomUUID, timingSafeEqual } from 'node:crypto';

import type { VercelRequest, VercelResponse } from '@vercel/node';

import { query, withTransaction } from '../../lib/config/database.js';
import { DEMO_EMAIL } from '../../lib/config/demo.js';
import { runWithRls } from '../../lib/config/rlsContext.js';

/** Constant-time bearer comparison. Length is checked first — timingSafeEqual throws otherwise. */
function secretMatches(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<void> {
  const expected = process.env.DEMO_REANCHOR_SECRET;
  if (!expected) {
    res.status(404).json({ success: false, message: 'Not found' });
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ success: false, message: 'Method not allowed' });
    return;
  }

  const header = req.headers.authorization ?? '';
  const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!presented || !secretMatches(presented, expected)) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return;
  }

  const runId = randomUUID().slice(0, 8);

  try {
    // The demo user lookup is pre-tenant, the same shape login uses.
    // `query` resolves to a pg QueryResult, not to the rows themselves.
    const users = await query<{ id: string }>(
      'SELECT id FROM public.users WHERE email = $1 LIMIT 1',
      [DEMO_EMAIL]
    );
    const demoUserId = users.rows[0]?.id;
    if (!demoUserId) {
      res.status(500).json({
        success: false,
        message: 'Demo account not found',
        runId,
      });
      return;
    }

    // From here on every statement is scoped by RLS to the demo account.
    const result = await runWithRls(demoUserId, () =>
      withTransaction(async (client) => {
        // `::text` is load-bearing. Without it pg parses an `interval` into an
        // OBJECT, so the zero case arrives as `{}` — truthy, and never equal to
        // '00:00:00'. The first authenticated run took the update branch on an
        // already-current week and rewrote sixteen rows with a zero shift: no
        // data harm, but a no-op that writes every six hours forever is not a
        // no-op. As text, zero is '00:00:00' and a real shift is '21 days',
        // which `$1::interval` accepts back unchanged.
        // Every statement below names the demo user explicitly.
        //
        // They did not, and were correct only because `runWithRls` + FORCE RLS
        // made two bare `UPDATE`s over `public.events` and `public.tasks` mean
        // "the demo account's rows". That is a real guarantee, but it is the
        // ONLY thing standing between this endpoint and rewriting every row in
        // both tables: drop the policies for an incident, run this against a
        // local database with RLS off, or connect as a BYPASSRLS role, and an
        // UPDATE with no WHERE does exactly what it says. The handler has had
        // `demoUserId` in hand since the lookup above — there was never a
        // reason not to use it.
        const delta = await client.query<{ delta: string | null }>(
          `SELECT (date_trunc('week', current_date::timestamp)
                 - date_trunc('week', min("start")))::text AS delta
             FROM public.events
            WHERE "userId" = $1`,
          [demoUserId]
        );
        const shift = delta.rows[0]?.delta ?? null;
        if (!shift || shift === '00:00:00') {
          return {
            shifted: shift ?? '00:00:00',
            events: 0,
            tasks: 0,
            noop: true,
          };
        }

        const events = await client.query(
          `UPDATE public.events
              SET "start" = "start" + $1::interval,
                  "end"   = "end"   + $1::interval,
                  "updatedAt" = now()
            WHERE "userId" = $2`,
          [shift, demoUserId]
        );
        const tasks = await client.query(
          `UPDATE public.tasks
              SET "scheduledDate" = "scheduledDate" + $1::interval,
                  "completedAt"   = CASE WHEN "completedAt" IS NULL THEN NULL
                                         ELSE least("completedAt" + $1::interval, now()::timestamp) END,
                  "updatedAt" = now()
            WHERE "userId" = $2`,
          [shift, demoUserId]
        );
        return {
          shifted: shift,
          events: events.rowCount ?? 0,
          tasks: tasks.rowCount ?? 0,
          noop: false,
        };
      })
    );

    res.status(200).json({ success: true, runId, ...result });
  } catch (error) {
    // The message is deliberately not echoed to the caller.
    console.error(`[demo/reanchor ${runId}]`, error);
    res
      .status(500)
      .json({ success: false, message: 'Re-anchor failed', runId });
  }
}
