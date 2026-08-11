import { test as base, expect, type Page } from '@playwright/test';

/**
 * A JWT session shaped exactly like the app's zustand `auth-store` persist blob
 * (src/stores/authStore.ts). The token is an ordinary opaque string: the auth
 * guard's old `accessToken === 'mock-access-token'` skip is gone from
 * production builds (it is now behind `import.meta.env.DEV`, and Playwright
 * drives a `vite preview` production build), so the session survives by
 * answering /api/auth/verify in `forceOfflineMode` instead. `expiresAt` is
 * stamped far in the future inside the init script (it must be, or
 * onRehydrateStorage clears it).
 */
export const SESSION = {
  state: {
    isAuthenticated: true,
    authMethod: 'jwt' as const,
    jwtTokens: {
      accessToken: 'e2e-access-token',
      refreshToken: 'e2e-refresh-token',
      expiresAt: 0,
    },
    user: {
      id: 'e2e-user',
      email: 'e2e@example.com',
      name: 'E2E User',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    },
    googleTokens: null,
    googleUser: null,
  },
  version: 0,
};

/**
 * Force offline/localStorage mode: every /api/** call resolves to a non-JSON
 * body, so the service layer's `isJson(res)` guard is false and it uses its
 * localStorage fallback store. No live backend, no rate limit, deterministic.
 *
 * The one exception is /api/auth/verify, which the auth guard calls on boot for
 * any JWT session: a non-JSON body makes `authAPI.verifyToken()` throw inside
 * its own try/catch and return `{ valid: false }`, which clears the session and
 * bounces the test to /login. It is answered here with the real endpoint's
 * success shape (see server-handlers/auth/verify.ts). Handled inside this one
 * matcher rather than as a second `page.route()` so nothing depends on handler
 * registration order.
 */
export async function forceOfflineMode(page: Page) {
  await page.route('**/api/**', (route) => {
    if (/\/api\/auth\/verify(\?|$)/.test(route.request().url())) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            user: {
              id: SESSION.state.user.id,
              email: SESSION.state.user.email,
              name: SESSION.state.user.name,
            },
          },
        }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'text/plain', body: '' });
  });
}

/**
 * Inject the session before any page script runs. Runs on EVERY navigation
 * (including reloads), so it only seeds when absent — this keeps app data
 * (events/tasks the test created) intact across `page.reload()`. Test isolation
 * comes from each test getting a fresh browser context, not from clearing here.
 */
export async function seedSession(page: Page) {
  await page.addInitScript((s) => {
    const session = s as typeof SESSION;
    if (!localStorage.getItem('auth-store')) {
      session.state.jwtTokens.expiresAt = Date.now() + 24 * 60 * 60 * 1000;
      localStorage.setItem('auth-store', JSON.stringify(session));
    }
  }, SESSION);
}

/**
 * `test` — an authenticated fixture. Each test gets a fresh isolated context
 * with offline mode + a seeded session, already navigated to the app shell and
 * waited until the calendar is interactive.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await forceOfflineMode(page);
    await seedSession(page);
    await page.goto('/');
    // Shell + calendar are ready (reliable wait, not a sleep).
    await expect(page.locator('[data-view]')).toBeVisible();
    await expect(page.locator('.fc')).toBeVisible();
    await use(page);
  },
});

/** `publicTest` — no session; for the logged-out landing / public surfaces. */
export const publicTest = base;

export { expect };
