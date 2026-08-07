-- 0004_enable_rls_on_identity_tables.sql
-- ============================================================================
-- Turn RLS on for `users` and `user_profiles` — the two tables 0002
-- deliberately excluded — WITHOUT changing who can read or write a single row.
--
-- HAND-RUN against the target database. Nothing in the app auto-applies this
-- file, same as 0002 and 0003.
--
-- ## READ THIS BEFORE YOU DECIDE THIS FILE FIXED SOMETHING
--
-- It did not. This is uniformity and defence-in-depth, not a closed hole, and
-- the header says so because the alternative is that someone later reads an
-- `ENABLE ROW LEVEL SECURITY` here and concludes an exposure once existed.
--
-- Measured 2026-08-07, before this file was written:
--   - `anon` and `authenticated` hold ZERO privileges on EVERY table in
--     `public`. Only `service_role`, `cadence_app` and the owner are granted
--     anything (information_schema.role_table_grants).
--   - Supabase's security advisor returns an empty lint set. The standard
--     `rls_disabled_in_public` lint cannot fire, because PostgREST has no
--     grants with which to reach these tables.
-- So the thing an RLS policy would deny here is already denied by GRANT.
-- Grants remain the real control; this makes the schema read consistently.
--
-- ## WHY THERE IS NO `FORCE`, AND WHY THE POLICY IS PERMISSIVE
--
-- The obvious move — copy the shape of the other seven tables — is the one
-- thing that must not be done here, twice over.
--
-- 1. `ENABLE` alone, with no policy, is a login outage. Plain ENABLE already
--    binds every NON-OWNER role; `FORCE` is what additionally binds the owner.
--    These tables are owned by `postgres`, and the application connects as
--    `cadence_app` — a non-owner, NOSUPERUSER, NOBYPASSRLS (0003). With RLS on
--    and no policy, the pre-auth `SELECT ... FROM users WHERE email = $1` that
--    every login begins with matches zero rows, and nobody can sign in.
--
-- 2. A self-referential policy is the same outage by another route, and it is
--    the reason 0002 excluded these tables in the first place: the login
--    lookup happens BEFORE any user id exists, so a policy keyed on
--    `app.user_id` can never match it. See 0002's header and docs/RLS-CUTOVER.md.
--
-- Hence: ENABLE, no FORCE, and one permissive `FOR ALL` policy granting
-- `cadence_app` exactly the access GRANT already gave it. Behaviour after this
-- file is byte-identical to behaviour before it.
--
-- `cadence_app` is named explicitly rather than PUBLIC because it is provably
-- the only role that can be the application: of the roles holding grants on
-- these tables, `service_role` cannot log in and `postgres` has BYPASSRLS, so
-- `cadence_app` is the only login-capable role that RLS can bind at all.
--
-- Everything is schema-qualified to `public`; this never touches the co-tenant
-- `lifequest` schema. Idempotent: policies are dropped-then-created.
-- ============================================================================

BEGIN;

-- users -----------------------------------------------------------------
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_app_all ON public.users;
CREATE POLICY users_app_all ON public.users
  FOR ALL TO cadence_app
  USING (true)
  WITH CHECK (true);

-- user_profiles ---------------------------------------------------------
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_profiles_app_all ON public.user_profiles;
CREATE POLICY user_profiles_app_all ON public.user_profiles
  FOR ALL TO cadence_app
  USING (true)
  WITH CHECK (true);

COMMIT;

-- ============================================================================
-- Verification, run as the application's own role rather than as the owner —
-- `SET ROLE cadence_app` drops BYPASSRLS and reproduces the exact access path
-- login takes, without needing a password:
--
--   BEGIN;
--   SET LOCAL ROLE cadence_app;
--   SELECT count(*) FROM public.users WHERE email = '<a known address>';  -- 1
--   SELECT count(*) FROM public.user_profiles;                            -- >0
--   SELECT count(*) FROM public.events;                                   -- 0
--   ROLLBACK;
--
-- The last line is the point: `events` must still return 0 without the
-- `app.user_id` GUC. If this file had loosened tenant isolation, that count
-- would be non-zero.
-- ============================================================================
