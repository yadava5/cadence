-- 0001_tags_add_userid.sql
-- ============================================================================
-- Make the global `tags` table PER-USER (prerequisite for RLS on tags).
--
-- HAND-RUN ONCE against the target database, BEFORE 0002_enable_rls.sql.
-- Nothing in the app auto-applies this file. Run it inside the transaction it
-- opens (BEGIN/COMMIT below) so a mid-migration failure rolls back cleanly.
--
-- Before running, confirm the existing unique constraint name on `tags`:
--     \d public.tags
-- Prisma's `name String @unique` generates `tags_name_key`; adjust the DROP
-- below if your database reports a different name.
--
-- What it does:
--   1. Add a nullable `userId` column.
--   2. Backfill each tag's primary owner = the smallest user id among the
--      users whose tasks reference the tag (via task_tags -> tasks).
--   3. SPLIT shared tags: for every OTHER user of a tag, clone the tag for
--      that user and repoint that user's task_tags to the clone, so every user
--      ends up with their own private copy.
--   4. Delete orphan tags that no task references (userId still NULL).
--   5. SET NOT NULL, add the FK to users, swap the global unique for a
--      per-user unique, and add the owner index.
--
-- The resulting index/constraint names match what `prisma db push` expects
-- from the updated schema (`tags_userId_name_key`, `tags_userId_idx`), so the
-- schema stays in sync and push is a no-op afterwards.
-- ============================================================================

BEGIN;

-- 1. Owner column (nullable during backfill).
ALTER TABLE public.tags ADD COLUMN IF NOT EXISTS "userId" text;

-- 2. Backfill each tag's primary owner = MIN(tasks."userId") among the users
--    whose tasks reference the tag.
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

-- 3. SPLIT shared tags: clone per extra (non-primary) user and repoint their
--    task_tags to the clone. Each (tag, extra-user) pair yields one clone.
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
    WHERE t."userId" <> tg."userId"   -- everyone except the primary owner
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

-- 4. Drop tags no task references (never assigned an owner above).
DELETE FROM public.tags WHERE "userId" IS NULL;

-- 5a. Enforce ownership.
ALTER TABLE public.tags ALTER COLUMN "userId" SET NOT NULL;

-- 5b. FK to users (cascade delete with the owner). Guarded — no ADD CONSTRAINT
--     IF NOT EXISTS in Postgres.
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

-- 5c. Swap the global unique(name) for a per-user unique(userId, name).
ALTER TABLE public.tags DROP CONSTRAINT IF EXISTS tags_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS "tags_userId_name_key"
  ON public.tags ("userId", name);

-- 5d. Owner index (matches @@index([userId])).
CREATE INDEX IF NOT EXISTS "tags_userId_idx" ON public.tags ("userId");

COMMIT;
