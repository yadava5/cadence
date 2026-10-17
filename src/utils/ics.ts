/**
 * iCalendar (.ics, RFC 5545) export, rendered by `ical-generator`.
 *
 * Kept out of `exportData.ts` so the library and its time-zone table are only
 * fetched when someone actually exports: callers `await import('@/utils/ics')`.
 * It runs in the browser on purpose: an all-day event is stored as local
 * midnight → local 23:59:59.999 of its last day (`EventCreationDialog`), so
 * only the browser knows which calendar dates those instants meant.
 *
 * ## What is written
 *
 * The file describes the series the user created, in their zone:
 *
 *   - timed events: `DTSTART;TZID=<browser zone>` at the local wall-clock
 *     time, with a VTIMEZONE (RFC 5545 §3.6.5 requires one per TZID), so a
 *     "Mondays at 9am" series stays at 9am across DST in Google and Apple;
 *   - all-day events: VALUE=DATE with an exclusive DTEND, and therefore a
 *     date-valued UNTIL and EXDATE (§3.3.10, §3.8.5.1).
 *
 * ## Why exceptions and UNTIL are remapped, not copied
 *
 * The app expands a series with rrule.js from a plain `Date` DTSTART
 * (`src/utils/recurrence.ts`), and rrule.js walks the rule in UTC. That is not
 * what the user meant whenever the local and UTC dates differ: in New York a
 * "Mondays at 8pm" series is Tuesday 00:00Z, so the app matches BYDAY=MO
 * against UTC Mondays and draws it on Sunday evenings. Writing DTSTART in UTC
 * would not reproduce that either: a DTSTART that is not itself an occurrence
 * leaves the recurrence set undefined (§3.8.5.3), and importers disagree.
 *
 * So the stored instants (a deleted occurrence, or UNTIL) are instants of the
 * app's UTC walk, and each is mapped onto the occurrence of the intended
 * series that the rule produced it as:
 *
 *   - when BYDAY / BYMONTHDAY / BYYEARDAY / BYWEEKNO choose the day, the rule
 *     matched the instant's UTC date, so that date is the occurrence's date;
 *   - otherwise the day is DTSTART's plus whole periods, so it moves by the
 *     same amount DTSTART's local date differs from its UTC date.
 *
 * The occurrence keeps DTSTART's local time of day.
 */
import ical, { escape, formatDate, type ICalEventData } from 'ical-generator';
import { rrulestr } from 'rrule';
import {
  tzlib_get_ical_block,
  tzlib_get_timezones,
} from 'timezones-ical-library';

import type { CalendarEvent } from '@shared/types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Rule parts that pick an occurrence's day themselves, instead of DTSTART. */
const DAY_SELECTING_PARTS = /(?:^|;)(BYDAY|BYMONTHDAY|BYYEARDAY|BYWEEKNO)=/i;

export interface IcsOptions {
  /** Written as NAME / X-WR-CALNAME, which importers offer as the calendar's name. */
  calendarName?: string;
  /** DTSTAMP for every event. Defaults to now; fixed in tests. */
  now?: Date;
}

/** Strip HTML so a rich-text event description becomes plain ICS text. */
export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function isValidDate(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

/**
 * The zone timed events are written in, with its VTIMEZONE: the browser's own
 * zone, because every local date and time below is read with local getters.
 * Null when there is no VTIMEZONE for it, in which case times go out in UTC.
 *
 * The name is taken from the VTIMEZONE, not from `Intl`: browsers still
 * report legacy aliases (Chrome and Node say `Asia/Calcutta`), the table
 * answers those with the canonical zone (`TZID:Asia/Kolkata`), and every
 * TZID parameter has to name a VTIMEZONE that is actually in the file.
 */
function exportTimeZone(): { tzid: string; vtimezone: string } | null {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!zone || zone === 'UTC' || zone === 'Etc/UTC') return null;
  // Checked first: the table logs to the console for a zone it lacks.
  if (!(tzlib_get_timezones() as string[]).includes(zone)) return null;
  const block = tzlib_get_ical_block(zone);
  const vtimezone = Array.isArray(block) ? block[0] : '';
  const tzid = /^TZID:(.+)$/m.exec(vtimezone ?? '')?.[1]?.trim();
  return tzid && vtimezone ? { tzid, vtimezone } : null;
}

/**
 * A calendar date carried as UTC midnight. `formatDate(null, d, true)` reads
 * UTC getters, so this prints the intended date in every zone.
 */
function utcMidnight(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d));
}

function localDateOf(d: Date): Date {
  return utcMidnight(d.getFullYear(), d.getMonth(), d.getDate());
}

function utcDateOf(d: Date): Date {
  return utcMidnight(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Exclusive DTEND date for an all-day event. Stored ends are either the
 * inclusive 23:59:59.999 of the last day or, from a calendar drag selection,
 * the exclusive midnight after it; both mean the same last day.
 */
function allDayEndExclusive(start: Date, end: Date): Date {
  const startDate = localDateOf(start);
  if (!isValidDate(end) || end <= start) {
    return new Date(startDate.getTime() + DAY_MS);
  }
  const isMidnight =
    end.getHours() === 0 &&
    end.getMinutes() === 0 &&
    end.getSeconds() === 0 &&
    end.getMilliseconds() === 0;
  const endDate = localDateOf(end);
  return isMidnight ? endDate : new Date(endDate.getTime() + DAY_MS);
}

/** Parse a basic-format UTC date-time such as `20261130T235959Z`. */
function parseIcsUtc(value: string): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
}

/**
 * The RRULE (and EXDATE) lines for a recurring event, or null.
 *
 * The rule is passed through as stored rather than rebuilt from parts: the
 * library's structured form cannot write a date-valued UNTIL and refuses
 * ordinal BYDAY values such as `2TU`, both of which a stored rule can hold.
 */
function recurrenceLines(
  ev: CalendarEvent,
  start: Date,
  zone: string | null
): string | null {
  const stored = ev.recurrence?.trim();
  if (!stored) return null;
  let rule = stored.replace(/^RRULE:/i, '');
  if (!rule) return null;

  // Whole days DTSTART's local date is ahead of (or behind) its UTC date.
  const anchorShift = DAY_SELECTING_PARTS.test(rule)
    ? 0
    : localDateOf(start).getTime() - utcDateOf(start).getTime();

  /** The intended occurrence that the app's UTC-walk instant stands for. */
  const intendedDate = (instant: Date) =>
    new Date(utcDateOf(instant).getTime() + anchorShift);
  const intendedLocal = (instant: Date) => {
    const day = intendedDate(instant);
    return new Date(
      day.getUTCFullYear(),
      day.getUTCMonth(),
      day.getUTCDate(),
      start.getHours(),
      start.getMinutes(),
      start.getSeconds()
    );
  };

  // UNTIL bounds the app's walk, so it becomes the last occurrence that walk
  // reaches, mapped like any other. A rule whose walk reaches nothing keeps
  // its UNTIL as written (made a date for an all-day series).
  rule = rule.replace(/UNTIL=(\d{8}T\d{6}Z)/i, (whole, value: string) => {
    const until = parseIcsUtc(value);
    if (!until) return whole;
    let last: Date | null = null;
    try {
      last = rrulestr(`RRULE:${rule}`, { dtstart: start }).before(until, true);
    } catch {
      // An unparseable rule is still exported verbatim; importers decide.
    }
    if (ev.allDay) {
      return `UNTIL=${formatDate(null, last ? intendedDate(last) : utcDateOf(until), true)}`;
    }
    return last ? `UNTIL=${formatDate(null, intendedLocal(last))}` : whole;
  });

  const lines = [`RRULE:${rule}`];
  const excluded = (ev.exceptions ?? [])
    .map((iso) => new Date(iso))
    .filter(isValidDate);
  if (excluded.length > 0) {
    const values = ev.allDay
      ? excluded.map((d) => formatDate(null, intendedDate(d), true))
      : zone
        ? excluded.map((d) => formatDate(zone, intendedLocal(d), false, true))
        : excluded.map((d) => formatDate(null, intendedLocal(d)));
    const param = ev.allDay ? ';VALUE=DATE' : zone ? `;TZID=${zone}` : '';
    lines.push(`EXDATE${param}:${[...new Set(values)].join(',')}`);
  }
  return lines.join('\r\n');
}

function toEventData(
  ev: CalendarEvent,
  stamp: Date,
  zone: string | null
): ICalEventData | null {
  const start = new Date(ev.start);
  if (!isValidDate(start)) return null;
  const end = new Date(ev.end);

  const description = [
    ev.description ? stripHtml(ev.description) : '',
    ev.notes?.trim() ?? '',
  ]
    .filter(Boolean)
    .join('\n\n');
  const created = ev.createdAt ? new Date(ev.createdAt) : null;
  const updated = ev.updatedAt ? new Date(ev.updatedAt) : null;

  const base: ICalEventData = {
    // Stable across exports, so re-importing updates rather than duplicates.
    id: `${ev.id}@cadence`,
    stamp,
    summary: ev.title || 'Untitled',
    description: description || null,
    location: ev.location?.trim() || null,
    created: created && isValidDate(created) ? created : null,
    lastModified: updated && isValidDate(updated) ? updated : null,
    repeating: recurrenceLines(ev, start, zone),
    start,
  };

  if (ev.allDay) {
    return {
      ...base,
      allDay: true,
      start: localDateOf(start),
      end: allDayEndExclusive(start, end),
    };
  }
  return {
    ...base,
    timezone: zone,
    end: isValidDate(end) && end > start ? end : start,
  };
}

/** Render events as one VCALENDAR. Events with an unparseable start are skipped. */
export function buildEventsIcs(
  events: readonly CalendarEvent[],
  options: IcsOptions = {}
): string {
  const stamp = options.now ?? new Date();
  const exportZone = exportTimeZone();
  const zone = exportZone?.tzid ?? null;
  const calendar = ical({
    prodId: { company: 'Cadence', product: 'Calendar Export', language: 'EN' },
    // The library writes NAME/X-WR-CALNAME verbatim; TEXT needs escaping.
    name: options.calendarName ? escape(options.calendarName, false) : null,
    // No calendar-wide zone: all-day dates must stay floating. The generator
    // emits one VTIMEZONE per zone that the timed events name.
    timezone: {
      name: null,
      generator: (tzid) =>
        tzid === exportZone?.tzid ? exportZone.vtimezone : null,
    },
  });
  for (const ev of events) {
    const data = toEventData(ev, stamp, zone);
    if (data) calendar.createEvent(data);
  }
  // RFC 5545 §3.1 ends every content line with CRLF, the last one included;
  // the library stops short of the final one.
  const text = calendar.toString();
  return text.endsWith('\r\n') ? text : `${text}\r\n`;
}

/** The events that belong to one calendar, matched by id when both have one. */
export function eventsInCalendar(
  events: readonly CalendarEvent[],
  calendar: { id?: string; name: string }
): CalendarEvent[] {
  return events.filter((ev) =>
    calendar.id && ev.calendarId
      ? ev.calendarId === calendar.id
      : ev.calendarName === calendar.name
  );
}

/** A filesystem-safe filename for a calendar's export. */
export function icsFilename(calendarName: string, stamp: string): string {
  const slug = calendarName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `cadence-${slug || 'calendar'}-${stamp}.ics`;
}
