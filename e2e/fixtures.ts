import { test as base, expect, type Page } from '@playwright/test';

/**
 * A JWT session shaped exactly like the app's zustand `auth-store` persist blob
 * (src/stores/authStore.ts). `accessToken: 'mock-access-token'` makes the auth
 * guard (src/hooks/useAuthGuard.ts) skip its /api/auth/verify round-trip, so the
 * app boots authenticated with no backend. `expiresAt` is stamped far in the
 * future inside the init script (it must be, or onRehydrateStorage clears it).
 */
export const SESSION = {
  state: {
    isAuthenticated: true,
    authMethod: 'jwt' as const,
    jwtTokens: {
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
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
 */
export async function forceOfflineMode(page: Page) {
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: '' })
  );
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
