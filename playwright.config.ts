import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config for Cadence.
 *
 * Target: a production `vite preview` build driven in the app's built-in
 * offline/localStorage mode (the fixture returns a non-JSON response for every
 * `/api/**` call, so the service layer's `isJson()` guard falls back to
 * localStorage — see src/services/api/*). This keeps the whole suite
 * deterministic, backend-free, and — crucially — never touches the live
 * auth endpoint's 5-requests/15-min rate limit.
 *
 * Run:  npm run test:e2e
 * Fast local iteration against an already-running preview:
 *   PW_BASE_URL=http://localhost:5266 npx playwright test
 */
const PORT = Number(process.env.PW_PORT || 4318);
const BASE_URL = process.env.PW_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }]]
    : [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    testIdAttribute: 'data-testid',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // When PW_BASE_URL is set we reuse that server; otherwise build + preview.
  webServer: process.env.PW_BASE_URL
    ? undefined
    : {
        command: `npm run build:shared && npm run build:frontend && npx vite preview --port ${PORT} --strictPort`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
      },
});
