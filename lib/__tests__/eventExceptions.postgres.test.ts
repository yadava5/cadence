/**
 * Deleted occurrences of a recurring event survive a round trip through the
 * database.
 *
 * "Delete this occurrence" sends `PUT /api/events/:id { exceptions: [...] }`.
 * Before 0009 the server had no column for that, and `EventService.update`
 * built its SET list from known fields only, so the request succeeded and the
 * occurrence reappeared on the next read. A mocked query cannot catch that —
 * the bug is the column and the SQL agreeing to ignore a field — so this runs
 * the real migration against a real Postgres and reads back through a fresh
 * query, not the object the update returned.
 *
 * Skipped unless RLS_TEST_PG_ADMIN_URL points at a superuser Postgres; the
 * global setup starts a throwaway container when Docker is available.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const ADMIN_URL = process.env.RLS_TEST_PG_ADMIN_URL;

const TEST_DB = 'cadence_event_exceptions';
const USER_A = 'usr_exc_a';
const ctxA = { userId: USER_A };

let admin: Pool;
let eventService: InstanceType<
  typeof import('../services/EventService.js').EventService
>;

describe.skipIf(!ADMIN_URL)('event exceptions persist (real Postgres)', () => {
  beforeAll(async () => {
    const bootstrap = new Pool({ connectionString: ADMIN_URL });
    await bootstrap.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
    await bootstrap.query(`CREATE DATABASE ${TEST_DB}`);
    await bootstrap.end();

    const url = new URL(ADMIN_URL!);
    url.pathname = `/${TEST_DB}`;
    admin = new Pool({ connectionString: url.toString() });
    await admin.query(
      readFileSync(join(HERE, 'fixtures', 'schema.sql'), 'utf8')
    );
    // The real migration, so a typo in it fails here rather than in production.
    await admin.query(
      readFileSync(
        join(
          HERE,
          '..',
          'config',
          'migrations',
          '0009_events_add_exceptions.sql'
        ),
        'utf8'
      )
    );
    await admin.query(
      `INSERT INTO users (id, email, "updatedAt") VALUES ($1,$2,NOW())`,
      [USER_A, 'a@exceptions.test']
    );
    await admin.query(
      `INSERT INTO calendars (id, name, "userId", "updatedAt") VALUES ('cal_a','Work',$1,NOW())`,
      [USER_A]
    );

    process.env.DATABASE_URL = url.toString();
    (globalThis as { __pgPool?: Pool }).__pgPool = undefined;
    const { EventService } = await import('../services/EventService.js');
    eventService = new EventService();
  }, 120_000);

  afterAll(async () => {
    (globalThis as { __pgPool?: Pool }).__pgPool = undefined;
    await admin?.end();
  });

  async function createWeekly() {
    return eventService.create(
      {
        title: 'Standup',
        start: new Date('2026-10-05T13:00:00.000Z'),
        end: new Date('2026-10-05T13:30:00.000Z'),
        calendarId: 'cal_a',
        recurrence: 'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO',
      },
      ctxA
    );
  }

  async function storedExceptions(id: string): Promise<string[]> {
    const res = await admin.query<{ exceptions: string[] }>(
      `SELECT exceptions FROM events WHERE id = $1`,
      [id]
    );
    return res.rows[0].exceptions;
  }

  it('a new event starts with no exceptions, not NULL', async () => {
    const created = await createWeekly();
    expect(await storedExceptions(created.id)).toEqual([]);
  });

  it('update writes exceptions, and every read path returns them', async () => {
    const created = await createWeekly();
    const deleted = '2026-10-12T13:00:00.000Z';

    const updated = await eventService.update(
      created.id,
      { exceptions: [deleted] },
      ctxA
    );
    expect(updated?.exceptions).toEqual([deleted]);

    expect(await storedExceptions(created.id)).toEqual([deleted]);
    expect((await eventService.findById(created.id, ctxA))?.exceptions).toEqual(
      [deleted]
    );
    const listed = await eventService.findAll({}, ctxA);
    expect(listed.find((e) => e.id === created.id)?.exceptions).toEqual([
      deleted,
    ]);
  });

  it('canonicalises each entry to the exact form the client compares', async () => {
    // The client skips an occurrence when `start.toISOString()` is in the
    // list, so a stored "2026-10-19T13:00:00Z" (no millis) would never match.
    const created = await createWeekly();
    await eventService.update(
      created.id,
      { exceptions: ['2026-10-19T13:00:00Z', '2026-10-19T13:00:00.000Z'] },
      ctxA
    );
    expect(await storedExceptions(created.id)).toEqual([
      '2026-10-19T13:00:00.000Z',
    ]);
  });

  it('an update that does not mention exceptions leaves them alone', async () => {
    const created = await createWeekly();
    await eventService.update(
      created.id,
      { exceptions: ['2026-10-12T13:00:00.000Z'] },
      ctxA
    );
    await eventService.update(created.id, { title: 'Renamed' }, ctxA);
    expect(await storedExceptions(created.id)).toEqual([
      '2026-10-12T13:00:00.000Z',
    ]);
  });

  it('rejects an entry that is not a date', async () => {
    const created = await createWeekly();
    await expect(
      eventService.update(created.id, { exceptions: ['next tuesday'] }, ctxA)
    ).rejects.toThrow(/VALIDATION_ERROR/);
  });
});
