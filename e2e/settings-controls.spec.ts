import { test, expect } from './fixtures';

async function openSettings(page: import('@playwright/test').Page) {
  await page.keyboard.press('ControlOrMeta+Comma');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('settings controls (persist + real effect)', () => {
  test('Default View persists and boots the app into it', async ({ page }) => {
    const dialog = await openSettings(page);
    await dialog.locator('#default-view').click();
    await page.getByRole('option', { name: 'Task View' }).click();
    await page.keyboard.press('Escape');

    await page.reload();
    // The app now boots into the task view.
    await expect(page.locator('[data-view="task"]')).toBeVisible();
    const stored = await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('settings-store') || '{}').state
          ?.defaultView
    );
    expect(stored).toBe('tasks');
  });

  test('Keyboard Shortcuts toggle enables/disables ⌘K', async ({ page }) => {
    const dialog = await openSettings(page);
    // Turn shortcuts OFF.
    await dialog.locator('#keyboard-shortcuts').click();
    // ⌘K no longer opens the palette.
    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.locator('[cmdk-input]')).toHaveCount(0);

    // Turn shortcuts back ON, close settings, ⌘K works again.
    await dialog.locator('#keyboard-shortcuts').click();
    await page.keyboard.press('Escape');
    await page.keyboard.press('ControlOrMeta+k');
    await expect(page.locator('[cmdk-input]')).toBeVisible();
  });

  test('Auto-save restores an unsaved event draft after reload', async ({
    page,
  }) => {
    const draft = `Draft Event ${Date.now()}`;
    await page.getByRole('button', { name: 'New Event' }).click();
    await expect(page.locator('#event-title')).toBeVisible();
    await page.locator('#event-title').fill(draft);
    // Let the debounced draft persist land.
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem('taskflow:event-draft'))
      )
      .toContain(draft);

    // Reload with the dialog closed — the draft should come back on reopen.
    await page.reload();
    await expect(page.locator('.fc')).toBeVisible();
    await page.getByRole('button', { name: 'New Event' }).click();
    await expect(page.locator('#event-title')).toHaveValue(draft);
  });

  test('Notifications toggle requests permission and persists', async ({
    page,
  }) => {
    await page.context().grantPermissions(['notifications']);
    const dialog = await openSettings(page);
    await dialog.locator('#notifications').click();
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem('settings-store') || '{}').state
              ?.desktopNotifications
        )
      )
      .toBe(true);
  });

  test('Export downloads a JSON file (and events as .ics)', async ({
    page,
  }) => {
    // Ensure there is at least one event so the .ics export has content.
    await page.getByRole('button', { name: 'New Event' }).click();
    await page.locator('#event-title').fill(`Export Me ${Date.now()}`);
    await page.getByRole('button', { name: 'Create Event' }).click();
    await expect(page.locator('#event-title')).toBeHidden();

    const dialog = await openSettings(page);

    const [jsonDownload] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('button', { name: 'Export JSON' }).click(),
    ]);
    expect(jsonDownload.suggestedFilename()).toMatch(
      /^cadence-export-.*\.json$/
    );

    const [icsDownload] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('button', { name: '.ics' }).click(),
    ]);
    expect(icsDownload.suggestedFilename()).toMatch(/^cadence-events-.*\.ics$/);
  });
});
