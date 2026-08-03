/**
 * Give the RLS enforcement suite a database instead of waiting to be handed one.
 *
 * WHY THIS EXISTS
 * ---------------
 * `lib/__tests__/rls.postgres.test.ts` guards itself with
 * `describe.skipIf(!ADMIN_URL)`, and that check runs at COLLECTION time — long
 * before any `beforeAll` could start a container. So the only place to resolve a
 * database early enough is a global setup.
 *
 * Without it, the local default was 11 silent skips on the one suite that proves
 * tenant isolation is enforced by Postgres rather than by handler code that
 * could forget a WHERE clause. A skip is green, so nothing ever complained.
 *
 * Order of preference:
 *
 *   1. An explicit `RLS_TEST_PG_ADMIN_URL` always wins. CI sets it against its
 *      own `postgres:16` service and that path is untouched.
 *   2. Otherwise, if Docker is available, start a throwaway `postgres:16`.
 *   3. If neither, do nothing — the suite skips, and the reason is now "this
 *      machine cannot run Postgres" rather than "nobody exported a variable".
 *
 * The container is stopped in the returned teardown, so a local run leaves
 * nothing behind.
 */
import type { GlobalSetupContext } from 'vitest/node';

let container: { stop: () => Promise<unknown> } | undefined;

export default async function setup({ provide }: GlobalSetupContext) {
  if (process.env.RLS_TEST_PG_ADMIN_URL) {
    provide('rlsAdminUrl', process.env.RLS_TEST_PG_ADMIN_URL);
    return;
  }

  let PostgreSqlContainer: typeof import('@testcontainers/postgresql').PostgreSqlContainer;
  try {
    ({ PostgreSqlContainer } = await import('@testcontainers/postgresql'));
  } catch {
    // The optional dev dependency is absent; leave the suite to skip.
    return;
  }

  try {
    const started = await new PostgreSqlContainer('postgres:16').start();
    container = started;
    const url = started.getConnectionUri();
    // Workers read this from the environment at collection time.
    process.env.RLS_TEST_PG_ADMIN_URL = url;
    provide('rlsAdminUrl', url);
  } catch {
    // No Docker daemon, or it refused. The suite skips and says so.
  }
}

export async function teardown() {
  await container?.stop();
}
