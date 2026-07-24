-- 0002_enable_rls.sql
-- ============================================================================
-- Enable DB-enforced Row-Level Security on Cadence's 7 tenant tables.
--
-- HAND-RUN against the target database AFTER 0001_tags_add_userid.sql and
-- AFTER the app is deployed with the tx-local `app.user_id` GUC wiring (so
-- every request sets the GUC before this makes RLS mandatory). Nothing in the
-- app auto-applies this file.
--
-- Mechanism: each request runs its statements inside a transaction that sets
--   SELECT set_config('app.user_id', <verified user id>, true)
-- (see lib/config/database.ts + lib/config/rlsContext.ts). Policies compare
-- ownership against current_setting('app.user_id', true).
--
-- IDs are `text` (cuid), so the comparison is text-to-text — NO ::uuid cast.
-- current_setting(..., true) returns NULL when the GUC is unset, so an
-- unauthenticated / no-context connection matches no rows and fails INSERT
-- WITH CHECK: RLS fails CLOSED.
--
-- FORCE ROW LEVEL SECURITY makes the policies apply even to the table owner,
-- so the app role is bound by them regardless of ownership. EXCLUDES `users`
-- and `user_profiles` — those are read/written pre-auth (login/register) and
-- must NOT be RLS'd or auth breaks.
--
-- Everything is schema-qualified to `public`; this never touches the
-- co-tenant `lifequest` schema. Idempotent: policies are dropped-then-created.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- Direct-owned tables: ownership is the row's own "userId".
-- calendars, events, task_lists, tasks, tags
-- ----------------------------------------------------------------------------

-- calendars
ALTER TABLE public.calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendars FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS calendars_select ON public.calendars;
DROP POLICY IF EXISTS calendars_insert ON public.calendars;
DROP POLICY IF EXISTS calendars_update ON public.calendars;
DROP POLICY IF EXISTS calendars_delete ON public.calendars;
CREATE POLICY calendars_select ON public.calendars
  FOR SELECT USING ("userId" = current_setting('app.user_id', true));
CREATE POLICY calendars_insert ON public.calendars
  FOR INSERT WITH CHECK ("userId" = current_setting('app.user_id', true));
CREATE POLICY calendars_update ON public.calendars
  FOR UPDATE USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));
CREATE POLICY calendars_delete ON public.calendars
  FOR DELETE USING ("userId" = current_setting('app.user_id', true));

-- events
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS events_select ON public.events;
DROP POLICY IF EXISTS events_insert ON public.events;
DROP POLICY IF EXISTS events_update ON public.events;
DROP POLICY IF EXISTS events_delete ON public.events;
CREATE POLICY events_select ON public.events
  FOR SELECT USING ("userId" = current_setting('app.user_id', true));
CREATE POLICY events_insert ON public.events
  FOR INSERT WITH CHECK ("userId" = current_setting('app.user_id', true));
CREATE POLICY events_update ON public.events
  FOR UPDATE USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));
CREATE POLICY events_delete ON public.events
  FOR DELETE USING ("userId" = current_setting('app.user_id', true));

-- task_lists
ALTER TABLE public.task_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_lists FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS task_lists_select ON public.task_lists;
DROP POLICY IF EXISTS task_lists_insert ON public.task_lists;
DROP POLICY IF EXISTS task_lists_update ON public.task_lists;
DROP POLICY IF EXISTS task_lists_delete ON public.task_lists;
CREATE POLICY task_lists_select ON public.task_lists
  FOR SELECT USING ("userId" = current_setting('app.user_id', true));
CREATE POLICY task_lists_insert ON public.task_lists
  FOR INSERT WITH CHECK ("userId" = current_setting('app.user_id', true));
CREATE POLICY task_lists_update ON public.task_lists
  FOR UPDATE USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));
CREATE POLICY task_lists_delete ON public.task_lists
  FOR DELETE USING ("userId" = current_setting('app.user_id', true));

-- tasks
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tasks_select ON public.tasks;
DROP POLICY IF EXISTS tasks_insert ON public.tasks;
DROP POLICY IF EXISTS tasks_update ON public.tasks;
DROP POLICY IF EXISTS tasks_delete ON public.tasks;
CREATE POLICY tasks_select ON public.tasks
  FOR SELECT USING ("userId" = current_setting('app.user_id', true));
CREATE POLICY tasks_insert ON public.tasks
  FOR INSERT WITH CHECK ("userId" = current_setting('app.user_id', true));
CREATE POLICY tasks_update ON public.tasks
  FOR UPDATE USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));
CREATE POLICY tasks_delete ON public.tasks
  FOR DELETE USING ("userId" = current_setting('app.user_id', true));

-- tags (per-user after 0001)
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tags_select ON public.tags;
DROP POLICY IF EXISTS tags_insert ON public.tags;
DROP POLICY IF EXISTS tags_update ON public.tags;
DROP POLICY IF EXISTS tags_delete ON public.tags;
CREATE POLICY tags_select ON public.tags
  FOR SELECT USING ("userId" = current_setting('app.user_id', true));
CREATE POLICY tags_insert ON public.tags
  FOR INSERT WITH CHECK ("userId" = current_setting('app.user_id', true));
CREATE POLICY tags_update ON public.tags
  FOR UPDATE USING ("userId" = current_setting('app.user_id', true))
  WITH CHECK ("userId" = current_setting('app.user_id', true));
CREATE POLICY tags_delete ON public.tags
  FOR DELETE USING ("userId" = current_setting('app.user_id', true));

-- ----------------------------------------------------------------------------
-- Join-owned tables: ownership derives from the parent task's "userId".
-- attachments."taskId" -> tasks; task_tags."taskId" -> tasks.
-- One FOR ALL policy (USING + WITH CHECK) per table. The tasks policy above is
-- a scalar compare that does NOT reference these tables, so there is no policy
-- recursion.
-- ----------------------------------------------------------------------------

-- attachments
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS attachments_all ON public.attachments;
CREATE POLICY attachments_all ON public.attachments
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = attachments."taskId"
        AND t."userId" = current_setting('app.user_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = attachments."taskId"
        AND t."userId" = current_setting('app.user_id', true)
    )
  );

-- task_tags
ALTER TABLE public.task_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_tags FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS task_tags_all ON public.task_tags;
CREATE POLICY task_tags_all ON public.task_tags
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_tags."taskId"
        AND t."userId" = current_setting('app.user_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_tags."taskId"
        AND t."userId" = current_setting('app.user_id', true)
    )
  );

COMMIT;
