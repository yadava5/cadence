/**
 * Row-Level-Security request context (AsyncLocalStorage).
 *
 * Postgres RLS policies on the tenant tables key off a per-transaction GUC
 * (`app.user_id`). The Vercel API functions do not run inside Supabase's
 * PostgREST, so nothing sets that GUC for us — we must set it ourselves, per
 * request, from the verified JWT `userId`.
 *
 * Rather than thread a `userId` through every service call site, the
 * authenticated user for the current request is carried in an
 * `AsyncLocalStorage` store. The central `query()`/`withTransaction()` wiring
 * in `database.ts` reads it and applies the GUC transaction-locally
 * (`set_config(..., true)`) so nothing leaks across the shared Supabase pooler:
 * the setting is discarded at COMMIT/ROLLBACK and never rides a physical
 * connection into the next tenant's request.
 *
 * The store is entered once, in `authenticateJWT`, wrapping the whole
 * downstream middleware chain + handler. Code paths that verify the JWT
 * themselves (e.g. the Google Calendar sync handler) enter it explicitly via
 * `runWithRls`.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RlsStore {
  /** The authenticated user id, or `null` for unauthenticated/pre-auth paths. */
  userId: string | null;
}

export const rlsStorage = new AsyncLocalStorage<RlsStore>();

/**
 * Return the RLS user id bound to the current async context, or `null` when no
 * context is active (unauthenticated request, health check, pre-auth
 * login/register).
 */
export const getRlsUserId = (): string | null =>
  rlsStorage.getStore()?.userId ?? null;

/**
 * Run `fn` with `userId` bound as the RLS identity for the current async
 * context. The store propagates through every async continuation started
 * inside `fn`, so all DB queries issued while handling the request see the
 * identity and scope to it.
 */
export const runWithRls = <T>(userId: string | null, fn: () => T): T =>
  rlsStorage.run({ userId }, fn);
