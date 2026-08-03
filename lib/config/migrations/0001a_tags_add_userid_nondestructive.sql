-- 0001a_tags_add_userid_nondestructive.sql
-- ============================================================================
-- Supersedes 0001_tags_add_userid.sql. Same destination, without the data loss.
--
-- WHY THIS EXISTS. 0001 derives tag ownership from task_tags -> tasks, then
-- ends with:
--
--     DELETE FROM public.tags WHERE "userId" IS NULL;
--
-- Any tag not attached to a task has no derivable owner and is destroyed. Run
-- as a dry query against the live database on 2026-08-03, that clause deleted
-- FOUR OF SEVEN tags:
--
--     personal  PROJECT   1 owner   kept
--     urgent    PRIORITY  1 owner   kept
--     work      PROJECT   1 owner   kept
--     home      LOCATION  0 owners  DELETED
--     meeting   LABEL     0 owners  DELETED
--     office    LOCATION  0 owners  DELETED
--     social    LABEL     0 owners  DELETED
--
-- Those four are seed vocabulary — the LOCATION/LABEL set a user picks from.
-- Being unused is exactly what you would expect of them, and it is not a
-- reason to delete them.
--
-- WHAT THIS DOES INSTEAD. Orphans are CLONED once per user rather than
-- dropped. That is not a nicety: under RLS a row with a NULL "userId" matches
-- no policy and is invisible to everyone, so "leave them unowned" and "delete
-- them" have the same visible outcome. One copy per user is the only option
-- that preserves current behaviour.
--
-- Everything else is 0001 unchanged: backfill from task ownership, split tags
-- shared across users, FK, per-user unique index.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

BEGIN;

-- 1. The column.
ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS "userId" text;

-- 2. Backfill from task ownership — the primary owner is the lowest userId
--    among tasks carrying the tag. (Identical to 0001.)
UPDATE public.tags AS tg
SET "userId" = sub.owner
FROM (
  SELECT tt."tagId" AS tag_id, MIN(t."userId") AS owner
  FROM public.task_tags tt
  JOIN public.tasks t ON t.id = tt."taskId"
  GROUP BY tt."tagId"
) AS sub
WHERE tg.id = sub.tag_id
  AND tg."userId" IS NULL;

-- 2b. Drop the GLOBAL unique-on-name constraint before any cloning.
--
--     This ordering is load-bearing and 0001 gets it wrong: it clones tags in
--     step 3 and only drops tags_name_key at the very end, so the first clone
--     collides with the row it was copied from —
--         ERROR: duplicate key value violates unique constraint "tags_name_key"
--     Caught by rehearsing this migration against a replica of the live tag
--     data rather than reading it. Uniqueness is re-established per user at
--     the end, which is the correct shape once tags are owned.
ALTER TABLE public.tags DROP CONSTRAINT IF EXISTS tags_name_key;

-- 3. Split tags shared across users: clone per additional owner and repoint
--    that owner's task_tags at the clone. (Identical to 0001.)
DO $$
DECLARE
  rec RECORD;
  new_tag_id text;
BEGIN
  FOR rec IN
    SELECT DISTINCT tt."tagId" AS tag_id, t."userId" AS uid
    FROM public.task_tags tt
    JOIN public.tasks t ON t.id = tt."taskId"
    JOIN public.tags tg ON tg.id = tt."tagId"
    WHERE t."userId" <> tg."userId"
  LOOP
    new_tag_id := gen_random_uuid()::text;
    INSERT INTO public.tags (id, name, type, color, "userId")
    SELECT new_tag_id, name, type, color, rec.uid
    FROM public.tags
    WHERE id = rec.tag_id;

    UPDATE public.task_tags tt
    SET "tagId" = new_tag_id
    FROM public.tasks t
    WHERE tt."taskId" = t.id
      AND t."userId" = rec.uid
      AND tt."tagId" = rec.tag_id;
  END LOOP;
END $$;

-- 4. THE DIVERGENCE FROM 0001. Give every still-unowned tag to every user
--    instead of deleting it, then remove the now-redundant original.
--
--    The ON CONFLICT guard matters: if a user already owns a tag of the same
--    name, cloning would violate the per-user unique index created in step 7.
--    Skipping is right — they already have that vocabulary.
DO $$
DECLARE
  orphan RECORD;
  u RECORD;
BEGIN
  FOR orphan IN
    SELECT id, name, type, color FROM public.tags WHERE "userId" IS NULL
  LOOP
    FOR u IN SELECT id FROM public.users LOOP
      INSERT INTO public.tags (id, name, type, color, "userId")
      VALUES (gen_random_uuid()::text, orphan.name, orphan.type, orphan.color, u.id)
      ON CONFLICT DO NOTHING;
    END LOOP;
    -- The unowned original has been replaced by per-user copies. Any
    -- task_tags row pointing at it would already have given it an owner in
    -- step 2, so by construction nothing references it here.
    DELETE FROM public.tags WHERE id = orphan.id;
  END LOOP;
END $$;

-- 5. Now that nothing is unowned, the column can be mandatory.
ALTER TABLE public.tags ALTER COLUMN "userId" SET NOT NULL;

-- 6. Ownership is a real relationship, so let the database enforce it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tags_userId_fkey'
  ) THEN
    ALTER TABLE public.tags
      ADD CONSTRAINT "tags_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 7. Uniqueness moves from global to per-user: two people may both have
--    "urgent" without colliding.
CREATE UNIQUE INDEX IF NOT EXISTS "tags_userId_name_key"
  ON public.tags ("userId", name);
CREATE INDEX IF NOT EXISTS "tags_userId_idx" ON public.tags ("userId");

COMMIT;
