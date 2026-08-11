/**
 * The application's OWN tenant scoping, with RLS deliberately switched off.
 *
 * ## Why this database has no policies on it
 *
 * `rls.postgres.test.ts` proves Postgres isolates tenants. That is the strong
 * guarantee and it is the one production leans on. It is also the reason a set
 * of queries in the service layer had no `userId` predicate at all — they were
 * safe, but only because of something in a different file that a connection
 * string can turn off:
 *
 *   - `TagService.findAll` scoped the usage subqueries and left the SELECT over
 *     `tags` itself unfiltered;
 *   - `TagService.getStatistics` counted every tenant's tags;
 *   - `TagService.cleanupUnusedTags` SELECTed and then DELETEd across all of
 *     them;
 *   - `TagService.mergeTags` repointed `task_tags` at an attacker-supplied tag
 *     id, checking neither end;
 *   - `TaskService.bulkUpdate` verified the tasks and then applied `taskListId`
 *     blind.
 *
 * So this suite applies `fixtures/schema.sql` and NOTHING else — no
 * `0002_enable_rls.sql`, no policies, no non-bypass role. Whatever isolation
 * shows up here is the application's own, because there is nothing else left to
 * provide it. If someone deletes a `WHERE "userId"` these tests fail; under RLS
 * they would still pass.
 *
 * Skipped unless RLS_TEST_PG_ADMIN_URL points at a superuser Postgres; the
 * global setup starts a throwaway container when Docker is available.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const ADMIN_URL = process.env.RLS_TEST_PG_ADMIN_URL;

const TEST_DB = 'cadence_tenant_scoping';

const USER_A = 'usr_scope_a';
const USER_B = 'usr_scope_b';
const ctxA = { userId: USER_A };
const ctxB = { userId: USER_B };

let admin: Pool;
let tagService: InstanceType<
  typeof import('../services/TagService.js').TagService
>;
let taskService: InstanceType<
  typeof import('../services/TaskService.js').TaskService
>;

/** Rebuild the tenant rows so each test starts from the same board. */
async function seed(): Promise<void> {
  await admin.query(
    `TRUNCATE task_tags, attachments, tasks, tags, task_lists, calendars, users RESTART IDENTITY CASCADE`
  );
  await admin.query(
    `INSERT INTO users (id, email, "updatedAt") VALUES ($1,$2,NOW()),($3,$4,NOW())`,
    [USER_A, 'a@scope.test', USER_B, 'b@scope.test']
  );
  await admin.query(
    `INSERT INTO task_lists (id, name, "userId", "updatedAt") VALUES
       ('list_a','A list',$1,NOW()),
       ('list_a2','A second list',$1,NOW()),
       ('list_b','B list',$2,NOW())`,
    [USER_A, USER_B]
  );
  await admin.query(
    `INSERT INTO tasks (id, title, "userId", "taskListId", "updatedAt") VALUES
       ('task_a','A task',$1,'list_a',NOW()),
       ('task_b','B task',$2,'list_b',NOW())`,
    [USER_A, USER_B]
  );
  // Each tenant gets one tag that is in use and one that is not.
  await admin.query(
    `INSERT INTO tags (id, name, type, "userId") VALUES
       ('tag_a_used','used-a','LABEL',$1),
       ('tag_a_free','unused-a','LABEL',$1),
       ('tag_b_used','used-b','LABEL',$2),
       ('tag_b_free','unused-b','LABEL',$2)`,
    [USER_A, USER_B]
  );
  await admin.query(
    `INSERT INTO task_tags ("taskId","tagId",value,"displayText","iconName") VALUES
       ('task_a','tag_a_used','used-a','Used A','tag'),
       ('task_b','tag_b_used','used-b','Used B','tag')`
  );
}

describe.skipIf(!ADMIN_URL)(
  'application-level tenant scoping (RLS off)',
  () => {
    beforeAll(async () => {
      const bootstrap = new Pool({ connectionString: ADMIN_URL });
      await bootstrap.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
      await bootstrap.query(`CREATE DATABASE ${TEST_DB}`);
      await bootstrap.end();

      const url = new URL(ADMIN_URL!);
      url.pathname = `/${TEST_DB}`;
      admin = new Pool({ connectionString: url.toString() });
      await admin.query(
        readFileSync(join(HERE, 'fixtures', 'schema.sql'), 'utf8')
      );

      // Same connection, no policies, no GUC. The services get exactly the
      // database an unprotected deployment would give them.
      process.env.DATABASE_URL = url.toString();
      (globalThis as { __pgPool?: Pool }).__pgPool = undefined;

      const { TagService } = await import('../services/TagService.js');
      const { TaskService } = await import('../services/TaskService.js');
      tagService = new TagService();
      taskService = new TaskService();
    }, 120_000);

    beforeAll(async () => {
      await seed();
    });

    afterAll(async () => {
      (globalThis as { __pgPool?: Pool }).__pgPool = undefined;
      await admin?.end();
    });

    it('really has no row-level security to hide behind', async () => {
      // Anti-vacuity. If policies existed here, every assertion below would pass
      // without proving anything about the application code.
      const secured = await admin.query<{ relname: string }>(
        `SELECT relname FROM pg_class
        WHERE relrowsecurity AND relkind = 'r'
          AND relnamespace = 'public'::regnamespace`
      );
      expect(secured.rows).toEqual([]);

      // And the raw table really does hold both tenants' rows.
      const all = await admin.query<{ c: number }>(
        `SELECT count(*)::int AS c FROM tags`
      );
      expect(all.rows[0].c).toBe(4);
    });

    // --------------------------------------------------------------------------
    // The four methods that had no user predicate at all.
    // --------------------------------------------------------------------------
    it('TagService.findAll returns only the caller’s tags', async () => {
      const a = await tagService.findAll({}, ctxA);
      expect(a.map((t) => t.name).sort()).toEqual(['unused-a', 'used-a']);

      const b = await tagService.findAll({}, ctxB);
      expect(b.map((t) => t.name).sort()).toEqual(['unused-b', 'used-b']);
    });

    it('TagService.findAll stays scoped on the usage-count branch too', async () => {
      // A different SELECT list and a different join — worth its own assertion.
      const a = await tagService.findAll({ withUsageCount: true }, ctxA);
      expect(a.map((t) => t.name).sort()).toEqual(['unused-a', 'used-a']);
      expect(a.find((t) => t.name === 'used-a')?.usageCount).toBe(1);
      expect(a.find((t) => t.name === 'unused-a')?.usageCount).toBe(0);
    });

    it('TagService.getStatistics counts only the caller’s tags', async () => {
      const a = await tagService.getStatistics(ctxA);
      expect(a.totalTags).toBe(2); // not 4
      expect(a.tagsByType.LABEL).toBe(2);
      expect(a.mostUsedTags.map((m) => m.tag.name).sort()).toEqual([
        'unused-a',
        'used-a',
      ]);
    });

    it('TagService.getStatistics refuses an unauthenticated caller', async () => {
      await expect(tagService.getStatistics()).rejects.toThrow(
        'AUTHORIZATION_ERROR'
      );
    });

    it('TagService.cleanupUnusedTags deletes only the caller’s unused tags', async () => {
      await seed();
      const result = await tagService.cleanupUnusedTags(ctxA);
      expect(result.deletedTagIds).toEqual(['tag_a_free']);

      // B's unused tag is untouched. Before the predicate, this DELETE took every
      // tenant's unused tags with it.
      const remaining = await admin.query<{ id: string }>(
        `SELECT id FROM tags ORDER BY id`
      );
      expect(remaining.rows.map((r) => r.id)).toEqual([
        'tag_a_used',
        'tag_b_free',
        'tag_b_used',
      ]);
    });

    it('TagService.cleanupUnusedTags refuses an unauthenticated caller', async () => {
      await expect(tagService.cleanupUnusedTags()).rejects.toThrow(
        'AUTHORIZATION_ERROR'
      );
    });

    // --------------------------------------------------------------------------
    // Cross-tenant corruption via tag merge.
    // --------------------------------------------------------------------------
    it('merging INTO another tenant’s tag is refused', async () => {
      await seed();
      await expect(
        tagService.mergeTags(['tag_a_used'], 'tag_b_used', ctxA)
      ).rejects.toThrow('AUTHORIZATION_ERROR');

      // Nothing moved: A's pairing is intact and B's is untouched. Unrefused,
      // this repointed A's task_tags row at B's tag, and B deleting that tag
      // would then have cascaded A's row away.
      const pairs = await admin.query<{ taskId: string; tagId: string }>(
        `SELECT "taskId", "tagId" FROM task_tags ORDER BY "taskId"`
      );
      expect(pairs.rows).toEqual([
        { taskId: 'task_a', tagId: 'tag_a_used' },
        { taskId: 'task_b', tagId: 'tag_b_used' },
      ]);
    });

    it('merging FROM another tenant’s tag is refused', async () => {
      await expect(
        tagService.mergeTags(['tag_b_free'], 'tag_a_used', ctxA)
      ).rejects.toThrow('AUTHORIZATION_ERROR');

      const stillThere = await admin.query<{ c: number }>(
        `SELECT count(*)::int AS c FROM tags WHERE id = 'tag_b_free'`
      );
      expect(stillThere.rows[0].c).toBe(1);
    });

    it('merging the caller’s OWN tags still works', async () => {
      // Positive control: a check that refuses everything would satisfy the two
      // tests above and break the feature.
      await seed();
      const merged = await tagService.mergeTags(
        ['tag_a_free'],
        'tag_a_used',
        ctxA
      );
      expect(merged.id).toBe('tag_a_used');

      const gone = await admin.query<{ c: number }>(
        `SELECT count(*)::int AS c FROM tags WHERE id = 'tag_a_free'`
      );
      expect(gone.rows[0].c).toBe(0);
    });

    it('attachToTask refuses another tenant’s tag', async () => {
      await seed();
      await expect(
        tagService.attachToTask(
          {
            taskId: 'task_a',
            tagId: 'tag_b_free',
            value: 'x',
            displayText: 'X',
            iconName: 'tag',
          },
          ctxA
        )
      ).rejects.toThrow('VALIDATION_ERROR');
    });

    // --------------------------------------------------------------------------
    // Moving your own tasks into someone else's list.
    // --------------------------------------------------------------------------
    it('bulkUpdate refuses a taskListId belonging to another tenant', async () => {
      await seed();
      await expect(
        taskService.bulkUpdate(['task_a'], { taskListId: 'list_b' }, ctxA)
      ).rejects.toThrow('VALIDATION_ERROR');

      // The task stayed where it was. Unrefused, it would have moved into B's
      // list — invisible to A, and deleted outright the moment B deleted that
      // list (`tasks_taskListId_fkey ON DELETE CASCADE`).
      const where = await admin.query<{ taskListId: string }>(
        `SELECT "taskListId" FROM tasks WHERE id = 'task_a'`
      );
      expect(where.rows[0].taskListId).toBe('list_a');
    });

    it('bulkUpdate still moves tasks between the caller’s own lists', async () => {
      // Positive control for the check above.
      const updated = await taskService.bulkUpdate(
        ['task_a'],
        { taskListId: 'list_a2' },
        ctxA
      );
      expect(updated).toHaveLength(1);

      const where = await admin.query<{ taskListId: string }>(
        `SELECT "taskListId" FROM tasks WHERE id = 'task_a'`
      );
      expect(where.rows[0].taskListId).toBe('list_a2');
    });
  }
);
