/**
 * The identity of the shared public demo account, in one place.
 *
 * WHY THIS IS A MODULE AND NOT A LITERAL IN EACH HANDLER
 *
 * The demo credentials are published on purpose: the landing page prints them,
 * and `/login` has a one click "Sign in as the demo account" button. That makes
 * the demo user a real account that any visitor can hold a valid token for, so
 * every server side rule about it has to be enforced identically everywhere.
 *
 * The address used to be a bare literal in `server-handlers/demo/reanchor.ts`.
 * A second copy in the account handler would be a second place to forget: the
 * re-anchor cron would keep the demo week current while the delete endpoint
 * cheerfully removed the row it re-anchors, and nothing would connect the two.
 * One constant, two importers, one thing to change.
 *
 * `isDemoEmail` lower cases and trims because the value it is fed comes from a
 * database column, not from this file. `users.email` is plain `TEXT` with a
 * unique index (lib/__tests__/fixtures/schema.sql), so nothing in the schema
 * forces a canonical case, while login matches with
 * `WHERE LOWER(email) = LOWER($1)` (AuthService.loginUser). A row written as
 * `John@Example.COM` therefore signs in perfectly well as the demo user and
 * would walk straight past a case sensitive `===`. Of the two ends of that
 * pair the guard has to be the loose one: being stricter than the identity it
 * tests is the fail open direction, and this is the account that cannot afford
 * it.
 */

/** The shared public demo account, the same address the landing page prints. */
export const DEMO_EMAIL = 'john@example.com';

/** True when `email` identifies the shared public demo account. */
export function isDemoEmail(email: string | null | undefined): boolean {
  return typeof email === 'string' && email.trim().toLowerCase() === DEMO_EMAIL;
}
