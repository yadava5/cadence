import { createHash, randomUUID } from 'node:crypto';

import { query, withTransaction } from '../config/database.js';
import { generateTokenPair, verifyToken, TokenPair } from '../utils/jwt.js';
import { tokenBlacklistService } from './TokenBlacklistService.js';

/**
 * Refresh-token issuance, rotation and REVOCATION, backed by Postgres.
 *
 * ## Why this is not a Map any more
 *
 * It used to keep `validRefreshTokens` in a per-process `Map` and lean on
 * `TokenBlacklistService`'s per-process `Set`. On Vercel there is no "the"
 * process: a request lands on whichever instance the platform picks, and a cold
 * one starts with both structures empty. Every revocation therefore applied to
 * exactly one instance:
 *
 *   - `POST /api/auth/logout` blacklisted the token in the instance that served
 *     it. The next refresh, on any other instance, saw an empty Set, verified
 *     the JWT's signature and expiry, and issued a fresh session. A "logged
 *     out" refresh token kept working for its full 7 days.
 *   - `logoutAll` iterated a Map that is empty on a cold instance, invalidated
 *     nothing, and the handler still answered "Logged out from all devices".
 *   - Reuse detection could only notice reuse that happened to land on the same
 *     warm instance as the rotation that preceded it.
 *
 * A row in `public.refresh_tokens` (migration 0005) is the same fact on every
 * instance, so all three now mean what they say.
 *
 * ## Fail closed
 *
 * `validateRefreshToken` requires a live row. No row — never issued, already
 * rotated away, swept after expiry, or issued before 0005 was applied — is a
 * refusal, not a shrug. The previous comment here argued the opposite ("its
 * cryptographic validity ... is a sound, stateless source of truth"), and it
 * was right only because the store was per-instance and could not be consulted
 * meaningfully. With a durable store, requiring the hit is the entire fix.
 *
 * ## The token is never stored
 *
 * Only `sha256(token)` in hex. A dump of the table cannot be replayed, because
 * every lookup hashes the presented token and compares hashes.
 *
 * ## The in-memory blacklist is kept, deliberately
 *
 * `tokenBlacklistService` still gets every revoked token. It is no longer
 * load-bearing — the database is — but the legacy Express middleware
 * (`packages/backend/src/middleware/auth.ts`) still consults it, and on a warm
 * instance it short-circuits a revoked token without a round trip.
 */
class RefreshTokenService {
  /**
   * SHA-256, hex. The only form of a refresh token this service persists.
   */
  private hashToken(refreshToken: string): string {
    return createHash('sha256').update(refreshToken, 'utf8').digest('hex');
  }

  /**
   * Unique token family identifier. A family is one rotation chain: login
   * issues the root, each refresh extends it. Reuse of any member revokes all
   * of them.
   */
  private generateTokenFamily(): string {
    return `family_${Date.now()}_${randomUUID().slice(0, 8)}`;
  }

  /**
   * Expiry of the refresh token itself, in epoch ms, taken from its own `exp`
   * claim so the row and the JWT can never disagree. Falls back to the 7-day
   * default only if the claim is unreadable — it never should be, the token was
   * signed moments ago.
   */
  private expiryMs(refreshToken: string): number {
    const parts = refreshToken.split('.');
    if (parts.length === 3) {
      try {
        const payload = JSON.parse(
          Buffer.from(parts[1], 'base64url').toString('utf8')
        ) as { exp?: number };
        if (typeof payload.exp === 'number') return payload.exp * 1000;
      } catch {
        // fall through to the default below
      }
    }
    return Date.now() + 7 * 24 * 60 * 60 * 1000;
  }

  /**
   * Record a newly issued refresh token. Callers MUST await this: if the row is
   * not committed the token cannot be validated later, because validation now
   * requires it.
   *
   * `email` is accepted for call-site compatibility and deliberately not
   * persisted — it is carried by the JWT, and a second copy in this table would
   * be one more place to go stale when a user changes address.
   */
  async storeRefreshToken(
    refreshToken: string,
    userId: string,
    email: string,
    family?: string
  ): Promise<string> {
    const tokenFamily = family || this.generateTokenFamily();
    await query(
      `INSERT INTO refresh_tokens ("id", "tokenHash", "userId", "family", "issuedAt", "expiresAt")
       VALUES ($1, $2, $3, $4, NOW() AT TIME ZONE 'UTC', to_timestamp($5 / 1000.0) AT TIME ZONE 'UTC')
       ON CONFLICT ("tokenHash") DO NOTHING`,
      [
        randomUUID(),
        this.hashToken(refreshToken),
        userId,
        tokenFamily,
        this.expiryMs(refreshToken),
      ]
    );
    return tokenFamily;
  }

  /**
   * Validate a refresh token: signature and expiry from the JWT, revocation and
   * existence from the database.
   *
   * Signature is checked FIRST so a garbage string never reaches Postgres.
   */
  async validateRefreshToken(refreshToken: string): Promise<{
    userId: string;
    email: string;
    family: string;
  }> {
    // Warm-instance fast path. Never authoritative — the DB check below is.
    if (tokenBlacklistService.isTokenBlacklisted(refreshToken)) {
      throw new Error('REFRESH_TOKEN_REVOKED');
    }

    const decoded = await verifyToken(refreshToken); // signature + exp
    if (decoded.type !== 'refresh') {
      throw new Error('INVALID_TOKEN_TYPE');
    }

    const res = await query<{
      userId: string;
      family: string;
      revoked: boolean;
      expired: boolean;
    }>(
      `SELECT "userId",
              "family",
              ("revokedAt" IS NOT NULL) AS revoked,
              ("expiresAt" <= (NOW() AT TIME ZONE 'UTC')) AS expired
         FROM refresh_tokens
        WHERE "tokenHash" = $1
        LIMIT 1`,
      [this.hashToken(refreshToken)]
    );

    const row = res.rows[0];
    if (!row) {
      // Never issued, already rotated and swept, or minted before 0005 landed.
      throw new Error('REFRESH_TOKEN_NOT_FOUND');
    }
    if (row.revoked) {
      throw new Error('REFRESH_TOKEN_REVOKED');
    }
    if (row.expired) {
      throw new Error('TOKEN_EXPIRED');
    }
    if (row.userId !== decoded.userId) {
      throw new Error('TOKEN_USER_MISMATCH');
    }

    return {
      userId: decoded.userId,
      email: decoded.email,
      family: row.family,
    };
  }

  /**
   * Rotate: revoke the presented token and issue a new pair in its family.
   *
   * The revoke and the insert are ONE transaction. As two statements a failure
   * between them leaves either two live tokens in the chain or none.
   *
   * The revoke is guarded by `"revokedAt" IS NULL` and its row count checked,
   * so two requests presenting the same token race and exactly one wins. What
   * the LOSER gets is the subtle part — see below.
   */
  async rotateRefreshToken(oldRefreshToken: string): Promise<TokenPair> {
    const tokenInfo = await this.validateRefreshToken(oldRefreshToken);

    const newTokenPair = await generateTokenPair(
      tokenInfo.userId,
      tokenInfo.email
    );

    // A refresh JWT's payload is `{userId, email, type, iat, exp, iss, aud}`,
    // `iat`/`exp` have one-second resolution, and HS256 is deterministic — so a
    // rotation that happens in the same second as the token it is rotating
    // produces the BYTE-IDENTICAL string. Without this guard that case was
    // fatal: the UPDATE revokes the row, the INSERT hits
    // `ON CONFLICT ("tokenHash") DO NOTHING` because the hash is the same row,
    // and the caller is handed a token that has just been revoked — a session
    // that dies on its next use. Rotating a token to itself is a no-op, so say
    // so and leave the live row alone.
    //
    // The real fix is a unique `jti` claim in `utils/jwt.ts` so tokens are
    // never equal; that is outside this change and is written up in the report.
    if (newTokenPair.refreshToken === oldRefreshToken) {
      return newTokenPair;
    }

    const rotated = await withTransaction(async (client) => {
      const revoked = await client.query(
        `UPDATE refresh_tokens
            SET "revokedAt" = NOW() AT TIME ZONE 'UTC'
          WHERE "tokenHash" = $1 AND "revokedAt" IS NULL`,
        [this.hashToken(oldRefreshToken)]
      );
      if ((revoked.rowCount ?? 0) === 0) {
        return false;
      }
      await client.query(
        `INSERT INTO refresh_tokens ("id", "tokenHash", "userId", "family", "issuedAt", "expiresAt")
         VALUES ($1, $2, $3, $4, NOW() AT TIME ZONE 'UTC', to_timestamp($5 / 1000.0) AT TIME ZONE 'UTC')
         ON CONFLICT ("tokenHash") DO NOTHING`,
        [
          randomUUID(),
          this.hashToken(newTokenPair.refreshToken),
          tokenInfo.userId,
          tokenInfo.family,
          this.expiryMs(newTokenPair.refreshToken),
        ]
      );
      return true;
    });

    if (!rotated) {
      // The token was live when we validated it and revoked before our UPDATE:
      // a concurrent rotation of the SAME token. Two tabs both get a 401 and
      // both refresh — routine, not an attack.
      //
      // This must NOT escalate to family revocation, and getting that wrong
      // logs the user out of everything. The loser would revoke every live row
      // in the family, INCLUDING the successor the winner just handed to its
      // own tab, so a plain double-refresh killed both sessions. The old
      // in-memory map made this work by accident: both requests wrote the same
      // key and neither invalidated anything durable.
      //
      // Nor is it the place to detect replay. `detectTokenReuse` already runs
      // before this method in every caller (server-handlers/auth/refresh.ts,
      // packages/backend/src/routes/auth.ts, scripts/dev-server.ts), and a
      // genuinely replayed token is refused by `validateRefreshToken` above
      // before it can reach here at all. This branch is concurrency, only.
      //
      // If the winner's successor is the token we just generated — which it is
      // whenever both rotations land in the same second, since the payload and
      // therefore the signature are identical — then our caller's token is
      // live and we can simply hand it back. Both tabs keep working.
      const survivor = await query<{ ok: boolean }>(
        `SELECT true AS ok FROM refresh_tokens
          WHERE "tokenHash" = $1
            AND "revokedAt" IS NULL
            AND "expiresAt" > (NOW() AT TIME ZONE 'UTC')
          LIMIT 1`,
        [this.hashToken(newTokenPair.refreshToken)]
      );
      if (survivor.rows[0]?.ok) {
        return newTokenPair;
      }
      // Otherwise the winner issued a different token that we cannot know.
      // Refuse; the client re-authenticates. Handing back a token with no row
      // would fail closed on its very next use, which is worse.
      throw new Error('REFRESH_TOKEN_REVOKED');
    }

    tokenBlacklistService.blacklistToken(oldRefreshToken);
    return newTokenPair;
  }

  /**
   * Revoke one refresh token.
   *
   * `userId`, when given, is required to match. Logout passes the caller's own
   * id, so one authenticated user cannot revoke another user's session by
   * posting a token they happened to obtain.
   *
   * Returns whether a live row was actually revoked, so a caller can tell "done"
   * from "there was nothing to do" instead of assuming.
   */
  async invalidateRefreshToken(
    refreshToken: string,
    userId?: string
  ): Promise<boolean> {
    const params: unknown[] = [this.hashToken(refreshToken)];
    let scope = '';
    if (userId) {
      params.push(userId);
      scope = ` AND "userId" = $${params.length}`;
    }
    const res = await query(
      `UPDATE refresh_tokens
          SET "revokedAt" = NOW() AT TIME ZONE 'UTC'
        WHERE "tokenHash" = $1 AND "revokedAt" IS NULL${scope}`,
      params
    );
    const revoked = (res.rowCount ?? 0) > 0;

    // ONLY mirror a revocation that actually happened. Blacklisting
    // unconditionally handed back the denial-of-service the `userId` scope above
    // exists to prevent: posting someone else's refresh token to /logout was
    // correctly refused by the database, and then poisoned this instance's
    // in-memory set anyway, so the victim's next refresh that landed here was
    // rejected. The scope has to hold in both layers or it holds in neither.
    if (revoked) {
      tokenBlacklistService.blacklistToken(refreshToken);
    }
    return revoked;
  }

  /**
   * Revoke every live refresh token for a user — "log out from all devices",
   * and the token half of account deletion.
   *
   * This is the method that previously did nothing at all on a cold instance
   * while the handler reported success.
   */
  async invalidateAllUserTokens(userId: string): Promise<number> {
    const res = await query(
      `UPDATE refresh_tokens
          SET "revokedAt" = NOW() AT TIME ZONE 'UTC'
        WHERE "userId" = $1 AND "revokedAt" IS NULL`,
      [userId]
    );
    return res.rowCount ?? 0;
  }

  /**
   * Revoke a whole rotation chain (reuse detected). Scoped by `userId` when the
   * caller knows it, so a guessed family id cannot reach another user's chain.
   */
  async invalidateTokenFamily(
    family: string,
    userId?: string
  ): Promise<number> {
    const params: unknown[] = [family];
    let scope = '';
    if (userId) {
      params.push(userId);
      scope = ` AND "userId" = $${params.length}`;
    }
    const res = await query(
      `UPDATE refresh_tokens
          SET "revokedAt" = NOW() AT TIME ZONE 'UTC'
        WHERE "family" = $1 AND "revokedAt" IS NULL${scope}`,
      params
    );
    return res.rowCount ?? 0;
  }

  /**
   * Reuse detection: a token that was ROTATED AWAY is being replayed, which
   * means the chain leaked. Revoke the whole family.
   *
   * ## "Revoked" is not the same as "reused", and the difference matters
   *
   * The tempting rule is "revoked row + someone presenting it = reuse". It is
   * wrong, and it only became visible once revocation was durable: with the old
   * per-instance Set this branch almost never fired, so nobody saw what it does
   * when it does. Logout revokes a token. A second browser tab that has not
   * noticed yet then refreshes, presents that token, and under the naive rule
   * the API answers "Refresh token reuse detected. All tokens have been
   * invalidated for security." for an ordinary sign-out — and takes every other
   * session in that family down with it.
   *
   * So the test is whether the token has a SUCCESSOR: a later row in the same
   * family. A family only grows by rotation, so a successor exists exactly when
   * this token was rotated away and something replayed it anyway. Logout and
   * logout-all revoke without issuing anything, leave no successor, and are
   * correctly refused by `validateRefreshToken` with REFRESH_TOKEN_REVOKED
   * rather than escalated to a breach.
   *
   * A token with no row at all is likewise not reuse — it is unknown, and
   * validation says so with REFRESH_TOKEN_NOT_FOUND.
   *
   * (`issuedAt` is TIMESTAMP(3); two rows in one family sharing a millisecond
   * would hide a successor and downgrade a genuine replay to a plain
   * REFRESH_TOKEN_REVOKED refusal. The token is still refused — only the
   * family-wide revocation is missed — and a rotation takes far longer than a
   * millisecond, so this is a theoretical edge, noted rather than defended
   * against with a column that would have to be maintained forever.)
   */
  async detectTokenReuse(refreshToken: string): Promise<boolean> {
    try {
      const decoded = await verifyToken(refreshToken);
      const res = await query<{
        userId: string;
        family: string;
        hasSuccessor: boolean;
      }>(
        `SELECT r."userId",
                r."family",
                EXISTS (
                  SELECT 1 FROM refresh_tokens s
                   WHERE s."family" = r."family"
                     AND s."issuedAt" > r."issuedAt"
                ) AS "hasSuccessor"
           FROM refresh_tokens r
          WHERE r."tokenHash" = $1 AND r."revokedAt" IS NOT NULL
          LIMIT 1`,
        [this.hashToken(refreshToken)]
      );
      const row = res.rows[0];
      if (!row) return false;
      if (row.userId !== decoded.userId) return false;
      if (!row.hasSuccessor) return false; // revoked by logout, not replayed

      await this.invalidateTokenFamily(row.family, row.userId);
      tokenBlacklistService.blacklistToken(refreshToken);
      return true;
    } catch {
      // Unverifiable token: not reuse, just invalid. Let validation say so.
      return false;
    }
  }

  /**
   * Sweep. Expired rows carry no information — the JWT expires on its own — and
   * revoked rows only need to outlive the token they revoke.
   */
  async cleanupExpiredTokens(): Promise<number> {
    const res = await query(
      `DELETE FROM refresh_tokens WHERE "expiresAt" <= (NOW() AT TIME ZONE 'UTC')`
    );
    return res.rowCount ?? 0;
  }

  /**
   * Refresh token statistics (dev diagnostics only).
   */
  async getStats(): Promise<{
    totalActiveTokens: number;
    tokensByUser: Record<string, number>;
    oldestToken: number | null;
  }> {
    const res = await query<{ userId: string; count: string; oldest: Date }>(
      `SELECT "userId", COUNT(*)::bigint AS count, MIN("issuedAt") AS oldest
         FROM refresh_tokens
        WHERE "revokedAt" IS NULL AND "expiresAt" > (NOW() AT TIME ZONE 'UTC')
        GROUP BY "userId"`
    );

    const tokensByUser: Record<string, number> = {};
    let totalActiveTokens = 0;
    let oldestToken: number | null = null;

    for (const row of res.rows) {
      const count = Number(row.count);
      tokensByUser[row.userId] = count;
      totalActiveTokens += count;
      const issued = row.oldest ? new Date(row.oldest).getTime() : null;
      if (issued !== null && (oldestToken === null || issued < oldestToken)) {
        oldestToken = issued;
      }
    }

    return { totalActiveTokens, tokensByUser, oldestToken };
  }

  /**
   * Clear the warm-instance mirror (for testing). The durable rows are NOT
   * touched — a test that wants a clean table should truncate it explicitly
   * rather than have a method named `clear` quietly delete production sessions.
   */
  clear(): void {
    tokenBlacklistService.clear();
  }
}

// Singleton instance
export const refreshTokenService = new RefreshTokenService();

// Opportunistic sweep on long-running hosts (the legacy Express server, local
// dev). Under serverless this rarely fires — instances are recycled long before
// the hour is up — which is fine: expired rows are inert, and every read
// already re-checks `expiresAt` in SQL. `unref` so it can never hold a process
// (or a test runner) open, and failures are logged, not thrown, because an
// unhandled rejection from a timer would take the instance down.
const sweep = setInterval(
  () => {
    void refreshTokenService.cleanupExpiredTokens().catch((error: unknown) => {
      console.warn('refresh token sweep failed (non-fatal):', String(error));
    });
  },
  60 * 60 * 1000
);
sweep.unref?.();

export default RefreshTokenService;
