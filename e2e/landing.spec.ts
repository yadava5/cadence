import { publicTest as test, expect } from './fixtures';
import { SHOWCASE_SENTENCES } from '../src/pages/welcomeSentences';

/**
 * Public, logged-out surfaces: the five-beat landing, its cycling ParseShowcase
 * (the reduced-motion regression), the System Card booklet, and the login page.
 *
 * The showcase sentences are IMPORTED, never retyped here. They were hardcoded
 * once and the page moved on: both cycle tests spent a session waiting 45s for
 * "Lunch with Sam tomorrow 1pm", a string that had not been in the DOM since the
 * showcase was rewritten to run the real parser. A spec that names its fixture
 * in its own words stops testing the page the moment the page changes wording —
 * and the reduced-motion test below is the only guard on a real regression, so
 * it going blind is expensive.
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

  /**
   * Both examples reaching the screen is the cycle. Under normal motion the
   * sentence types in a character at a time, so the full string only exists in
   * the DOM once typing finishes — `toBeVisible` polls, which is why the wait
   * is generous rather than a sleep.
   *
   * The chip assertion is deliberately NOT a fixture string: `high` appears
   * nowhere in "Ship the report friday p1 #work". It is what the app's parser
   * resolves `p1` to, so a chip reading "priority high" can only have come from
   * running the parser in the browser — which is the claim the showcase makes
   * about itself ("live logic · the real parser"). src/lib/__tests__/
   * showcaseParse.test.ts pins the same chip against the parser directly.
   */
  const cyclesBothExamples = async (page: import('@playwright/test').Page) => {
    await page.goto('/welcome');
    await page.getByText('So we deleted the form.').scrollIntoViewIfNeeded();
    // Only the active example is in the DOM; each becoming visible proves the cycle.
    for (const sentence of SHOWCASE_SENTENCES) {
      await expect(page.getByText(sentence, { exact: false })).toBeVisible({
        timeout: 14_000,
      });
    }
    await expect(page.getByText('priority high', { exact: true })).toBeVisible({
      timeout: 14_000,
    });
  };

  test('ParseShowcase cycles both examples (normal motion)', async ({
    page,
  }) => {
    await cyclesBothExamples(page);
  });

  test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });
    test('ParseShowcase still cycles (regression: was frozen)', async ({
      page,
    }) => {
      await cyclesBothExamples(page);
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
