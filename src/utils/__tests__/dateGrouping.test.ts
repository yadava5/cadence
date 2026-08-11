/**
 * Day-key grouping for the left pane. A task due on a calendar day must group
 * under that day in every timezone — a UTC-midnight due date used to land a
 * day early west of Greenwich, which also made a task due *today* appear under
 * "Overdue".
 *
 * `allDayAware` is opt-in: calendar events carry their own `allDay` flag and
 * must keep the old local-clock behaviour, so the last test pins that the
 * unflagged call is unchanged.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { getDayKey, groupItemsByDate } from '../dateGrouping';

const ORIGINAL_TZ = process.env.TZ;
const ZONES = ['UTC', 'America/New_York', 'Asia/Kolkata'] as const;

const ALL_DAY_AWARE = { allDayAware: true } as const;

describe.each(ZONES)('getDayKey in %s', (zone) => {
  beforeAll(() => {
    process.env.TZ = zone;
    vi.useFakeTimers();
    // Monday 10 August 2026, 12:00 local.
    vi.setSystemTime(new Date(2026, 7, 10, 12, 0, 0, 0));
  });

  afterAll(() => {
    vi.useRealTimers();
    process.env.TZ = ORIGINAL_TZ;
  });

  it('groups all-day due dates under the day they name', () => {
    expect(getDayKey(new Date('2026-08-10T00:00:00.000Z'), ALL_DAY_AWARE)).toBe(
      'Today'
    );
    expect(getDayKey(new Date('2026-08-11T00:00:00.000Z'), ALL_DAY_AWARE)).toBe(
      'Tomorrow'
    );
    expect(getDayKey(new Date('2026-08-15T00:00:00.000Z'), ALL_DAY_AWARE)).toBe(
      'Saturday'
    );
    expect(getDayKey(new Date('2026-08-19T00:00:00.000Z'), ALL_DAY_AWARE)).toBe(
      'Aug 19'
    );
    expect(getDayKey(new Date('2026-08-09T00:00:00.000Z'), ALL_DAY_AWARE)).toBe(
      'Overdue'
    );
  });

  it('keeps instants on the local clock (positive control)', () => {
    // 2026-08-15T17:26:43Z is Saturday afternoon/evening in all three zones.
    expect(getDayKey(new Date('2026-08-15T17:26:43.021Z'), ALL_DAY_AWARE)).toBe(
      'Saturday'
    );
  });

  it('returns the no-date key for a missing date', () => {
    expect(getDayKey(null, ALL_DAY_AWARE)).toBe('No Due Date');
  });

  it('groups a list of tasks into the expected buckets', () => {
    const tasks = [
      { id: 'a', scheduledDate: new Date('2026-08-19T00:00:00.000Z') },
      { id: 'b', scheduledDate: new Date('2026-08-15T17:26:43.021Z') },
      { id: 'c', scheduledDate: null },
    ];

    const grouped = groupItemsByDate(
      tasks,
      (task) => task.scheduledDate,
      ALL_DAY_AWARE
    );

    expect(Object.keys(grouped).sort()).toEqual([
      'Aug 19',
      'No Due Date',
      'Saturday',
    ]);
  });
});

/**
 * The all-day path computes the "this week" window itself; the timed path
 * still uses date-fns `isThisWeek({ weekStartsOn: 1 })`. If the two ever
 * disagree the sidebar would print two headings for one day, which a
 * Monday-only fixture cannot see — so every anchor weekday is checked.
 */
describe.each(ZONES)('day keys agree across both shapes in %s', (zone) => {
  beforeAll(() => {
    process.env.TZ = zone;
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
    process.env.TZ = ORIGINAL_TZ;
  });

  // Monday, Wednesday, Saturday, Sunday in August 2026.
  it.each([10, 12, 15, 16])(
    'anchored on 2026-08-%i, every day of the surrounding fortnight',
    (todayDay) => {
      vi.setSystemTime(new Date(2026, 7, todayDay, 12, 0, 0, 0));

      for (let targetDay = 3; targetDay <= 25; targetDay += 1) {
        const allDay = new Date(Date.UTC(2026, 7, targetDay));
        const timed = new Date(2026, 7, targetDay, 12, 0, 0, 0);

        expect([targetDay, getDayKey(allDay, ALL_DAY_AWARE)]).toEqual([
          targetDay,
          getDayKey(timed, ALL_DAY_AWARE),
        ]);
      }
    }
  );
});

describe('event grouping is unchanged', () => {
  beforeAll(() => {
    process.env.TZ = 'America/New_York';
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 10, 12, 0, 0, 0));
  });

  afterAll(() => {
    vi.useRealTimers();
    process.env.TZ = ORIGINAL_TZ;
  });

  it('still reads a UTC-midnight value on the local clock without the flag', () => {
    // Deliberate: unflagged callers (EventOverview) keep byte-identical
    // behaviour — in New York this instant is 2026-08-09 20:00 local.
    expect(getDayKey(new Date('2026-08-10T00:00:00.000Z'))).toBe('Overdue');
  });
});
