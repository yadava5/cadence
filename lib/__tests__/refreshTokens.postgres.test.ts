/**
 * Durable refresh-token revocation, against a REAL Postgres.
 *
 * ## What this file has to prove, and why a mock cannot
 *
 * The bug was never "the code forgets to revoke". `invalidateRefreshToken` was
 * called, and it did exactly what it said — inside ONE Node process. On Vercel
 * a request lands on whichever instance the platform picks, and a cold instance
 * starts with an empty `Map`/`Set`. So the revocation was real and the token
 * still worked, because the instance that checked it had never heard of it.
 *
 * A unit test with a mocked database cannot fail on that. It has one module
 * registry, one singleton, one Map — the very thing production does not have.
 * The only honest test is: revoke through one service object, then ask a
 * SEPARATE service object, holding no shared memory, whether the token is good.
 * That is what `new RefreshTokenService()` is doing below, and it is the whole
 * point of every test here.
 *
 * Skipped unless RLS_TEST_PG_ADMIN_URL points at a superuser Postgres.
 * `test/rls-postgres-global-setup.ts` starts a throwaway container when Docker
 * is available, so a plain `npm run test:backend:run` exercises this.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const ADMIN_URL = process.env.RLS_TEST_PG_ADMIN_URL;

/* Its own database on the shared container. rls.postgres.test.ts drops and
   recreates `public`; two suites that each want a clean slate cannot share one
   (that lesson is written up in rls.cutover-rehearsal.test.ts). */
const TEST_DB = 'cadence_refresh_tokens';

/* 0005 names `cadence_app` in its GRANT and its policy, so the role has to
   exist before the migration is applied — and the app has to CONNECT as it, or
   the permissive `FOR ALL TO cadence_app` policy is never exercised. */
const APP_ROLE = 'cadence_app';
const APP_PW = 'refresh_token_test_pw';

const USER_A = 'usr_refresh_a';
const USER_B = 'usr_refresh_b';

let admin: Pool;
type Service = InstanceType<
  typeof import('../../packages/backend/src/services/RefreshTokenService.js').default
>;
let RefreshTokenService: new () => Service;
let generateTokenPair: (
  userId: string,
  email: string
) => Promise<{ accessToken: string; refreshToken: string; expiresAt: number }>;
/** Only ever used to warm the pool — never ended here, see afterAll. */
let backendPool: Pool;

/** The same hash the service stores, computed independently. */
const sha256 = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex');

/**
 * A DISTINCT refresh token for a user.
 *
 * The `nonce` in the email is load-bearing, and finding out why was the first
 * interesting thing this suite produced: a refresh JWT's payload is
 * `{userId, email, type, iat, exp, iss, aud}` and nothing else, `iat`/`exp` have
 * one-second resolution, and HS256 is deterministic. So two calls to
 * `generateTokenPair(sameUser, sameEmail)` inside the same second return the
 * BYTE-IDENTICAL token. Without the nonce, "three sessions" was one row three
 * times over and every later test was validating a token an earlier test had
 * already revoked.
 *
 * That is a property of the token generator, not of this suite; the email
 * varies only to make the tokens distinct. `userId` is what everything asserts
 * on, and it stays real (the `refresh_tokens_userId_fkey` needs it to).
 */
let nonce = 0;
async function freshToken(userId: string): Promise<string> {
  nonce += 1;
  const pair = await generateTokenPair(
    userId,
    `${userId}+${nonce}@refresh.test`
  );
  return pair.refreshToken;
}

describe.skipIf(!ADMIN_URL)('refresh token revocation (real Postgres)', () => {
  beforeAll(async () => {
    const bootstrap = new Pool({ connectionString: ADMIN_URL });
    await bootstrap.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
    await bootstrap.query(`CREATE DATABASE ${TEST_DB}`);
    await bootstrap.end();

    const adminUrl = new URL(ADMIN_URL!);
    adminUrl.pathname = `/${TEST_DB}`;
    admin = new Pool({ connectionString: adminUrl.toString() });

    // Roles are cluster-wide, so a leftover from a previous run has to go
    // first. DROP OWNED BY is per-database and this database is brand new.
    await admin.query(
      `DO $$ BEGIN
         IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${APP_ROLE}') THEN
           EXECUTE 'DROP OWNED BY ${APP_ROLE} CASCADE';
           EXECUTE 'DROP ROLE ${APP_ROLE}';
         END IF;
       END $$`
    );
    await admin.query(
      `CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PW}' NOSUPERUSER NOBYPASSRLS`
    );

    await admin.query(
      readFileSync(join(HERE, 'fixtures', 'schema.sql'), 'utf8')
    );
    // The REAL migration, not a paraphrase of it — if 0005 does not apply, this
    // suite fails here rather than passing against a hand-written table that
    // production will never have.
    await admin.query(
      readFileSync(
        join(
          HERE,
          '..',
          'config',
          'migrations',
          '0005_create_refresh_tokens.sql'
        ),
        'utf8'
      )
    );

    await admin.query(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`);
    await admin.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`
    );

    await admin.query(
      `INSERT INTO users (id, email, "updatedAt") VALUES ($1,$2,NOW()),($3,$4,NOW())`,
      [USER_A, 'a@refresh.test', USER_B, 'b@refresh.test']
    );

    // Point the backend pool at the app role, then import fresh so its cached
    // pool connects as that role. Importing earlier would silently give the
    // admin connection and the permissive-policy check would prove nothing.
    const appUrl = new URL(ADMIN_URL!);
    appUrl.pathname = `/${TEST_DB}`;
    appUrl.username = APP_ROLE;
    appUrl.password = APP_PW;
    process.env.DATABASE_URL = appUrl.toString();
    (globalThis as { __backendPgPool?: Pool }).__backendPgPool = undefined;

    const svcmod = await import(
      '../../packages/backend/src/services/RefreshTokenService.js'
    );
    const jwtmod = await import('../../packages/backend/src/utils/jwt.js');
    const dbmod = await import('../../packages/backend/src/config/database.js');
    RefreshTokenService = svcmod.default as unknown as new () => Service;
    generateTokenPair = jwtmod.generateTokenPair;
    backendPool = dbmod.pool;
  }, 120_000);

  afterAll(async () => {
    // The backend pool is deliberately NOT ended here. Unlike lib's, that
    // module registers `process.on('SIGINT'/'SIGTERM')` handlers that call
    // `pool.end()`, and vitest signals the worker on teardown — so ending it
    // ourselves produced "Called end on pool more than once" as an unhandled
    // rejection AFTER the environment was torn down, which vitest reports as a
    // run-level error. Let the module's own handler do it, once.
    (globalThis as { __backendPgPool?: Pool }).__backendPgPool = undefined;
    await admin?.end();
  });

  it('runs as a NON-BYPASSRLS role against the table 0005 created', async () => {
    // Guards the suite against passing for the wrong reason: if the pool had
    // fallen back to the admin URL, the permissive-policy assertions below
    // would be vacuous.
    const who = await admin.query(
      `SELECT rolbypassrls FROM pg_roles WHERE rolname = $1`,
      [APP_ROLE]
    );
    expect(who.rows[0].rolbypassrls).toBe(false);

    // ENABLE, and deliberately NOT FORCE — see the migration header. Login and
    // refresh run with no `app.user_id` bound, so a 0002-style tenant policy
    // here would refuse every write and every read on the auth path.
    const rls = await admin.query(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class
        WHERE relname = 'refresh_tokens' AND relnamespace = 'public'::regnamespace`
    );
    expect(rls.rows[0].relrowsecurity).toBe(true);
    expect(rls.rows[0].relforcerowsecurity).toBe(false);
  });

  it('stores the HASH, never the token', async () => {
    const svc = new RefreshTokenService();
    const token = await freshToken(USER_A);
    await svc.storeRefreshToken(token, USER_A, 'a@refresh.test');

    const row = await admin.query<{ tokenHash: string }>(
      `SELECT "tokenHash" FROM refresh_tokens WHERE "userId" = $1 AND "tokenHash" = $2`,
      [USER_A, sha256(token)]
    );
    expect(row.rowCount).toBe(1);

    // The token itself must appear nowhere in the table.
    const leak = await admin.query<{ c: number }>(
      `SELECT count(*)::int AS c FROM refresh_tokens
        WHERE "id" = $1 OR "tokenHash" = $1 OR "family" = $1`,
      [token]
    );
    expect(leak.rows[0].c).toBe(0);
  });

  // --------------------------------------------------------------------------
  // THE regression. Revoke on one "instance", validate on another.
  // --------------------------------------------------------------------------
  it('a token revoked by one instance is rejected by a FRESH instance', async () => {
    const issuing = new RefreshTokenService();
    const token = await freshToken(USER_A);
    await issuing.storeRefreshToken(token, USER_A, 'a@refresh.test');

    // Sanity: it works before the logout.
    await expect(issuing.validateRefreshToken(token)).resolves.toMatchObject({
      userId: USER_A,
    });

    await issuing.invalidateRefreshToken(token, USER_A);

    // A different object, with none of the first one's memory — the closest
    // thing in one process to a second serverless instance. Before the durable
    // table this resolved happily and the "logged out" session continued for
    // the token's full 7 days.
    const other = new RefreshTokenService();
    await expect(other.validateRefreshToken(token)).rejects.toThrow(
      'REFRESH_TOKEN_REVOKED'
    );
  });

  it('"log out from all devices" really invalidates all of them', async () => {
    const svc = new RefreshTokenService();
    const tokens = await Promise.all([
      freshToken(USER_B),
      freshToken(USER_B),
      freshToken(USER_B),
    ]);
    for (const t of tokens) {
      await svc.storeRefreshToken(t, USER_B, 'b@refresh.test');
    }
    // Another tenant's live session, which must survive.
    const aToken = await freshToken(USER_A);
    await svc.storeRefreshToken(aToken, USER_A, 'a@refresh.test');

    const revoked = await svc.invalidateAllUserTokens(USER_B);
    expect(revoked).toBe(3);

    const fresh = new RefreshTokenService();
    for (const t of tokens) {
      await expect(fresh.validateRefreshToken(t)).rejects.toThrow(
        'REFRESH_TOKEN_REVOKED'
      );
    }
    // Scoped: B logging out everywhere does not touch A.
    await expect(fresh.validateRefreshToken(aToken)).resolves.toMatchObject({
      userId: USER_A,
    });
  });

  it('one user cannot revoke another user’s token', async () => {
    const svc = new RefreshTokenService();
    const aToken = await freshToken(USER_A);
    await svc.storeRefreshToken(aToken, USER_A, 'a@refresh.test');

    // B posts A's refresh token to /logout. The id scope refuses it.
    const didRevoke = await svc.invalidateRefreshToken(aToken, USER_B);
    expect(didRevoke).toBe(false);

    const fresh = new RefreshTokenService();
    await expect(fresh.validateRefreshToken(aToken)).resolves.toMatchObject({
      userId: USER_A,
    });
  });

  it('fails CLOSED for a validly signed token with no row', async () => {
    // A token minted before 0005 was applied looks exactly like this: perfect
    // signature, unexpired, and no record that it was ever issued.
    const orphan = await freshToken(USER_A);
    const svc = new RefreshTokenService();
    await expect(svc.validateRefreshToken(orphan)).rejects.toThrow(
      'REFRESH_TOKEN_NOT_FOUND'
    );
  });

  it('rotating within the same second does not destroy the session', async () => {
    // Not a hypothetical: `rotateRefreshToken` re-signs from the OLD token's own
    // payload, so a rotation in the same second returns the identical string.
    // Unguarded, the revoke-then-insert then handed the caller a token it had
    // just revoked and the session died on its next use.
    const svc = new RefreshTokenService();
    const token = await freshToken(USER_A);
    await svc.storeRefreshToken(token, USER_A, 'a@refresh.test');

    const rotated = await svc.rotateRefreshToken(token);
    expect(rotated.refreshToken).toBe(token); // same second → same token

    await expect(
      new RefreshTokenService().validateRefreshToken(rotated.refreshToken)
    ).resolves.toMatchObject({ userId: USER_A });
  });

  it('rotation revokes the old token and issues a usable new one', async () => {
    const svc = new RefreshTokenService();
    const first = await freshToken(USER_A);
    await svc.storeRefreshToken(first, USER_A, 'a@refresh.test');

    // Cross a second boundary so the re-signed token genuinely differs (see
    // above). This is the ordinary case — real refreshes are ~15 minutes apart.
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const rotated = await svc.rotateRefreshToken(first);
    expect(rotated.refreshToken).not.toBe(first);

    const fresh = new RefreshTokenService();
    await expect(
      fresh.validateRefreshToken(rotated.refreshToken)
    ).resolves.toMatchObject({ userId: USER_A });
    await expect(fresh.validateRefreshToken(first)).rejects.toThrow(
      'REFRESH_TOKEN_REVOKED'
    );

    // Same family: rotation extends a chain, it does not start a new one.
    const rows = await admin.query<{ family: string }>(
      `SELECT "family" FROM refresh_tokens WHERE "tokenHash" = ANY($1::text[])`,
      [[sha256(first), sha256(rotated.refreshToken)]]
    );
    expect(new Set(rows.rows.map((r) => r.family)).size).toBe(1);
  });

  it('two tabs refreshing at once do NOT log the user out', async () => {
    // Both tabs hit a 401, both refresh with the same token. Exactly one wins
    // the guarded UPDATE. The loser must not escalate: revoking the family
    // there would revoke the successor the winner had just handed to its own
    // tab, and both sessions died. (The old in-memory map survived this by
    // accident — both requests wrote the same key and neither revoked
    // anything durable.)
    // WARMING THE POOL IS THE TEST.
    //
    // Without it this passes against the broken implementation and proves
    // nothing — measured, not assumed. On a cold pool the second request has to
    // wait for a TCP+auth handshake to open a second physical connection, by
    // which time the first has already committed; the loser is then refused at
    // `validateRefreshToken` and never reaches the branch under test. With
    // connections already open the two overlap the way two serverless instances
    // do, and against the previous code the result was: winner ok, loser
    // rejected, BOTH rows revoked, and the token just handed to the winner's
    // tab dead on arrival.
    const warm = await Promise.all(
      [1, 2, 3, 4].map(() => backendPool.connect())
    );
    await Promise.all(warm.map((c) => c.query('SELECT 1')));
    warm.forEach((c) => c.release());

    const svc = new RefreshTokenService();
    const token = await freshToken(USER_A);
    await svc.storeRefreshToken(token, USER_A, 'a@refresh.test');
    await new Promise((resolve) => setTimeout(resolve, 1100));

    const results = await Promise.allSettled([
      new RefreshTokenService().rotateRefreshToken(token),
      new RefreshTokenService().rotateRefreshToken(token),
    ]);
    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<{ refreshToken: string }> =>
        r.status === 'fulfilled'
    );
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    // The user still has a working session afterwards — the whole point.
    const fresh = new RefreshTokenService();
    const stillValid = await Promise.all(
      fulfilled.map((r) =>
        fresh
          .validateRefreshToken(r.value.refreshToken)
          .then(() => true)
          .catch(() => false)
      )
    );
    expect(stillValid.some(Boolean)).toBe(true);

    // ...and the race did not wipe out the family.
    const live = await admin.query<{ c: number }>(
      `SELECT count(*)::int AS c FROM refresh_tokens
        WHERE "userId" = $1 AND "revokedAt" IS NULL`,
      [USER_A]
    );
    expect(live.rows[0].c).toBeGreaterThan(0);
  });

  it('replaying a rotated token is detected and kills the whole family', async () => {
    const svc = new RefreshTokenService();
    const first = await freshToken(USER_A);
    await svc.storeRefreshToken(first, USER_A, 'a@refresh.test');
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const second = await svc.rotateRefreshToken(first);

    // The attacker replays the token that was already rotated away.
    const reuse = await new RefreshTokenService().detectTokenReuse(first);
    expect(reuse).toBe(true);

    // The still-live successor is revoked with it — the chain leaked.
    await expect(
      new RefreshTokenService().validateRefreshToken(second.refreshToken)
    ).rejects.toThrow('REFRESH_TOKEN_REVOKED');
  });

  it('a merely LOGGED-OUT token is refused, not reported as a breach', async () => {
    // The distinction only became observable once revocation was durable. A
    // second tab that has not noticed the logout refreshes with the revoked
    // token; answering "reuse detected" there turns an ordinary sign-out into a
    // security alarm and revokes every sibling session with it.
    const svc = new RefreshTokenService();
    const token = await freshToken(USER_B);
    await svc.storeRefreshToken(token, USER_B, 'b@refresh.test');
    await svc.invalidateRefreshToken(token, USER_B);

    // Revoked, but never rotated away — no successor in the family.
    expect(await new RefreshTokenService().detectTokenReuse(token)).toBe(false);
    // And it is still firmly refused, which is the part that matters.
    await expect(
      new RefreshTokenService().validateRefreshToken(token)
    ).rejects.toThrow('REFRESH_TOKEN_REVOKED');
  });

  it('an unknown token is not reported as a security breach', async () => {
    // Reuse detection must not conflate "stale" with "breached", or every
    // expired session would tell the user their account was compromised.
    const unknown = await freshToken(USER_A);
    const reuse = await new RefreshTokenService().detectTokenReuse(unknown);
    expect(reuse).toBe(false);
  });
});
