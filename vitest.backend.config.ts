/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '~': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: [
      'api/**/*.test.ts',
      'lib/**/*.test.ts',
      'server-handlers/**/*.test.ts',
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'src/**', // Frontend tests use separate config
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['api/**/*.ts', 'lib/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', 'node_modules/**', 'dist/**'],
    },
    setupFiles: ['./test/backend-setup.ts'],
    /*
     * Resolves a Postgres for the RLS enforcement suite before collection.
     *
     * `rls.postgres.test.ts` guards itself with `describe.skipIf(!ADMIN_URL)`,
     * which is evaluated when the file is COLLECTED — too early for any
     * `beforeAll` to have started a container. A global setup is the only hook
     * that runs soon enough.
     *
     * The effect is that a bare `npm run test:backend:run` no longer reports
     * eleven silent skips on the one suite proving database-level tenant
     * isolation. CI is unaffected: an explicit RLS_TEST_PG_ADMIN_URL always
     * takes precedence, and the anti-vacuity guard still fails the build if the
     * suite reports zero tests or any skip.
     */
    globalSetup: ['./test/rls-postgres-global-setup.ts'],
  },
});
