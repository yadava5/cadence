import { publicTest as test, expect } from './fixtures';

/**
 * Public, logged-out surfaces: the five-beat landing, its cycling ParseShowcase
 * (the reduced-motion regression), the System Card booklet, and the login page.
 */
test.describe('landing', () => {
  test('renders the five-beat narrative', async ({ page }) => {
    await page.goto('/welcome');
    await expect(
      page.getByRole('heading', { name: 'The form is the friction.' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'So we deleted the form.' })
    ).toBeVisible();
    for (const beat of [
      'the problem',
      'the solution',
      'under the hood',
      'the receipts',
      'try it',
    ]) {
      await expect(
        page.getByText(beat, { exact: false }).first()
      ).toBeVisible();
    }
  });

  test('ParseShowcase cycles both examples (normal motion)', async ({
    page,
  }) => {
    await page.goto('/welcome');
    await page.getByText('So we deleted the form.').scrollIntoViewIfNeeded();
    // Only the active example is in the DOM; each becoming visible proves the cycle.
    await expect(
      page.getByText('Lunch with Sam tomorrow 1pm', { exact: false })
    ).toBeVisible({ timeout: 14_000 });
    await expect(
      page.getByText('Ship the report by Friday', { exact: false })
    ).toBeVisible({ timeout: 14_000 });
  });

  test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });
    test('ParseShowcase still cycles (regression: was frozen)', async ({
      page,
    }) => {
      await page.goto('/welcome');
      await page.getByText('So we deleted the form.').scrollIntoViewIfNeeded();
      await expect(
        page.getByText('Lunch with Sam tomorrow 1pm', { exact: false })
      ).toBeVisible({ timeout: 14_000 });
      await expect(
        page.getByText('Ship the report by Friday', { exact: false })
      ).toBeVisible({ timeout: 14_000 });
    });
  });

  test('System Card booklet is served', async ({ page }) => {
    const res = await page.goto('/system-card/');
    expect(res?.status()).toBeLessThan(400);
    await expect(page).toHaveTitle(/System Card/i);
  });

  test('login page renders its form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Login', exact: true })
    ).toBeVisible();
  });
});
