import { readFileSync } from 'node:fs';

import AxeBuilder from '@axe-core/playwright';
import ICAL from 'ical.js';
import type { Page } from '@playwright/test';

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

async function seed(page: Page): Promise<void> {
  await page.evaluate(
    ([calendars, events]) => {
      localStorage.setItem('calendar-app-calendars', JSON.stringify(calendars));
      localStorage.setItem('calendar-app-events', JSON.stringify(events));
    },
    [CALENDARS, EVENTS] as const
  );
  await page.reload();
  await expect(page.locator('.fc')).toBeVisible();
}

/** Press Tab until `target` has focus; fail if it never does. */
async function tabTo(
  page: Page,
  target: ReturnType<Page['getByRole']>,
  max: number
): Promise<void> {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((el) => el === document.activeElement)) return;
  }
  throw new Error(`Tab never reached ${target} in ${max} presses`);
}

/** axe violations inside `selector`, as readable one-liners. */
async function axeViolations(page: Page, selector: string): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page })
    .include(selector)
    .analyze();
  return violations.flatMap((v) =>
    v.nodes.map((n) => `${v.id}: ${n.failureSummary} — ${n.html}`)
  );
}

test.describe('export a calendar to .ics', () => {
  test('the calendar menu downloads that calendar, recurrence and exception intact', async ({
    page,
  }) => {
    await seed(page);

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

  test('keyboard only: reach the menu, export, get focus back; menu and toast pass axe', async ({
    page,
  }) => {
    await seed(page);
    const expand = page.getByRole('button', { name: 'Expand calendar list' });
    const trigger = page.getByRole('button', {
      name: 'Options for Team Rituals',
    });
    const exportItem = page.getByRole('menuitem', { name: 'Export as .ics' });

    // From the top of the page, with nothing but the keyboard.
    await page.locator('body').focus();
    await tabTo(page, expand, 60);
    await page.keyboard.press('Enter');
    await tabTo(page, trigger, 10);

    // The trigger only shows on hover; a keyboard user must see it too.
    // Effective opacity: the product over every ancestor, since any one of
    // them can be the element that hides it.
    await expect
      .poll(() =>
        trigger.evaluate((el) => {
          let opacity = 1;
          for (let n: Element | null = el; n; n = n.parentElement) {
            opacity *= Number(getComputedStyle(n).opacity);
          }
          return opacity;
        })
      )
      .toBe(1);
    await expect(trigger).toBeVisible();

    // Enter opens the menu and puts focus inside it, named for its calendar.
    await page.keyboard.press('Enter');
    const menu = page.getByRole('menu', { name: 'Options for Team Rituals' });
    await expect(menu).toBeVisible();
    await expect(page.getByRole('menuitem').first()).toBeFocused();
    expect(await axeViolations(page, '[role="menu"]')).toEqual([]);

    for (let i = 0; i < 6; i++) {
      if (await exportItem.evaluate((el) => el === document.activeElement)) {
        break;
      }
      await page.keyboard.press('ArrowDown');
    }
    await expect(exportItem).toBeFocused();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.keyboard.press('Enter'),
    ]);
    expect(download.suggestedFilename()).toMatch(/^cadence-team-rituals-/);

    // The menu closes and focus goes back where it came from, not to <body>.
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();

    // The result is announced: the toast lands in a polite live region.
    const live = page.locator('section[aria-live="polite"]');
    await expect(live).toContainText('Exported “Team Rituals”');
    // Scan once the toast has finished fading in: mid-animation its text is
    // blended with the background and the contrast reading is meaningless.
    await expect
      .poll(() =>
        page
          .locator('[data-sonner-toast]')
          .first()
          .evaluate((el) => getComputedStyle(el).opacity)
      )
      .toBe('1');
    expect(await axeViolations(page, '[data-sonner-toaster]')).toEqual([]);

    // Space opens it too, and Escape hands focus back to the trigger.
    await page.keyboard.press('Space');
    await expect(menu).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});
