/**
 * Due-date display that distinguishes an *all-day date* from an *instant*.
 *
 * A task's `scheduledDate` carries both shapes. "Prepare presentation slides"
 * is due on a calendar day and arrives as `2026-08-19T00:00:00.000Z`;
 * "Review project proposal" is due at a moment and arrives as
 * `2026-08-15T17:26:43.021Z`. Formatting the first one in the viewer's local
 * zone shifted it back a day and invented a time ("August 18th, 2026 at
 * 8:00 PM" in New York), because UTC midnight is the previous evening
 * everywhere west of Greenwich.
 *
 * There is no `allDay` column on a task (only `CalendarEvent` has one), so
 * all-day is inferred from the value itself: a `scheduledDate` whose clock is
 * exactly midnight — in UTC (the shape the API/seed produces) or in local time
 * (the shape the in-app parser produces, `setHours(0,0,0,0)`) — is a calendar
 * day, not an instant. Both shapes must be recognised: recognising only one
 * looks correct in whichever timezone makes the two coincide.
 *
 * All-day values are then rendered from their calendar parts with **no
 * timezone conversion** — the month is named here and the day arithmetic is
 * done on integers, so the same row reads the same in every zone. Instants
 * keep going through date-fns in local time, which was already correct.
 */

import { format } from 'date-fns';
import { formatRelative } from './date';

/** A calendar day, with `month` 1-12. Deliberately not a `Date`. */
export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export type DueDateStyle = 'relative' | 'medium' | 'numeric' | 'short';

const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const WEEKDAYS_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const isValidDate = (date: Date): boolean =>
  date instanceof Date && !Number.isNaN(date.getTime());

const isUTCMidnight = (date: Date): boolean =>
  date.getUTCHours() === 0 &&
  date.getUTCMinutes() === 0 &&
  date.getUTCSeconds() === 0 &&
  date.getUTCMilliseconds() === 0;

const isLocalMidnight = (date: Date): boolean =>
  date.getHours() === 0 &&
  date.getMinutes() === 0 &&
  date.getSeconds() === 0 &&
  date.getMilliseconds() === 0;

/**
 * True when the value denotes a whole calendar day rather than a moment.
 * @see the module comment for why midnight is the only available signal.
 */
export const isAllDayDate = (date: Date | null | undefined): boolean => {
  if (!date || !isValidDate(date)) return false;
  return isUTCMidnight(date) || isLocalMidnight(date);
};

/**
 * The calendar day a value denotes. For a UTC-midnight all-day value that is
 * its UTC day (never the local one, which is a day earlier west of Greenwich);
 * for everything else it is the local day, which is what the viewer means.
 */
export const getCalendarDate = (date: Date): CalendarDate =>
  isUTCMidnight(date)
    ? {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
      }
    : {
        year: date.getFullYear(),
        month: date.getMonth() + 1,
        day: date.getDate(),
      };

/** Today, as the viewer's calendar day. */
export const getTodayCalendarDate = (now: Date = new Date()): CalendarDate => ({
  year: now.getFullYear(),
  month: now.getMonth() + 1,
  day: now.getDate(),
});

/** Days since the epoch — integer arithmetic, so it never depends on a zone. */
export const calendarDayNumber = ({ year, month, day }: CalendarDate): number =>
  Math.floor(Date.UTC(year, month - 1, day) / MS_PER_DAY);

/** 0 = Sunday … 6 = Saturday, computed from the parts alone. */
export const calendarWeekday = ({ year, month, day }: CalendarDate): number =>
  new Date(Date.UTC(year, month - 1, day)).getUTCDay();

export const calendarWeekdayName = (date: CalendarDate): string =>
  WEEKDAYS_LONG[calendarWeekday(date)];

/** "Mon" … "Sun" — the `EEE` shape, computed from the parts alone. */
export const calendarWeekdayShortName = (date: CalendarDate): string =>
  WEEKDAYS_LONG[calendarWeekday(date)].slice(0, 3);

const pad2 = (value: number): string => String(value).padStart(2, '0');

const ordinal = (day: number): string => {
  const rem100 = day % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
};

/**
 * Render calendar parts in the same shapes the app already used via date-fns:
 * `relative`/`long` ≙ `PPP`, `medium` ≙ `MMM dd, yyyy`, `numeric` ≙
 * `MM/dd/yyyy`, `short` ≙ `MMM d`.
 */
export const formatCalendarDate = (
  date: CalendarDate,
  style: Exclude<DueDateStyle, 'relative'> | 'long' = 'long'
): string => {
  switch (style) {
    case 'medium':
      return `${MONTHS_SHORT[date.month - 1]} ${pad2(date.day)}, ${date.year}`;
    case 'numeric':
      return `${pad2(date.month)}/${pad2(date.day)}/${date.year}`;
    case 'short':
      return `${MONTHS_SHORT[date.month - 1]} ${date.day}`;
    case 'long':
    default:
      return `${MONTHS_LONG[date.month - 1]} ${ordinal(date.day)}, ${date.year}`;
  }
};

/** "Today" / "Tomorrow" / "Yesterday" / weekday / "August 19th, 2026". */
export const formatCalendarDateRelative = (
  date: CalendarDate,
  now: Date = new Date()
): string => {
  const diff =
    calendarDayNumber(date) - calendarDayNumber(getTodayCalendarDate(now));

  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  if (Math.abs(diff) <= 7) return calendarWeekdayName(date);

  return formatCalendarDate(date, 'long');
};

/**
 * Format a task's due date.
 *
 * `relative` carries the clock time for an instant and omits it for an all-day
 * date. The other styles are always date-only; callers that want a time append
 * it themselves (they already did).
 */
export const formatDueDate = (
  date: Date,
  style: DueDateStyle = 'relative'
): string => {
  if (!isValidDate(date)) return 'Invalid Date';

  if (isAllDayDate(date)) {
    const parts = getCalendarDate(date);
    return style === 'relative'
      ? formatCalendarDateRelative(parts)
      : formatCalendarDate(parts, style);
  }

  switch (style) {
    case 'medium':
      return format(date, 'MMM dd, yyyy');
    case 'numeric':
      return format(date, 'MM/dd/yyyy');
    case 'short':
      return format(date, 'MMM d');
    case 'relative':
    default:
      return formatRelative(date);
  }
};

/**
 * The one-line "when" for a calendar event, as the command palette shows it.
 *
 * An all-day event is a calendar day, not an instant, and its start arrives as
 * UTC midnight — the previous evening west of Greenwich — so formatting it on
 * the local clock named the wrong day. All-day values are rendered from their
 * calendar parts; a timed event keeps its local clock, which is what its
 * attendees mean.
 */
export const formatEventWhen = (start: Date, allDay?: boolean): string => {
  if (!isValidDate(start)) return '';

  if (allDay) {
    const parts = getCalendarDate(start);
    return `${calendarWeekdayShortName(parts)}, ${formatCalendarDate(parts, 'short')}`;
  }

  return `${format(start, 'EEE, MMM d')} · ${format(start, 'p')}`;
};

/**
 * The `Date` a date picker should highlight for a due date: an all-day value
 * is re-anchored to local midnight of the day it denotes, so the calendar
 * highlights (and writes back) the day the badge shows.
 */
export const toPickerDate = (date: Date): Date => {
  if (!isValidDate(date) || !isAllDayDate(date)) return date;
  const { year, month, day } = getCalendarDate(date);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
};
