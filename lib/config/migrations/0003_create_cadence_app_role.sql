-- 0003_create_cadence_app_role.sql
-- ============================================================================
-- Create the least-privilege, NON-BYPASSRLS application role Cadence connects
-- as once RLS is enforced. HAND-RUN against the target database; nothing in the
-- app auto-applies this file.
--
-- WHY a dedicated role: the migration owner (e.g. `postgres`) and Supabase's
-- default roles may bypass RLS or own the tables (FORCE covers the owner, but a
-- superuser/BYPASSRLS role ignores RLS entirely). The app MUST connect as a
-- role that is NOSUPERUSER + NOBYPASSRLS so the policies in 0002 actually bind
-- it. After creating this role, point the app's DATABASE_URL at it.
--
-- Replace <STRONG_PASSWORD> with a generated secret BEFORE running. Do not
-- commit the real password.
--
-- Everything is schema-qualified to `public`; never touches other schemas.
-- ============================================================================

-- Least-privilege app role. LOGIN, no superuser, no RLS bypass.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cadence_app') THEN
    CREATE ROLE cadence_app LOGIN PASSWORD '<STRONG_PASSWORD>'
      NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO cadence_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cadence_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cadence_app;

-- Future tables/sequences created by the migration owner (postgres) are granted
-- to the app role automatically, so `prisma db push` additions stay usable
-- without re-granting by hand.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO cadence_app;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO cadence_app;

-- ----------------------------------------------------------------------------
-- OPTIONAL rollback target: a BYPASSRLS role. If RLS causes a production
-- incident during cutover, repoint DATABASE_URL at `cadence_bypass` to
-- instantly restore pre-RLS behaviour (all rows visible, app-level scoping
-- still applies) WITHOUT dropping the policies. Remove once cutover is proven.
-- Commented out by default — uncomment + set a password to provision it.
-- ----------------------------------------------------------------------------
-- DO $$
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cadence_bypass') THEN
--     CREATE ROLE cadence_bypass LOGIN PASSWORD '<STRONG_BYPASS_PASSWORD>'
--       NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE;
--   END IF;
-- END $$;
-- GRANT USAGE ON SCHEMA public TO cadence_bypass;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO cadence_bypass;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO cadence_bypass;
