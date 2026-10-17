/**
 * The .ics export, checked by a second, independent iCalendar implementation.
 *
 * Every recurring case parses the file with ical.js, registers the VTIMEZONE
 * the file itself carries, expands the series there, and compares the result
 * with occurrences written out BY HAND as UTC instants. Two oracles were ruled
 * out on purpose:
 *
 *   - `expandOccurrences()` is not one. It walks the rule in UTC, so in New
 *     York a "Mondays at 8pm" series lands on Sunday evenings (see the header
 *     of `src/utils/ics.ts`); agreeing with it would certify that bug.
 *   - `Time#toJSDate()` is not used. It falls back to the process zone, which
 *     is set to the export's zone here, so a file with no VTIMEZONE at all
 *     would still pass. `convertToZone(utc)` uses only what the file says.
 *
 * The zone is switched per test through `process.env.TZ`, which Node applies
 * immediately; each block asserts the switch took before trusting anything.
 */
import ICAL from 'ical.js';
import { afterEach, describe, expect, it } from 'vitest';

import type { CalendarEvent } from '@shared/types';

import { clampRRuleUntil } from '../recurrence';
import { buildEventsIcs, eventsInCalendar, icsFilename } from '../ics';

const ORIGINAL_TZ = process.env.TZ;
const NOW = new Date('2026-10-17T12:00:00.000Z');

/** Legacy names ICU still reports, as Chrome does, for canonical zones. */
const ICU_ALIASES: Record<string, string> = { 'Asia/Kolkata': 'Asia/Calcutta' };

function useZone(zone: string, julyOffsetMinutes: number): void {
  process.env.TZ = zone;
  // Anti-vacuity: if Node ignored the switch, every expectation below would
  // be checked in the wrong zone.
  expect([zone, ICU_ALIASES[zone]]).toContain(
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  expect(new Date(2026, 6, 1).getTimezoneOffset()).toBe(julyOffsetMinutes);
}

afterEach(() => {
  process.env.TZ = ORIGINAL_TZ;
});

function event(overrides: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: 'evt-1',
    title: 'Event',
    start: new Date(2026, 9, 5, 9, 0),
    end: new Date(2026, 9, 5, 10, 0),
    calendarName: 'Work',
    ...overrides,
  };
}

function parse(ics: string): ICAL.Component {
  return new ICAL.Component(ICAL.parse(ics));
}

/**
 * Expand the one VEVENT in `ics` with ical.js, using only the VTIMEZONEs the
 * file carries, and return each occurrence as a UTC ISO string (timed) or
 * `YYYY-MM-DD` (all-day) up to `until`.
 */
function expand(ics: string, until: string): string[] {
  const vcal = parse(ics);
  ICAL.TimezoneService.reset();
  for (const vtz of vcal.getAllSubcomponents('vtimezone')) {
    ICAL.TimezoneService.register(vtz);
  }
  const vevents = vcal.getAllSubcomponents('vevent');
  expect(vevents).toHaveLength(1);
  const ev = new ICAL.Event(vevents[0]);

  const isDate = ev.startDate.isDate;
  if (!isDate) {
    // The start must resolve to the zone the file declares, not to floating
    // time; floating would be read as UTC and could pass by accident.
    const tzid = vevents[0].getFirstProperty('dtstart')!.getParameter('tzid');
    if (tzid) {
      expect(ICAL.TimezoneService.has(String(tzid))).toBe(true);
      expect(ev.startDate.zone.tzid).toBe(tzid);
    }
  }

  const limit = ICAL.Time.fromJSDate(new Date(until), true);
  const out: string[] = [];
  const it = ev.iterator();
  for (let next = it.next(); next; next = it.next()) {
    if (next.compare(limit) > 0) break;
    if (isDate) {
      out.push(next.toString());
    } else {
      out.push(
        new Date(
          next.convertToZone(ICAL.Timezone.utcTimezone).toUnixTime() * 1000
        ).toISOString()
      );
    }
    if (out.length > 200) throw new Error('runaway expansion');
  }
  return out;
}

/** The raw, unfolded content lines of the file. */
function lines(ics: string): string[] {
  return ics.replace(/\r\n[ \t]/g, '').split('\r\n');
}

/** The event's own RRULE line (a VTIMEZONE carries RRULEs too). */
function eventRule(ics: string): string | undefined {
  const all = lines(ics);
  return all
    .slice(all.indexOf('BEGIN:VEVENT'))
    .find((l) => l.startsWith('RRULE:'));
}

describe('recurring timed events keep their local time and weekday', () => {
  it('New York, Mondays 9am: DST moves the UTC time, not the wall time; a deleted occurrence stays deleted', () => {
    useZone('America/New_York', 240);
    const ics = buildEventsIcs(
      [
        event({
          start: new Date(2026, 9, 5, 9, 0),
          end: new Date(2026, 9, 5, 10, 0),
          recurrence: 'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO',
          // What the app stores when the Oct 19 occurrence is deleted.
          exceptions: ['2026-10-19T13:00:00.000Z'],
        }),
      ],
      { now: NOW }
    );

    expect(lines(ics)).toContain(
      'DTSTART;TZID=America/New_York:20261005T090000'
    );
    expect(lines(ics)).toContain(
      'EXDATE;TZID=America/New_York:20261019T090000'
    );
    expect(expand(ics, '2026-11-20T00:00:00Z')).toEqual([
      '2026-10-05T13:00:00.000Z',
      '2026-10-12T13:00:00.000Z',
      '2026-10-26T13:00:00.000Z',
      '2026-11-02T14:00:00.000Z', // EST from Nov 1: still 9am local
      '2026-11-09T14:00:00.000Z',
      '2026-11-16T14:00:00.000Z',
    ]);
  });

  it('New York, Mondays 8pm (Tuesday in UTC): stays on Mondays, and UNTIL keeps the last Monday', () => {
    useZone('America/New_York', 240);
    // The app's UTC walk puts this series on Mondays 00:00Z (Sunday evenings
    // locally). Deleting the occurrence it shows on Sun Oct 18 stores
    // 2026-10-19T00:00Z; that is the rule's Oct 19 match, i.e. Mon Oct 19 8pm.
    const until = new Date(2026, 10, 9, 23, 59, 59); // "ends on Nov 9"
    const ics = buildEventsIcs(
      [
        event({
          start: new Date(2026, 9, 5, 20, 0),
          end: new Date(2026, 9, 5, 21, 0),
          recurrence: `RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO;UNTIL=${until
            .toISOString()
            .replace(/[-:]/g, '')
            .replace(/\.\d{3}/, '')}`,
          exceptions: ['2026-10-19T00:00:00.000Z'],
        }),
      ],
      { now: NOW }
    );

    expect(expand(ics, '2026-12-31T00:00:00Z')).toEqual([
      '2026-10-06T00:00:00.000Z', // Mon Oct 5, 8pm EDT
      '2026-10-13T00:00:00.000Z',
      '2026-10-27T00:00:00.000Z',
      '2026-11-03T01:00:00.000Z', // Mon Nov 2, 8pm EST
      '2026-11-10T01:00:00.000Z', // Mon Nov 9, the last one
    ]);
    // RFC 5545: with a TZID'd DTSTART, UNTIL must be UTC.
    expect(eventRule(ics)).toMatch(/UNTIL=20261110T010000Z(;|$)/);
  });

  it('Kolkata, Mondays 2am (Sunday in UTC): "this and following" ends the series before the split, not one later', () => {
    useZone('Asia/Kolkata', -330);
    const start = new Date(2026, 9, 5, 2, 0);
    // The app shows this series on Tuesdays (Mondays 20:30Z). Splitting it at
    // the third occurrence clamps UNTIL to one second before that instant.
    const split = new Date('2026-10-19T20:30:00.000Z');
    const ics = buildEventsIcs(
      [
        event({
          start,
          end: new Date(2026, 9, 5, 3, 0),
          recurrence: clampRRuleUntil(
            'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO',
            split
          ),
        }),
      ],
      { now: NOW }
    );

    // The browser says Asia/Calcutta; the TZID must name the VTIMEZONE the
    // file actually carries, which is the canonical zone.
    expect(lines(ics)).toContain('DTSTART;TZID=Asia/Kolkata:20261005T020000');
    expect(
      parse(ics)
        .getAllSubcomponents('vtimezone')
        .map((z) => z.getFirstPropertyValue('tzid'))
    ).toEqual(['Asia/Kolkata']);
    expect(expand(ics, '2026-12-31T00:00:00Z')).toEqual([
      '2026-10-04T20:30:00.000Z', // Mon Oct 5, 2am IST
      '2026-10-11T20:30:00.000Z', // Mon Oct 12 — the last before the split
    ]);
  });

  it('a daily series whose day comes from DTSTART maps exceptions and UNTIL by the same shift', () => {
    useZone('America/New_York', 240);
    // Daily at 8pm from Mon Oct 5: DTSTART is Oct 6 in UTC, so the app's walk
    // dates every occurrence one day after its local date.
    const ics = buildEventsIcs(
      [
        event({
          start: new Date(2026, 9, 5, 20, 0),
          end: new Date(2026, 9, 5, 20, 30),
          recurrence: clampRRuleUntil(
            'RRULE:FREQ=DAILY;INTERVAL=1',
            new Date('2026-10-10T00:00:00.000Z') // split at Fri Oct 9 8pm
          ),
          exceptions: ['2026-10-08T00:00:00.000Z'], // deleted Wed Oct 7 8pm
        }),
      ],
      { now: NOW }
    );

    expect(lines(ics)).toContain(
      'EXDATE;TZID=America/New_York:20261007T200000'
    );
    expect(expand(ics, '2026-12-31T00:00:00Z')).toEqual([
      '2026-10-06T00:00:00.000Z', // Mon
      '2026-10-07T00:00:00.000Z', // Tue
      '2026-10-09T00:00:00.000Z', // Thu (Wed deleted)
    ]);
  });

  it('a one-off timed event carries its zone and a VTIMEZONE for it', () => {
    useZone('Europe/Berlin', -120);
    const ics = buildEventsIcs([event({})], { now: NOW });
    const vcal = parse(ics);
    const zones = vcal.getAllSubcomponents('vtimezone');
    expect(zones.map((z) => z.getFirstPropertyValue('tzid'))).toEqual([
      'Europe/Berlin',
    ]);
    expect(lines(ics)).toContain('DTSTART;TZID=Europe/Berlin:20261005T090000');
    expect(lines(ics)).toContain('DTEND;TZID=Europe/Berlin:20261005T100000');
    expect(expand(ics, '2027-01-01T00:00:00Z')).toEqual([
      '2026-10-05T07:00:00.000Z',
    ]);
  });

  it('falls back to UTC times, with no TZID or VTIMEZONE, when the browser runs in UTC', () => {
    useZone('UTC', 0);
    const ics = buildEventsIcs(
      [
        event({
          start: new Date('2026-10-05T09:00:00Z'),
          end: new Date('2026-10-05T10:00:00Z'),
          recurrence: 'RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=2',
          exceptions: ['2026-10-12T09:00:00.000Z'],
        }),
      ],
      { now: NOW }
    );
    expect(ics).not.toContain('TZID');
    expect(ics).not.toContain('BEGIN:VTIMEZONE');
    expect(lines(ics)).toContain('DTSTART:20261005T090000Z');
    expect(lines(ics)).toContain('EXDATE:20261012T090000Z');
    expect(expand(ics, '2027-01-01T00:00:00Z')).toEqual([
      '2026-10-05T09:00:00.000Z',
    ]);
  });
});

describe('all-day events are dates, and so are their UNTIL and EXDATE', () => {
  const allDay = (start: Date, last: Date, extra: Partial<CalendarEvent>) =>
    event({
      allDay: true,
      start,
      // How EventCreationDialog stores an all-day end: 23:59:59.999 local.
      end: new Date(
        last.getFullYear(),
        last.getMonth(),
        last.getDate(),
        23,
        59,
        59,
        999
      ),
      ...extra,
    });

  it('Kolkata, all-day Mondays: dates do not slip to the UTC day before', () => {
    useZone('Asia/Kolkata', -330);
    const mon = new Date(2026, 9, 5);
    const ics = buildEventsIcs(
      [
        allDay(mon, mon, {
          recurrence: 'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO',
          // The app walks Mondays at 18:30Z (Tuesdays locally); this is the
          // instant it stores for the rule's Oct 19 match.
          exceptions: ['2026-10-19T18:30:00.000Z'],
        }),
      ],
      { now: NOW }
    );

    expect(lines(ics)).toContain('DTSTART;VALUE=DATE:20261005');
    expect(lines(ics)).toContain('DTEND;VALUE=DATE:20261006');
    expect(lines(ics)).toContain('EXDATE;VALUE=DATE:20261019');
    expect(ics).not.toContain('BEGIN:VTIMEZONE');
    expect(expand(ics, '2026-11-03T00:00:00Z')).toEqual([
      '2026-10-05',
      '2026-10-12',
      '2026-10-26',
      '2026-11-02',
    ]);
  });

  it('Los Angeles, all-day Mondays across the DST change, with a date-valued UNTIL', () => {
    useZone('America/Los_Angeles', 420);
    const mon = new Date(2026, 9, 5);
    const until = new Date(2026, 10, 16, 23, 59, 59); // "ends on Nov 16"
    const ics = buildEventsIcs(
      [
        allDay(mon, mon, {
          recurrence: `RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO;UNTIL=${until
            .toISOString()
            .replace(/[-:]/g, '')
            .replace(/\.\d{3}/, '')}`,
          // After Nov 1 the app's 07:00Z walk lands at 23:00 the day before
          // locally; this is the rule's Nov 9 match.
          exceptions: ['2026-11-09T07:00:00.000Z'],
        }),
      ],
      { now: NOW }
    );

    expect(eventRule(ics)).toMatch(/UNTIL=20261116(;|$)/);
    expect(lines(ics)).toContain('EXDATE;VALUE=DATE:20261109');
    expect(expand(ics, '2027-01-01T00:00:00Z')).toEqual([
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
      '2026-11-02',
      '2026-11-16',
    ]);
  });

  it('a daily all-day series east of UTC shifts its exceptions with DTSTART', () => {
    useZone('Asia/Kolkata', -330);
    const mon = new Date(2026, 9, 5);
    const ics = buildEventsIcs(
      [
        allDay(mon, mon, {
          recurrence: 'RRULE:FREQ=DAILY;INTERVAL=1;COUNT=5',
          // App walk: Oct 4 18:30Z + n days. Oct 6 18:30Z is local Oct 7.
          exceptions: ['2026-10-06T18:30:00.000Z'],
        }),
      ],
      { now: NOW }
    );
    expect(expand(ics, '2027-01-01T00:00:00Z')).toEqual([
      '2026-10-05',
      '2026-10-06',
      '2026-10-08',
      '2026-10-09',
    ]);
  });

  it('DTEND is exclusive whichever way the end was stored', () => {
    useZone('America/New_York', 240);
    const inclusive = buildEventsIcs(
      [allDay(new Date(2026, 9, 5), new Date(2026, 9, 7), {})],
      { now: NOW }
    );
    const exclusive = buildEventsIcs(
      [
        event({
          allDay: true,
          start: new Date(2026, 9, 5),
          end: new Date(2026, 9, 8), // a calendar drag selection's end
        }),
      ],
      { now: NOW }
    );
    for (const ics of [inclusive, exclusive]) {
      expect(lines(ics)).toContain('DTSTART;VALUE=DATE:20261005');
      expect(lines(ics)).toContain('DTEND;VALUE=DATE:20261008');
    }
  });
});

describe('file structure', () => {
  it('is a well-formed VCALENDAR that a strict reader round-trips', () => {
    useZone('America/New_York', 240);
    const title = `Quarterly review; budget, "Q4" — ${'🎉'.repeat(30)}`;
    const ics = buildEventsIcs(
      [
        event({
          id: 'evt-42',
          title,
          description: '<p>Agenda &amp; notes</p><p>Line two</p>',
          notes: 'Bring the deck',
          location: 'Room 4, Floor 2',
          createdAt: new Date('2026-10-01T10:00:00Z'),
          updatedAt: new Date('2026-10-02T11:30:00Z'),
        }),
      ],
      { calendarName: 'Work, Personal; Shared', now: NOW }
    );

    // RFC 5545 §3.1: every content line ends in CRLF (the last one too),
    // and is folded at 75 octets.
    expect(ics).not.toMatch(/[^\r]\n/);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    for (const physical of ics.split('\r\n')) {
      expect(new TextEncoder().encode(physical).length).toBeLessThanOrEqual(75);
    }

    const vcal = parse(ics);
    expect(vcal.getFirstPropertyValue('version')).toBe('2.0');
    expect(vcal.getFirstPropertyValue('prodid')).toBe(
      '-//Cadence//Calendar Export//EN'
    );
    // TEXT escaping (RFC 5545 §3.3.11; X- properties default to TEXT).
    // Asserted on the raw line: ical.js leaves X- values undecoded.
    expect(lines(ics)).toContain('X-WR-CALNAME:Work\\, Personal\\; Shared');

    const vevent = vcal.getFirstSubcomponent('vevent')!;
    expect(vevent.getFirstPropertyValue('uid')).toBe('evt-42@cadence');
    expect(vevent.getFirstPropertyValue('summary')).toBe(title);
    expect(vevent.getFirstPropertyValue('description')).toBe(
      'Agenda & notes\nLine two\n\nBring the deck'
    );
    expect(vevent.getFirstPropertyValue('location')).toBe('Room 4, Floor 2');
    expect(String(vevent.getFirstPropertyValue('dtstamp'))).toBe(
      '2026-10-17T12:00:00Z'
    );
    expect(String(vevent.getFirstPropertyValue('created'))).toBe(
      '2026-10-01T10:00:00Z'
    );
    expect(String(vevent.getFirstPropertyValue('last-modified'))).toBe(
      '2026-10-02T11:30:00Z'
    );
  });

  it('skips an event whose start is not a date, and keeps the rest', () => {
    useZone('America/New_York', 240);
    const ics = buildEventsIcs(
      [event({ id: 'bad', start: new Date('nope') }), event({ id: 'good' })],
      { now: NOW }
    );
    const uids = parse(ics)
      .getAllSubcomponents('vevent')
      .map((v) => v.getFirstPropertyValue('uid'));
    expect(uids).toEqual(['good@cadence']);
  });
});

describe('eventsInCalendar', () => {
  const events = [
    event({ id: '1', calendarId: 'cal-work', calendarName: 'Work' }),
    event({ id: '2', calendarName: 'Work' }), // offline: name only
    event({ id: '3', calendarId: 'cal-home', calendarName: 'Home' }),
  ];

  it('matches by id when both sides have one, by name otherwise', () => {
    expect(
      eventsInCalendar(events, { id: 'cal-work', name: 'Work' }).map(
        (e) => e.id
      )
    ).toEqual(['1', '2']);
    expect(eventsInCalendar(events, { name: 'Work' }).map((e) => e.id)).toEqual(
      ['1', '2']
    );
    expect(eventsInCalendar(events, { name: 'Home' }).map((e) => e.id)).toEqual(
      ['3']
    );
  });
});

describe('icsFilename', () => {
  it('slugs the calendar name into a safe filename', () => {
    expect(icsFilename('Work / Personal: Café!', '2026-10-17')).toBe(
      'cadence-work-personal-cafe-2026-10-17.ics'
    );
    expect(icsFilename('🎉🎉', '2026-10-17')).toBe(
      'cadence-calendar-2026-10-17.ics'
    );
  });
});
