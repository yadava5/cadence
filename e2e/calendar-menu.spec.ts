import { test, expect } from './fixtures';
import type { Locator, Page } from '@playwright/test';

/**
 * The options menu on each sidebar calendar. Offline mode seeds "Personal" in
 * #3B82F6 (Blue) and "Work" in #EF4444 (Red), so every colour assertion
 * starts from a known, different value.
 */

const BLUE = 'rgb(59, 130, 246)';
const RED = 'rgb(239, 68, 68)';

async function calendarColor(page: Page, name: string) {
  return page.evaluate((calendarName) => {
    const calendars = JSON.parse(
      localStorage.getItem('calendar-app-calendars') || '[]'
    ) as Array<{ name: string; color: string }>;
    return calendars.find((c) => c.name === calendarName)?.color.toLowerCase();
  }, name);
}

/**
 * Press a key and wait for focus to land. Menu roving focus moves on a timer,
 * so a second key pressed straight after the first is handled from the old
 * item.
 */
async function pressTo(page: Page, key: string, target: Locator) {
  await page.keyboard.press(key);
  await expect(target).toBeFocused();
}

/** Expand the list, then Tab from the visibility checkbox to the options button. */
async function tabToOptions(page: Page) {
  await page.getByRole('button', { name: 'Expand calendar list' }).click();
  const checkbox = page.getByRole('checkbox', {
    name: 'Toggle Personal visibility',
  });
  await expect(checkbox).toHaveCSS('border-color', BLUE);
  await checkbox.focus();
  const options = page.getByRole('button', { name: 'Options for Personal' });
  await pressTo(page, 'Tab', options);
  // The button sits in a hover-revealed wrapper; focus must reveal it too.
  await expect(options.locator('..')).toHaveCSS('opacity', '1');
  return { checkbox, options };
}

const item = (page: Page, name: string) => page.getByRole('menuitem', { name });
const swatch = (page: Page, name: string) =>
  page.getByRole('menuitemradio', { name });

test.describe('sidebar calendar options menu', () => {
  test('Settings opens the calendar section and hands focus back', async ({
    page,
  }) => {
    const { options } = await tabToOptions(page);
    await pressTo(page, 'Enter', item(page, 'Settings'));
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole('heading', { name: 'Calendar', exact: true })
    ).toBeVisible();
    await expect(dialog.getByText('Calendar Time Range')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(options).toBeFocused();
  });

  test('a preset colour is reachable with arrows and applied with Enter', async ({
    page,
  }) => {
    const { checkbox, options } = await tabToOptions(page);
    await pressTo(page, 'Enter', item(page, 'Settings'));
    await pressTo(page, 'ArrowDown', item(page, 'Edit'));
    await pressTo(page, 'ArrowDown', item(page, 'Color'));

    // Enter opens the swatches instead of closing the menu.
    await pressTo(page, 'Enter', swatch(page, 'Blue'));
    await expect(swatch(page, 'Blue')).toHaveAttribute('aria-checked', 'true');
    await pressTo(page, 'ArrowDown', swatch(page, 'Red'));
    await pressTo(page, 'ArrowDown', swatch(page, 'Green'));
    await page.keyboard.press('Enter');

    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(checkbox).toHaveCSS('border-color', 'rgb(16, 185, 129)');
    await expect.poll(() => calendarColor(page, 'Personal')).toBe('#10b981');
    await expect(options).toBeFocused();
  });

  test('a custom hex colour can be entered from the keyboard', async ({
    page,
  }) => {
    const { checkbox, options } = await tabToOptions(page);
    await pressTo(page, 'Enter', item(page, 'Settings'));
    await pressTo(page, 'ArrowDown', item(page, 'Edit'));
    await pressTo(page, 'ArrowDown', item(page, 'Color'));
    await pressTo(page, 'ArrowRight', swatch(page, 'Blue'));
    await pressTo(page, 'End', item(page, 'Custom…'));

    // The menu closes and the picker opens with focus in its hex field.
    const hex = page.getByRole('textbox', { name: 'Hex color' });
    await pressTo(page, 'Enter', hex);
    await expect(page.getByRole('menu')).toHaveCount(0);
    await page.keyboard.type('#123456');
    await page.keyboard.press('Enter');

    await expect(hex).toHaveCount(0);
    await expect(checkbox).toHaveCSS('border-color', 'rgb(18, 52, 86)');
    await expect.poll(() => calendarColor(page, 'Personal')).toBe('#123456');
    await expect(options).toBeFocused();
  });

  test('a preset colour can be clicked with the mouse', async ({ page }) => {
    await page.getByRole('button', { name: 'Expand calendar list' }).click();
    const checkbox = page.getByRole('checkbox', {
      name: 'Toggle Work visibility',
    });
    await expect(checkbox).toHaveCSS('border-color', RED);

    await page.getByRole('button', { name: 'Options for Work' }).click();
    await item(page, 'Color').hover();
    const purple = swatch(page, 'Purple');
    await expect(purple).toBeVisible();
    await purple.evaluate((el) =>
      Promise.all(
        (el.closest('[role=menu]')?.getAnimations() ?? []).map(
          (a) => a.finished
        )
      )
    );

    // Click where the user sees it. locator.click() would first scroll the
    // swatch into view, and scrollIntoView scrolls even an overflow:hidden
    // parent, which once hid a submenu clipped by the parent menu.
    const box = await purple.boundingBox();
    const centre = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
    const underPointer = await page.evaluate(
      ({ x, y }) =>
        document
          .elementFromPoint(x, y)
          ?.closest('[role=menuitemradio]')
          ?.textContent?.trim() ?? null,
      centre
    );
    expect(underPointer, 'the swatch under the pointer').toBe('Purple');
    await page.mouse.click(centre.x, centre.y);

    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(checkbox).toHaveCSS('border-color', 'rgb(139, 92, 246)');
    await expect.poll(() => calendarColor(page, 'Work')).toBe('#8b5cf6');
  });
});
