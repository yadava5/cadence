-- 0006_task_tags_require_tag_ownership.sql
-- ============================================================================
-- Close the half of `task_tags` that 0002 left open: the TAG side.
--
-- HAND-RUN against the target database, same as 0002/0003/0004/0005 — nothing
-- in the app auto-applies this file. Requires 0002 (it replaces the policy that
-- file created) and 0001 (tags."userId").
--
-- ## WHAT WAS WRONG
--
-- 0002's `task_tags_all` policy checks ONE side of the join row:
--
--   EXISTS (SELECT 1 FROM tasks t
--            WHERE t.id = task_tags."taskId" AND t."userId" = <caller>)
--
-- i.e. "the task is mine". It never asks whether the TAG is mine. `tags` became
-- per-user in 0001, so "a tag id" is now someone's property, and the policy was
-- still treating the column as if tags were global.
--
-- The consequence is not a read leak — it is cross-tenant CORRUPTION, and
-- `POST /api/tags/merge` reached it. `TagService.mergeTags` ran
--
--   UPDATE task_tags SET "tagId" = $1 WHERE "tagId" = $2
--
-- with no ownership check on either id, and both USING and WITH CHECK passed
-- because the rows' tasks belonged to the caller. So with a foreign tag's cuid
-- a caller could repoint their own task_tags at another tenant's tag. Their
-- tags then disappeared from their own tasks (the label lives on the other
-- tenant's row, which they cannot read), and when the victim eventually deleted
-- that tag, `task_tags_tagId_fkey ON DELETE CASCADE` took the caller's rows
-- with it. One tenant's ordinary cleanup silently deleting another tenant's
-- data is exactly what RLS is here to make impossible.
--
-- `TagService.mergeTags` and `TagService.attachToTask` now validate ownership
-- of the tag ids in application code as well. That check and this policy are
-- deliberately redundant: the service check produces a clear 4xx instead of a
-- database error, and the policy is what holds when a future caller forgets.
--
-- ## WHY THE SECOND `EXISTS` IS WRITTEN OUT EVEN THOUGH `tags` IS RLS'D
--
-- `tags` is FORCE RLS'd by 0002, and a subquery inside a policy expression is
-- itself subject to the referenced table's policies, so the tag lookup below is
-- already filtered to the caller. Naming `"userId"` anyway costs one comparison
-- and keeps this correct if `tags` policies are ever relaxed, dropped, or the
-- table is read by a role that bypasses them. Defence in depth, stated rather
-- than inherited.
--
-- No recursion: `tags`' own policy is a scalar compare on `tags."userId"` that
-- does not reference `task_tags`.
--
-- The GUC read stays wrapped as `(SELECT current_setting(...))` so the planner
-- hoists it into a once-per-query InitPlan — see 0002's header, and the
-- `auth_rls_initplan` lint it satisfies.
--
-- Everything is schema-qualified to `public`. Idempotent: dropped-then-created.
-- ============================================================================

BEGIN;

-- Unchanged from 0002; restated so this file is self-contained if read alone.
ALTER TABLE public.task_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_tags FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_tags_all ON public.task_tags;
CREATE POLICY task_tags_all ON public.task_tags
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_tags."taskId"
        AND t."userId" = (SELECT current_setting('app.user_id', true))
    )
    AND EXISTS (
      SELECT 1 FROM public.tags g
      WHERE g.id = task_tags."tagId"
        AND g."userId" = (SELECT current_setting('app.user_id', true))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_tags."taskId"
        AND t."userId" = (SELECT current_setting('app.user_id', true))
    )
    AND EXISTS (
      SELECT 1 FROM public.tags g
      WHERE g.id = task_tags."tagId"
        AND g."userId" = (SELECT current_setting('app.user_id', true))
    )
  );

COMMIT;

-- ============================================================================
-- BEFORE YOU RUN THIS: any pre-existing `task_tags` row whose task and tag have
-- DIFFERENT owners becomes invisible and undeletable to the app the moment this
-- lands (USING fails, so it cannot even be selected to be cleaned up). Such a
-- row can only have come from the merge bug above. Find them first, as the
-- table owner:
--
--   SELECT tt."taskId", tt."tagId", t."userId" AS task_owner, g."userId" AS tag_owner
--     FROM public.task_tags tt
--     JOIN public.tasks t ON t.id = tt."taskId"
--     JOIN public.tags  g ON g.id = tt."tagId"
--    WHERE t."userId" IS DISTINCT FROM g."userId";
--
-- Expect zero rows. If it is not zero, decide per row whether to delete it or
-- repoint it at a tag the task's owner actually owns — as the owner, before
-- applying this — because afterwards the application cannot reach it.
--
-- Verification, as the application's own role:
--
--   BEGIN;
--   SET LOCAL ROLE cadence_app;
--   SELECT set_config('app.user_id', '<user A id>', true);
--   -- A's own pairing is still visible:
--   SELECT count(*) FROM public.task_tags;                 -- A's rows only
--   -- Repointing one of A's rows at a tag id belonging to B must fail:
--   UPDATE public.task_tags SET "tagId" = '<a tag id owned by B>'
--    WHERE "taskId" = '<a task id owned by A>';            -- 0 rows / WITH CHECK error
--   ROLLBACK;
--
-- ----------------------------------------------------------------------------
-- DOWN — restores 0002's policy exactly (task side only). This reopens the
-- merge hole; only useful to unblock an incident:
--
--   BEGIN;
--   DROP POLICY IF EXISTS task_tags_all ON public.task_tags;
--   CREATE POLICY task_tags_all ON public.task_tags
--     USING (
--       EXISTS (SELECT 1 FROM public.tasks t
--                WHERE t.id = task_tags."taskId"
--                  AND t."userId" = (SELECT current_setting('app.user_id', true)))
--     )
--     WITH CHECK (
--       EXISTS (SELECT 1 FROM public.tasks t
--                WHERE t.id = task_tags."taskId"
--                  AND t."userId" = (SELECT current_setting('app.user_id', true)))
--     );
--   COMMIT;
-- ============================================================================
