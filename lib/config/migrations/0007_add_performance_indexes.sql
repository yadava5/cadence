-- 0007_add_performance_indexes.sql
-- ============================================================================
-- Query-plan indexes for the hot read paths. HAND-RUN against the target
-- database; nothing in the app auto-applies this file, same as 0002/0003/0004.
--
-- ## Why this is 0007 and not `add-performance-indexes.sql`
--
-- It was written as `add-performance-indexes.sql`, outside the numbered
-- sequence, and none of its indexes ever reached production. There is no
-- migration runner in this repo — `npm run db:migrate` delegates to
-- `packages/backend`, and the numbered files here are applied by hand against
-- the target database, with `docs/RLS-CUTOVER.md` and the README's migration
-- table as the checklist of what to run. A file outside the numbering appears
-- on neither list, so nobody ever ran it. Renaming it into the sequence is the
-- whole fix: it is now applicable by the same mechanism as everything else.
--
-- ## What changed from the original file
--
-- One index added: `tasks_userId_createdAt_idx`. `GET /api/tasks` filters on
-- `"userId"` and orders by `"createdAt" DESC` (TaskService `buildWhereClause` +
-- `buildOrderByClause`, whose default sort is `createdAt`), and the schema has
-- `tasks_userId_idx` and a *global* `tasks_createdAt_idx` but no composite —
-- so the planner filters by user and then sorts the result. The composite
-- serves filter and order in one index scan. It is the single most-executed
-- read in the app.
--
-- The other ten are the original file unchanged.
--
-- ## Running this on a live database
--
-- `CREATE INDEX` takes an ACCESS EXCLUSIVE-ish lock that blocks writes to the
-- table for the duration of the build. On a populated production table use
-- `CREATE INDEX CONCURRENTLY` instead — note that CONCURRENTLY cannot run
-- inside a transaction block, so run those statements one at a time and outside
-- BEGIN/COMMIT, and re-check for `INVALID` indexes afterwards
-- (`SELECT * FROM pg_index WHERE NOT indisvalid`). Every statement is
-- `IF NOT EXISTS`, so a partial run is safe to repeat.
--
-- Everything is schema-qualified to `public`; never touches other schemas.
-- ============================================================================

-- Tasks table optimizations
-- Priority index for filtering and sorting by priority
CREATE INDEX IF NOT EXISTS "tasks_priority_idx" ON "public"."tasks"("priority");

-- UpdatedAt index for "recently modified" queries
CREATE INDEX IF NOT EXISTS "tasks_updatedAt_idx" ON "public"."tasks"("updatedAt");

-- Composite index for priority + completed filtering (common in task views)
CREATE INDEX IF NOT EXISTS "tasks_priority_completed_idx" ON "public"."tasks"("priority", "completed");

-- Composite index for scheduled date + priority (calendar view sorting)
CREATE INDEX IF NOT EXISTS "tasks_scheduledDate_priority_idx" ON "public"."tasks"("scheduledDate", "priority");

-- User-scoped composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS "tasks_userId_priority_idx" ON "public"."tasks"("userId", "priority");

CREATE INDEX IF NOT EXISTS "tasks_userId_updatedAt_idx" ON "public"."tasks"("userId", "updatedAt");

-- The default list read: WHERE "userId" = $1 ORDER BY "createdAt" DESC.
-- `tasks_userId_idx` alone cannot supply the ordering, and the global
-- `tasks_createdAt_idx` cannot supply the filter.
CREATE INDEX IF NOT EXISTS "tasks_userId_createdAt_idx" ON "public"."tasks"("userId", "createdAt" DESC);

-- Calendars table optimization
-- UpdatedAt for sync/refresh operations
CREATE INDEX IF NOT EXISTS "calendars_updatedAt_idx" ON "public"."calendars"("updatedAt");

-- Task lists table optimization
CREATE INDEX IF NOT EXISTS "task_lists_updatedAt_idx" ON "public"."task_lists"("updatedAt");

-- Events table optimization
-- Composite index for calendar + date range queries (very common)
CREATE INDEX IF NOT EXISTS "events_calendarId_start_end_idx" ON "public"."events"("calendarId", "start", "end");

-- UpdatedAt for sync operations
CREATE INDEX IF NOT EXISTS "events_updatedAt_idx" ON "public"."events"("updatedAt");

-- Performance notes:
-- 1. These indexes optimize common query patterns without significantly increasing write overhead
-- 2. Composite indexes are ordered by cardinality (high to low) for optimal query planning
-- 3. All indexes use IF NOT EXISTS to allow safe re-running
