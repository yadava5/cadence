/**
 * All-day due dates must read the same in every timezone; instants must keep
 * being shown in the viewer's local time.
 *
 * Both storage shapes are exercised in all three zones on purpose:
 *   - UTC midnight   (`2026-08-19T00:00:00.000Z`) — what the API/seed produces
 *   - local midnight (`new Date(2026, 7, 19)`)    — what the in-app parser produces
 * An implementation that recognises only one of the two still passes the other
 * shape's assertion in whichever zone makes them coincide, so both are pinned.
 *
 * The timed cases are the positive control: their output *must* differ per
 * zone. If the TZ switch ever stops taking effect, those assertions fail
 * rather than the file going quietly green.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import {
  formatDueDate,
  formatEventWhen,
  isAllDayDate,
  getCalendarDate,
  toPickerDate,
} from '../dueDate';

const ORIGINAL_TZ = process.env.TZ;

/** Frozen "now": Monday 10 August 2026, 12:00 local. */
const freezeNow = () => vi.setSystemTime(new Date(2026, 7, 10, 12, 0, 0, 0));

const ZONES = ['UTC', 'America/New_York', 'Asia/Kolkata'] as const;

/** Expected local clock for 2026-08-15T17:26:43.021Z, per zone. */
const TIMED_RELATIVE: Record<(typeof ZONES)[number], string> = {
  UTC: 'Saturday at 5:26 PM',
  'America/New_York': 'Saturday at 1:26 PM',
  'Asia/Kolkata': 'Saturday at 10:56 PM',
};

/** Expected event "when" for the timed 2026-08-15T02:30:00.000Z, per zone. */
const TIMED_EVENT_WHEN: Record<(typeof ZONES)[number], string> = {
  UTC: 'Sat, Aug 15 · 2:30 AM',
  'America/New_York': 'Fri, Aug 14 · 10:30 PM',
  'Asia/Kolkata': 'Sat, Aug 15 · 8:00 AM',
};

describe.each(ZONES)('due date display in %s', (zone) => {
  beforeAll(() => {
    process.env.TZ = zone;
    vi.useFakeTimers();
    freezeNow();
  });

  afterAll(() => {
    vi.useRealTimers();
    process.env.TZ = ORIGINAL_TZ;
  });

  describe('all-day dates stored as UTC midnight', () => {
    // "Prepare presentation slides" from the seeded demo data.
    const slides = new Date('2026-08-19T00:00:00.000Z');
    // "Buy groceries" from the seeded demo data.
    const groceries = new Date('2026-08-16T00:00:00.000Z');

    it('is detected as all-day', () => {
      expect(isAllDayDate(slides)).toBe(true);
    });

    it('names the day it was stored for, with no invented time', () => {
      expect(formatDueDate(slides, 'relative')).toBe('August 19th, 2026');
      expect(formatDueDate(slides, 'medium')).toBe('Aug 19, 2026');
      expect(formatDueDate(slides, 'numeric')).toBe('08/19/2026');
      expect(formatDueDate(slides, 'short')).toBe('Aug 19');
    });

    it('does not shift the day backwards', () => {
      expect(getCalendarDate(slides)).toEqual({
        year: 2026,
        month: 8,
        day: 19,
      });
      expect(formatDueDate(slides, 'relative')).not.toContain('18');
      expect(formatDueDate(slides, 'relative')).not.toContain('PM');
    });

    it('uses relative wording within the week', () => {
      expect(formatDueDate(groceries, 'relative')).toBe('Sunday');
      expect(
        formatDueDate(new Date('2026-08-10T00:00:00.000Z'), 'relative')
      ).toBe('Today');
      expect(
        formatDueDate(new Date('2026-08-11T00:00:00.000Z'), 'relative')
      ).toBe('Tomorrow');
      expect(
        formatDueDate(new Date('2026-08-09T00:00:00.000Z'), 'relative')
      ).toBe('Yesterday');
    });

    it('anchors the date picker to the day it names', () => {
      const picker = toPickerDate(slides);

      expect(picker.getFullYear()).toBe(2026);
      expect(picker.getMonth()).toBe(7);
      expect(picker.getDate()).toBe(19);
      expect(picker.getHours()).toBe(0);
    });
  });

  describe('all-day dates stored as local midnight', () => {
    // The shape ChronoDateParser produces: setHours(0, 0, 0, 0) in the
    // author's zone. Built inside the test body, not at collection time —
    // describe bodies run before the TZ hook, so a hoisted fixture would be
    // local midnight in the *runner's* zone and pass vacuously.
    const localAllDay = () => new Date(2026, 7, 19, 0, 0, 0, 0);

    it('is detected as all-day', () => {
      expect(isAllDayDate(localAllDay())).toBe(true);
    });

    it('renders the same strings as the UTC-midnight shape', () => {
      expect(formatDueDate(localAllDay(), 'relative')).toBe(
        'August 19th, 2026'
      );
      expect(formatDueDate(localAllDay(), 'medium')).toBe('Aug 19, 2026');
      expect(formatDueDate(localAllDay(), 'numeric')).toBe('08/19/2026');
    });
  });

  describe('instants keep their local time (positive control)', () => {
    // "Review project proposal" from the seeded demo data.
    const proposal = new Date('2026-08-15T17:26:43.021Z');

    it('is not treated as all-day', () => {
      expect(isAllDayDate(proposal)).toBe(false);
    });

    it('renders in the viewer local zone', () => {
      expect(formatDueDate(proposal, 'relative')).toBe(TIMED_RELATIVE[zone]);
    });

    it('leaves the picker date untouched', () => {
      expect(toPickerDate(proposal)).toBe(proposal);
    });
  });

  describe('event "when" labels (command palette)', () => {
    // An all-day event, as the API stores it.
    const offsite = new Date('2026-08-13T00:00:00.000Z');

    it('names the stored day for an all-day event, in every zone', () => {
      expect(formatEventWhen(offsite, true)).toBe('Thu, Aug 13');
    });

    it('keeps the local clock for a timed event (positive control)', () => {
      // 02:30 UTC is the previous evening in New York, so this string *must*
      // differ per zone. If the TZ switch stops taking effect it fails here
      // instead of the all-day assertion going quietly green.
      expect(formatEventWhen(new Date('2026-08-15T02:30:00.000Z'), false)).toBe(
        TIMED_EVENT_WHEN[zone]
      );
    });

    it('returns an empty label rather than throwing on a bad date', () => {
      expect(formatEventWhen(new Date('nope'), true)).toBe('');
    });
  });

  it('reports an invalid date rather than throwing', () => {
    expect(formatDueDate(new Date('nope'))).toBe('Invalid Date');
    expect(isAllDayDate(undefined)).toBe(false);
  });
});
