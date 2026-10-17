import { readFileSync } from 'node:fs';

import ICAL from 'ical.js';

import { test, expect } from './fixtures';

/*
 * Export one calendar from the sidebar and read the file that was actually
 * downloaded. The series is seeded the way offline mode stores it (the
 * recurrence editor has its own coverage), in New York, at a time of day whose
 * UTC date is the next day: the case where the app's own UTC expansion and the
 * series the user meant disagree (see src/utils/ics.ts).
 */
test.use({ timezoneId: 'America/New_York' });

const CALENDARS = [
  { name: 'Personal', color: '#3b82f6', visible: true, isDefault: true },
  { name: 'Team Rituals', color: '#10b981', visible: true },
];

const EVENTS = [
  {
    id: 'evt-sync',
    title: 'Team sync',
    calendarName: 'Team Rituals',
    start: '2026-10-06T00:00:00.000Z', // Mon Oct 5, 8pm EDT
    end: '2026-10-06T01:00:00.000Z',
    recurrence: 'RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO',
    // What deleting the rule's Oct 19 occurrence stores.
    exceptions: ['2026-10-19T00:00:00.000Z'],
  },
  {
    id: 'evt-offsite',
    title: 'Offsite',
    calendarName: 'Team Rituals',
    allDay: true,
    start: '2026-10-07T04:00:00.000Z', // local midnight, Wed Oct 7
    end: '2026-10-09T03:59:59.999Z', // local 23:59:59.999, Thu Oct 8
  },
  {
    id: 'evt-dentist',
    title: 'Dentist',
    calendarName: 'Personal',
    start: '2026-10-06T14:00:00.000Z',
    end: '2026-10-06T15:00:00.000Z',
  },
];

test.describe('export a calendar to .ics', () => {
  test('the calendar menu downloads that calendar, recurrence and exception intact', async ({
    page,
  }) => {
    await page.evaluate(
      ([calendars, events]) => {
        localStorage.setItem(
          'calendar-app-calendars',
          JSON.stringify(calendars)
        );
        localStorage.setItem('calendar-app-events', JSON.stringify(events));
      },
      [CALENDARS, EVENTS] as const
    );
    await page.reload();
    await expect(page.locator('.fc')).toBeVisible();

    // The sidebar's calendar list starts collapsed.
    await page.getByRole('button', { name: 'Expand calendar list' }).click();
    await page.getByText('Team Rituals', { exact: true }).hover();
    await page
      .getByRole('button', { name: 'Options for Team Rituals' })
      .click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('menuitem', { name: 'Export as .ics' }).click(),
    ]);

    expect(download.suggestedFilename()).toMatch(
      /^cadence-team-rituals-\d{4}-\d{2}-\d{2}\.ics$/
    );
    await expect(page.getByText('Exported “Team Rituals”')).toBeVisible();

    const ics = readFileSync((await download.path())!, 'utf8');
    const lines = ics.replace(/\r\n[ \t]/g, '').split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines).toContain('X-WR-CALNAME:Team Rituals');
    expect(lines).toContain('DTSTART;TZID=America/New_York:20261005T200000');
    expect(lines).toContain('RRULE:FREQ=WEEKLY;INTERVAL=1;BYDAY=MO');
    expect(lines).toContain('EXDATE;TZID=America/New_York:20261019T200000');
    expect(lines).toContain('DTSTART;VALUE=DATE:20261007');
    expect(lines).toContain('DTEND;VALUE=DATE:20261009');
    expect(ics).not.toContain('Dentist');

    // Expand the series with an independent reader, using only the VTIMEZONE
    // the file carries: Mondays at 8pm local, Oct 19 gone, DST respected.
    const vcal = new ICAL.Component(ICAL.parse(ics));
    ICAL.TimezoneService.reset();
    for (const vtz of vcal.getAllSubcomponents('vtimezone')) {
      ICAL.TimezoneService.register(vtz);
    }
    expect(ICAL.TimezoneService.has('America/New_York')).toBe(true);
    const sync = vcal
      .getAllSubcomponents('vevent')
      .find((v) => v.getFirstPropertyValue('summary') === 'Team sync')!;
    const it = new ICAL.Event(sync).iterator();
    const first: string[] = [];
    for (let n = it.next(); n && first.length < 5; n = it.next()) {
      first.push(
        new Date(
          n.convertToZone(ICAL.Timezone.utcTimezone).toUnixTime() * 1000
        ).toISOString()
      );
    }
    expect(first).toEqual([
      '2026-10-06T00:00:00.000Z',
      '2026-10-13T00:00:00.000Z',
      '2026-10-27T00:00:00.000Z',
      '2026-11-03T01:00:00.000Z',
      '2026-11-10T01:00:00.000Z',
    ]);
  });
});
