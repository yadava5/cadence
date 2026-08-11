-- 0005_create_refresh_tokens.sql
-- ============================================================================
-- Give refresh-token revocation somewhere durable to live.
--
-- HAND-RUN against the target database, same as 0002/0003/0004 — nothing in the
-- app auto-applies this file. Requires 0003 (the `cadence_app` role).
--
-- ## APPLY THIS *BEFORE* DEPLOYING THE CODE THAT READS IT
--
-- Every other migration here could be applied after its code shipped. This one
-- cannot. `RefreshTokenService.validateRefreshToken` fails CLOSED against this
-- table: a refresh token with no live row is rejected. Ship the code first and
-- every refresh 401s until the table exists.
--
-- And be honest about the other side of fail-closed: applying this migration
-- signs out every session that is currently alive. Tokens minted before the
-- table existed have no row, so their next refresh is refused and the user logs
-- in again — once. That is the cost of the fix, not a bug in it. The
-- alternative (accept any token issued before some cutover instant) is the hole
-- this file exists to close, re-opened with a timestamp on it.
--
-- ## WHY IT EXISTS
--
-- Revocation used to be a `Map` and a `Set` in one Node process
-- (RefreshTokenService/TokenBlacklistService). On Vercel there is no "one
-- process": every instance starts with both empty. So
--   - logout blacklisted a token in the instance that served the logout, and
--     any other instance still accepted it — for the full 7-day token life;
--   - "log out from all devices" iterated a Map that is empty on a cold
--     instance, invalidated nothing, and answered "Logged out from all
--     devices";
--   - reuse detection could only see reuse that happened to land on the same
--     warm instance as the rotation.
-- A row in Postgres is the same fact for every instance, which is the whole
-- point.
--
-- ## WHAT IS STORED — AND WHAT IS NOT
--
-- `tokenHash` is SHA-256 of the token, hex. The token itself is NEVER written.
-- A dump of this table is worthless to an attacker: it cannot be replayed,
-- because the API only ever compares the hash of a token it was handed. That
-- also makes the unique index on the hash safe to key rotation off.
--
-- `family` groups a rotation chain (login → refresh → refresh → ...). Detecting
-- reuse of an already-rotated token revokes the whole family, not just the one
-- token, because reuse means the chain leaked.
--
-- ## WHY `ENABLE` WITHOUT `FORCE`, AND A PERMISSIVE POLICY — NOT 0002's SHAPE
--
-- This is an identity table, like `users` in 0004, and copying 0002's
-- tenant-scoped policy here is a total auth outage. 0002's policies compare
-- against the transaction-local `app.user_id` GUC, which is set by
-- `lib/middleware/auth.ts` — i.e. only on routes behind `authenticateJWT`.
--
-- `POST /api/auth/login` and `POST /api/auth/refresh` are NOT behind it (they
-- cannot be: they are how you get a token in the first place). They run with no
-- GUC bound, and they run on `packages/backend/src/config/database.ts`, a pool
-- with no GUC wiring at all. Under a 0002-style policy `current_setting(...)`
-- is NULL there, so the login-time INSERT fails WITH CHECK and the refresh-time
-- SELECT matches zero rows. Nobody could sign in and nobody could refresh.
--
-- So: ENABLE (schema reads consistently, and a future PostgREST grant cannot
-- quietly expose the table), no FORCE, and one permissive `FOR ALL TO
-- cadence_app` policy granting exactly what GRANT already gave it — the same
-- reasoning, and the same shape, as 0004. Behaviour after this policy is
-- identical to behaviour without it.
--
-- The scoping that RLS cannot do here is done in SQL instead: every statement
-- in RefreshTokenService that is not keyed on the (unique) token hash carries
-- an explicit `"userId" = $n`, and revoking a single token additionally
-- requires the caller's own id, so one authenticated user cannot revoke
-- another's session by posting their token.
--
-- Everything is schema-qualified to `public`; this never touches the co-tenant
-- `lifequest` schema. Idempotent: IF NOT EXISTS throughout, policy is
-- dropped-then-created.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.refresh_tokens (
    "id"        TEXT NOT NULL,
    -- SHA-256(token), hex. Never the token.
    "tokenHash" TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    -- Rotation chain id. Reuse of any member revokes every member.
    "family"    TEXT NOT NULL,
    "issuedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    -- NULL = live. Set once, never cleared.
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- Deleting a user must take their sessions with them. DELETE /api/account
-- revokes explicitly as well, but the FK is what makes it true even for a path
-- that forgets to.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'refresh_tokens_userId_fkey'
  ) THEN
    ALTER TABLE public.refresh_tokens
      ADD CONSTRAINT "refresh_tokens_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES public.users("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- The lookup every refresh does. UNIQUE so rotation cannot double-insert.
CREATE UNIQUE INDEX IF NOT EXISTS "refresh_tokens_tokenHash_key"
  ON public.refresh_tokens("tokenHash");
-- "log out from all devices".
CREATE INDEX IF NOT EXISTS "refresh_tokens_userId_idx"
  ON public.refresh_tokens("userId");
-- Family revocation on reuse detection.
CREATE INDEX IF NOT EXISTS "refresh_tokens_family_idx"
  ON public.refresh_tokens("family");
-- Expiry sweep.
CREATE INDEX IF NOT EXISTS "refresh_tokens_expiresAt_idx"
  ON public.refresh_tokens("expiresAt");

-- 0003's ALTER DEFAULT PRIVILEGES already covers tables created by `postgres`;
-- this is explicit so the migration is correct even if it is run by some other
-- owner. Idempotent.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.refresh_tokens TO cadence_app;

ALTER TABLE public.refresh_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS refresh_tokens_app_all ON public.refresh_tokens;
CREATE POLICY refresh_tokens_app_all ON public.refresh_tokens
  FOR ALL TO cadence_app
  USING (true)
  WITH CHECK (true);

COMMIT;

-- ============================================================================
-- Verification, as the application's own role — `SET ROLE cadence_app` drops
-- any BYPASSRLS the migration owner has and reproduces the exact path login
-- takes, with no GUC bound (which is the case this table must survive):
--
--   BEGIN;
--   SET LOCAL ROLE cadence_app;
--   INSERT INTO public.refresh_tokens ("id","tokenHash","userId","family","expiresAt")
--     VALUES ('probe','deadbeef','<a real user id>','fam', NOW() + interval '7 days');
--   SELECT count(*) FROM public.refresh_tokens WHERE "tokenHash" = 'deadbeef';  -- 1
--   SELECT count(*) FROM public.events;                                          -- 0
--   ROLLBACK;
--
-- Both lines matter. The first proves the pre-auth path (no `app.user_id`) can
-- still write and read this table; if it returns 0 the policy is wrong and
-- login is broken. The second proves this file did not loosen tenant isolation
-- anywhere else — `events` must still be invisible without the GUC.
--
-- ----------------------------------------------------------------------------
-- DOWN (only if you are reverting the deploy too — the code fails closed
-- without this table, so dropping it while the new code is live 401s every
-- refresh):
--
--   BEGIN;
--   DROP POLICY IF EXISTS refresh_tokens_app_all ON public.refresh_tokens;
--   DROP TABLE IF EXISTS public.refresh_tokens;
--   COMMIT;
--
-- Indexes, the FK and the grant go with the table.
-- ============================================================================
