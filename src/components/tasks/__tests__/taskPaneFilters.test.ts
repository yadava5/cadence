/**
 * Due-date panes must bucket a task by the calendar day it is due, in every
 * timezone. A task due "today" arrives from the API as UTC midnight, which is
 * the previous evening everywhere west of Greenwich: the old instant
 * comparison against local midnight put it in Yesterday's half-open range and
 * it vanished from the Today pane for every viewer in the Americas.
 *
 * Both storage shapes are exercised on purpose:
 *   - UTC midnight   (`2026-08-10T00:00:00.000Z`) — what the API/seed produces
 *   - local midnight (`new Date(2026, 7, 10)`)    — what ChronoDateParser produces
 * Recognising only one of the two still passes the other shape's assertion in
 * whichever zone makes them coincide, so both are pinned.
 *
 * The timed task is the positive control: 2026-08-11T02:30:00.000Z is Tuesday
 * in UTC and Monday evening in New York, so it *must* land in a different
 * bucket per zone. If the TZ switch ever stops taking effect that assertion
 * fails rather than the file going quietly green.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { Task } from '@shared/types';
import type { TaskPaneConfig } from '@/stores/uiStore';
import { filterTasksForPane } from '../taskPaneFilters';

const ORIGINAL_TZ = process.env.TZ;

/** Frozen "now": Monday 10 August 2026, 12:00 local. */
const freezeNow = () => vi.setSystemTime(new Date(2026, 7, 10, 12, 0, 0, 0));

const ZONES = ['UTC', 'America/New_York'] as const;

const task = (id: string, scheduledDate?: Date): Task => ({
  id,
  title: id,
  completed: false,
  createdAt: new Date(2026, 0, 1),
  scheduledDate,
});

const pane = (filterValue: string): TaskPaneConfig =>
  ({
    id: `pane-${filterValue}`,
    grouping: 'dueDate',
    filterValue,
    showCompleted: true,
  }) as TaskPaneConfig;

/** Ids left after filtering, order-independent. */
const bucket = (tasks: Task[], filterValue: string): string[] =>
  filterTasksForPane(tasks, pane(filterValue), 'createdAt', 'desc')
    .map((t) => t.id)
    .sort();

describe.each(ZONES)('due-date panes in %s', (zone) => {
  beforeAll(() => {
    process.env.TZ = zone;
    vi.useFakeTimers();
    freezeNow();
  });

  afterAll(() => {
    vi.useRealTimers();
    process.env.TZ = ORIGINAL_TZ;
  });

  // Built inside the tests, not at collection time: describe bodies run before
  // the TZ hook, so a hoisted local-midnight fixture would be midnight in the
  // runner's zone and pass vacuously.
  const tasks = () => [
    task('utc-today', new Date('2026-08-10T00:00:00.000Z')),
    task('local-today', new Date(2026, 7, 10, 0, 0, 0, 0)),
    task('utc-tomorrow', new Date('2026-08-11T00:00:00.000Z')),
    task('local-tomorrow', new Date(2026, 7, 11, 0, 0, 0, 0)),
    // Sunday 16 August: the last day of "this week" from a Monday.
    task('utc-sunday', new Date('2026-08-16T00:00:00.000Z')),
    task('utc-next-week', new Date('2026-08-20T00:00:00.000Z')),
    task('utc-later', new Date('2026-09-30T00:00:00.000Z')),
    task('no-date'),
  ];

  it('keeps an all-day "today" task in Today, in both storage shapes', () => {
    expect(bucket(tasks(), 'today')).toEqual(['local-today', 'utc-today']);
  });

  it('buckets tomorrow by the calendar day, in both storage shapes', () => {
    expect(bucket(tasks(), 'tomorrow')).toEqual([
      'local-tomorrow',
      'utc-tomorrow',
    ]);
  });

  it('includes the whole closing Sunday in This Week', () => {
    expect(bucket(tasks(), 'this-week')).toEqual([
      'local-today',
      'local-tomorrow',
      'utc-sunday',
      'utc-today',
      'utc-tomorrow',
    ]);
  });

  it('splits next week from later', () => {
    expect(bucket(tasks(), 'next-week')).toEqual(['utc-next-week']);
    expect(bucket(tasks(), 'later')).toEqual(['utc-later']);
  });

  it('keeps undated tasks out of every dated bucket', () => {
    for (const filterValue of ['today', 'tomorrow', 'this-week', 'later']) {
      expect(bucket(tasks(), filterValue)).not.toContain('no-date');
    }
  });

  it('shows only undated tasks in the "no-date" pane', () => {
    // This assertion was inverted on purpose. It used to pin the bug — every
    // dated task also matched, because the inner switch had no 'no-date' case
    // and fell through to `default: return true` — and recorded it as
    // unendorsed. The pane is now filtered: `getPaneTitle` already ships a
    // "No Due Date" heading for this value, and a heading that lists every
    // dated task is a trap for whoever wires it up.
    expect(bucket(tasks(), 'no-date')).toEqual(['no-date']);
  });

  it('still shows every dated task for an unrecognised due-date filter', () => {
    // `default: return true` survives for values the switch does not know, so
    // the 'no-date' fix cannot silently empty some future bucket. Undated tasks
    // were already excluded from any filter other than 'no-date'.
    expect(bucket(tasks(), 'someday')).toEqual(
      tasks()
        .filter((t) => t.scheduledDate)
        .map((t) => t.id)
        .sort()
    );
  });
});

describe('a timed task follows the viewer clock (positive control)', () => {
  // 02:30 UTC on Tuesday is Monday 22:30 in New York.
  const timed = () => [task('timed', new Date('2026-08-11T02:30:00.000Z'))];

  const bucketsIn = (zone: string) => {
    process.env.TZ = zone;
    vi.useFakeTimers();
    freezeNow();
    try {
      return {
        today: bucket(timed(), 'today'),
        tomorrow: bucket(timed(), 'tomorrow'),
      };
    } finally {
      vi.useRealTimers();
      process.env.TZ = ORIGINAL_TZ;
    }
  };

  it('lands on tomorrow in UTC and today in New York', () => {
    expect(bucketsIn('UTC')).toEqual({ today: [], tomorrow: ['timed'] });
    expect(bucketsIn('America/New_York')).toEqual({
      today: ['timed'],
      tomorrow: [],
    });
  });
});
