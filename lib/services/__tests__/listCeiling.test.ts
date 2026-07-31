/**
 * The unpaginated list ceiling.
 *
 * `GET /api/tasks` had its pagination guard inverted; events, calendars, tags
 * and task-lists never had one at all. Their services override `findAll` but
 * not `findPaginated` — BaseService's throws NOT_IMPLEMENTED — so the handlers
 * could only ever ask for everything, and the SQL had no LIMIT.
 *
 * These tests assert the two halves of the fix that a passing suite otherwise
 * would not notice: that the query is bounded at all, and that a result which
 * reaches the ceiling is trimmed rather than returned one row over.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { MAX_LIST_ROWS } from '../BaseService.js';

vi.mock('../../config/database.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
  pool: {},
}));

const { query } = await import('../../config/database.js');
const mockedQuery = vi.mocked(query);

const { EventService } = await import('../EventService.js');
const { CalendarService } = await import('../CalendarService.js');
const { TaskListService } = await import('../TaskListService.js');

const ctx = { userId: 'user-123' };

/** A result set one row larger than the ceiling, to prove trimming happens. */
function overflowing(idPrefix: string) {
  return {
    rows: Array.from({ length: MAX_LIST_ROWS + 1 }, (_, i) => ({
      id: `${idPrefix}-${i}`,
      userId: 'user-123',
      name: `row ${i}`,
      title: `row ${i}`,
      calendarId: 'cal-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    rowCount: MAX_LIST_ROWS + 1,
  };
}

describe('unpaginated list ceiling', () => {
  beforeEach(() => {
    mockedQuery.mockReset();
  });

  it.each([
    ['events', () => new EventService()],
    ['calendars', () => new CalendarService()],
    ['task_lists', () => new TaskListService()],
  ])('bounds the %s query with a LIMIT', async (table, make) => {
    mockedQuery.mockResolvedValue({ rows: [], rowCount: 0 } as never);

    await make().findAll({}, ctx);

    const listCall = mockedQuery.mock.calls.find((c) =>
      String(c[0]).includes(`FROM ${table}`)
    );
    expect(listCall, `no query against ${table}`).toBeTruthy();
    expect(String(listCall?.[0])).toContain('LIMIT');
    // Queried one ABOVE the ceiling, so reaching it is detectable.
    expect(listCall?.[1] as unknown[]).toContain(MAX_LIST_ROWS + 1);
  });

  it('trims a result that reaches the ceiling instead of returning one over', async () => {
    mockedQuery.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('FROM calendars'))
        return overflowing('cal') as never;
      return { rows: [], rowCount: 0 } as never;
    });

    const result = await new CalendarService().findAll({}, ctx);

    expect(result).toHaveLength(MAX_LIST_ROWS);
  });

  it('leaves a normal result untouched', async () => {
    mockedQuery.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes('FROM calendars')) {
        return {
          rows: [{ id: 'cal-1', userId: 'user-123', name: 'Personal' }],
          rowCount: 1,
        } as never;
      }
      return { rows: [], rowCount: 0 } as never;
    });

    const result = await new CalendarService().findAll({}, ctx);

    expect(result).toHaveLength(1);
  });
});
