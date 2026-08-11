-- 0008_schema_columns_from_runtime_ddl.sql
-- ============================================================================
-- Move two columns out of the REQUEST PATH and into a migration, where they
-- belong.
--
-- HAND-RUN against the target database, same as 0001–0007. Nothing in the app
-- applies it. (0005/0006/0007 were taken by concurrent work; this is the next
-- free number.)
--
-- ## WHAT THIS REPLACES
--
-- `tasks.status` and `attachments."thumbnailUrl"` were never written into any
-- schema source. Both were instead created at runtime, by the services, while
-- serving user requests:
--
--   - `TaskService.ensureStatusColumnExists()` — an `information_schema` probe
--     on the first call in a process, then `ALTER TABLE` / backfill / `SET
--     DEFAULT` / `SET NOT NULL` if the column was missing.
--   - `AttachmentService.ensureSchema()` — `ALTER TABLE attachments ADD COLUMN
--     IF NOT EXISTS "thumbnailUrl" text`, fired from the CONSTRUCTOR as an
--     unawaited `void`, on every instantiation. Its `catch` did not set the
--     latch, so a failure meant it retried forever.
--
-- Both columns were confirmed present in production before this file was
-- written, which is what makes deleting the runtime DDL safe rather than
-- hopeful:
--
--   tasks.status               text NOT NULL DEFAULT 'NOT_STARTED'
--   attachments."thumbnailUrl" text NULL
--   attachments_taskId_fkey    ON DELETE CASCADE
--
-- So against production this migration is a NO-OP by construction — every
-- statement below is guarded. It exists so the schema has a written source, so
-- a fresh database can be built without running the application first, and so
-- the DDL is not being issued by a request handler holding a user's connection.
--
-- Application-issued DDL is worth naming as a category, not just removing: it
-- needs the app role to hold `ALTER` on the table (privilege the app otherwise
-- has no use for), it takes an ACCESS EXCLUSIVE lock that blocks every reader
-- of `tasks` for its duration, and it runs at whatever moment the first request
-- after a cold start happens to arrive — which is exactly when you least want a
-- table lock.
--
-- ## SHAPE
--
-- Matched to the live table, not to the fixture. `lib/__tests__/fixtures/
-- schema.sql` declares `status` nullable and undefaulted (it was written from
-- the backfill's assumption that older rows arrived without it); production has
-- it `NOT NULL DEFAULT 'NOT_STARTED'`. This file states production's shape,
-- and the drift between the two is noted rather than silently "fixed" here —
-- changing the fixture changes what every service test runs against.
--
-- Idempotent: `ADD COLUMN IF NOT EXISTS`, a backfill that only touches NULLs,
-- and `SET NOT NULL` which is a no-op when already set.
-- ============================================================================

BEGIN;

-- tasks.status ---------------------------------------------------------------
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS "status" TEXT;

-- Backfill before NOT NULL, deriving from `completed` exactly as the runtime
-- version did. Only NULL rows, so re-running cannot rewrite live data.
UPDATE public.tasks
   SET "status" = CASE WHEN "completed" = true THEN 'DONE' ELSE 'NOT_STARTED' END
 WHERE "status" IS NULL;

ALTER TABLE public.tasks ALTER COLUMN "status" SET DEFAULT 'NOT_STARTED';
ALTER TABLE public.tasks ALTER COLUMN "status" SET NOT NULL;

-- attachments."thumbnailUrl" --------------------------------------------------
-- Nullable on purpose: only image uploads generate a thumbnail
-- (server-handlers/upload/index.ts), so for every other file type this is NULL.
ALTER TABLE public.attachments ADD COLUMN IF NOT EXISTS "thumbnailUrl" TEXT;

COMMIT;

-- ============================================================================
-- Verification (as the table owner — this is DDL, not a tenant read):
--
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND ((table_name = 'tasks'       AND column_name = 'status')
--        OR (table_name = 'attachments' AND column_name = 'thumbnailUrl'));
--
-- Expect exactly two rows:
--   tasks       | status       | text | NO  | 'NOT_STARTED'::text
--   attachments | thumbnailUrl | text | YES | NULL
--
-- And no task should be left without a status:
--   SELECT count(*) FROM public.tasks WHERE "status" IS NULL;   -- 0
--
-- ----------------------------------------------------------------------------
-- DOWN: there isn't one worth writing, and pretending otherwise would be worse
-- than saying so. Dropping either column destroys user data — `status` is the
-- Kanban column every task sits in — and the application reads both
-- unconditionally now that the runtime DDL is gone, so a "rollback" is an
-- outage plus data loss. If this migration has to be undone, the honest revert
-- is to redeploy the previous application build; the columns can stay.
--
-- The only genuinely reversible part is the constraint, if `SET NOT NULL` ever
-- needs backing out during an incident:
--
--   ALTER TABLE public.tasks ALTER COLUMN "status" DROP NOT NULL;
--   ALTER TABLE public.tasks ALTER COLUMN "status" DROP DEFAULT;
-- ============================================================================
