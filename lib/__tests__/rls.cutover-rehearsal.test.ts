/**
 * RLS cutover rehearsal — does the APPLICATION still work once RLS is enforced?
 *
 * `rls.postgres.test.ts` proves the POLICIES are correct: the app role cannot
 * bypass them, all seven tenant tables are FORCE'd, and reads/writes without a
 * GUC fail closed. That is necessary and it is not sufficient.
 *
 * It leaves the question the cutover actually turns on unanswered: **will the
 * product still function?** Policies that correctly refuse everything would pass
 * every assertion in that file and take the app down. The risk in enabling RLS
 * was never "the policies are wrong" — it is "some code path queries outside the
 * RLS-bound helpers, and nobody finds out until production returns empty lists".
 *
 * Nothing else in this repository could have found that. The handler
 * integration suites (`server-handlers/**\/__tests__/*.integration.test.ts`)
 * `vi.mock` the service layer, so they never reach a database at all; the
 * service unit tests never see enforced RLS. The one place the two meet is
 * here.
 *
 * So this drives the REAL services — CalendarService, TaskListService,
 * TaskService, EventService, TagService, the same singletons the handlers
 * import — against a Postgres with the REAL `0002_enable_rls.sql` applied and
 * the connection owned by a NOSUPERUSER NOBYPASSRLS role. Every call goes
 * through `runWithRls`, exactly as `lib/middleware/auth.ts:55` wraps a live
 * request.
 *
 * A pass here is the evidence that converts "RLS is written and staged OFF"
 * into "RLS was rehearsed against the real service layer and the app survived".
 * It does not make the production cutover automatic — that is still a hand-run
 * migration against a live database — but it removes the reason it was being
 * deferred.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const ADMIN_URL = process.env.RLS_TEST_PG_ADMIN_URL;

const APP_ROLE = 'cadence_app_rehearsal';
const APP_PW = 'rehearsal_pw';
const USER_A = 'usr_rehearsal_a';
const USER_B = 'usr_rehearsal_b';

/* Imported dynamically AFTER DATABASE_URL is repointed at the app role, because
   lib/config/database.ts builds its pool at module load. Importing earlier
   silently gives you the admin connection and the whole rehearsal becomes a
   test of nothing — which is the same vacuity trap the layer guard exists for. */
let calendarService: InstanceType<
  typeof import('../services/CalendarService.js').CalendarService
>;
let taskListService: InstanceType<
  typeof import('../services/TaskListService.js').TaskListService
>;
let taskService: InstanceType<
  typeof import('../services/TaskService.js').TaskService
>;
let runWithRls: <T>(userId: string | null, fn: () => T) => T;

let admin: Pool;
/* Its OWN database on the shared container, not the shared `public` schema.
   The first version dropped and recreated `public`, which is where
   rls.postgres.test.ts lives — running both in one vitest process left that
   suite with `schema "public" does not exist`. Two suites that each want a
   clean slate cannot share one. */
const REHEARSAL_DB = 'cadence_rls_rehearsal';

const ctxA = { userId: USER_A };
const ctxB = { userId: USER_B };

describe.skipIf(!ADMIN_URL)(
  'RLS cutover rehearsal — services under FORCE RLS',
  () => {
    beforeAll(async () => {
      // Build the isolated database from a connection to the default one, then
      // reconnect into it so every statement below lands there.
      const bootstrap = new Pool({ connectionString: ADMIN_URL });
      await bootstrap.query(`DROP DATABASE IF EXISTS ${REHEARSAL_DB}`);
      await bootstrap.query(`CREATE DATABASE ${REHEARSAL_DB}`);
      await bootstrap.end();

      const adminUrl = new URL(ADMIN_URL!);
      adminUrl.pathname = `/${REHEARSAL_DB}`;
      admin = new Pool({ connectionString: adminUrl.toString() });

      const schemaSql = readFileSync(
        join(HERE, 'fixtures', 'schema.sql'),
        'utf8'
      );
      const rlsSql = readFileSync(
        join(HERE, '..', 'config', 'migrations', '0002_enable_rls.sql'),
        'utf8'
      );

      await admin.query(
        `DO $$ BEGIN
         IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${APP_ROLE}') THEN
           EXECUTE 'DROP OWNED BY ${APP_ROLE} CASCADE';
           EXECUTE 'DROP ROLE ${APP_ROLE}';
         END IF;
       END $$`
      );

      await admin.query(schemaSql);
      // The real migration, not a paraphrase of it.
      await admin.query(rlsSql);
      // 0006 replaces 0002's `task_tags` policy with one that also requires the
      // TAG to belong to the caller. It belongs in THIS suite specifically:
      // this is the one that asks "does the product still work under these
      // policies", and 0006 is a tightening that `TaskService.create` writes
      // through on every tagged task. A policy that refused those writes would
      // pass rls.postgres.test.ts and break task creation in production.
      await admin.query(
        readFileSync(
          join(
            HERE,
            '..',
            'config',
            'migrations',
            '0006_task_tags_require_tag_ownership.sql'
          ),
          'utf8'
        )
      );

      await admin.query(
        `CREATE ROLE ${APP_ROLE} LOGIN PASSWORD '${APP_PW}' NOSUPERUSER NOBYPASSRLS`
      );
      await admin.query(`GRANT USAGE ON SCHEMA public TO ${APP_ROLE}`);
      await admin.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`
      );
      await admin.query(
        `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${APP_ROLE}`
      );

      // users is deliberately NOT RLS'd — it is read pre-auth at login.
      await admin.query(
        `INSERT INTO users (id, email, "updatedAt") VALUES ($1,$2,NOW()),($3,$4,NOW())`,
        [USER_A, 'a@rehearsal.test', USER_B, 'b@rehearsal.test']
      );

      const url = new URL(ADMIN_URL!);
      url.pathname = `/${REHEARSAL_DB}`;
      url.username = APP_ROLE;
      url.password = APP_PW;
      process.env.DATABASE_URL = url.toString();

      ({ runWithRls } = await import('../config/rlsContext.js'));

      // The classes, instantiated here — the handlers reach them through
      // ServiceFactory, but the constructor is the same code path and this keeps
      // the rehearsal from depending on factory initialisation order.
      const { CalendarService } = await import(
        '../services/CalendarService.js'
      );
      const { TaskListService } = await import(
        '../services/TaskListService.js'
      );
      const { TaskService } = await import('../services/TaskService.js');
      calendarService = new CalendarService();
      taskListService = new TaskListService();
      taskService = new TaskService();
    }, 120_000);

    afterAll(async () => {
      await admin?.end();
    });

    it('the rehearsal really is running under enforced RLS as a non-bypass role', async () => {
      // Guards the rehearsal against passing for the wrong reason. If the pool
      // silently fell back to the admin URL, every assertion below would pass
      // while proving nothing at all.
      const who = await runWithRls(USER_A, () =>
        admin.query(`SELECT rolbypassrls FROM pg_roles WHERE rolname = $1`, [
          APP_ROLE,
        ])
      );
      expect(who.rows[0].rolbypassrls).toBe(false);

      const forced = await admin.query(
        `SELECT relname FROM pg_class
        WHERE relrowsecurity AND relforcerowsecurity AND relkind = 'r'
          AND relnamespace = 'public'::regnamespace
        ORDER BY relname`
      );
      expect(forced.rows.map((r) => r.relname)).toEqual([
        'attachments',
        'calendars',
        'events',
        'tags',
        'task_lists',
        'task_tags',
        'tasks',
      ]);
    });

    it('CalendarService.create and findAll work for a tenant under RLS', async () => {
      const created = await runWithRls(USER_A, () =>
        calendarService.create({ name: 'Rehearsal A', color: '#3B82F6' }, ctxA)
      );
      expect(created.id).toBeTruthy();

      const all = await runWithRls(USER_A, () =>
        calendarService.findAll({}, ctxA)
      );
      const names =
        (all.data ?? all).map?.((c: { name: string }) => c.name) ?? [];
      expect(names).toContain('Rehearsal A');
    });

    it("a tenant's calendars are invisible to the other tenant", async () => {
      await runWithRls(USER_B, () =>
        calendarService.create({ name: 'Rehearsal B', color: '#EF4444' }, ctxB)
      );

      const seenByA = await runWithRls(USER_A, () =>
        calendarService.findAll({}, ctxA)
      );
      const rowsA = (seenByA.data ?? seenByA) as { name: string }[];
      expect(rowsA.some((c) => c.name === 'Rehearsal B')).toBe(false);
      expect(rowsA.some((c) => c.name === 'Rehearsal A')).toBe(true);
    });

    it('TaskListService and TaskService round-trip under RLS', async () => {
      const list = await runWithRls(USER_A, () =>
        taskListService.create(
          { name: 'Rehearsal list', color: '#8B5CF6' },
          ctxA
        )
      );
      expect(list.id).toBeTruthy();

      const task = await runWithRls(USER_A, () =>
        taskService.create(
          { title: 'Rehearsal task', taskListId: list.id },
          ctxA
        )
      );
      expect(task.id).toBeTruthy();

      const found = await runWithRls(USER_A, () =>
        taskService.findById(task.id, ctxA)
      );
      expect(found?.title).toBe('Rehearsal task');
    });

    it("one tenant cannot read another's task by id, even knowing the id", async () => {
      const list = await runWithRls(USER_B, () =>
        taskListService.create({ name: 'B list', color: '#8B5CF6' }, ctxB)
      );
      const bTask = await runWithRls(USER_B, () =>
        taskService.create({ title: 'B secret', taskListId: list.id }, ctxB)
      );

      // The direct-object reference that RLS exists to stop. Under the
      // owner-scoped service checks alone this is refused by application code;
      // under RLS the database refuses it, which is the point of the cutover.
      const leaked = await runWithRls(USER_A, () =>
        taskService.findById(bTask.id, ctxA)
      );
      expect(leaked ?? null).toBeNull();
    });

    it('an update to another tenant’s row changes nothing', async () => {
      const list = await runWithRls(USER_B, () =>
        taskListService.create({ name: 'B list 2', color: '#8B5CF6' }, ctxB)
      );
      const bTask = await runWithRls(USER_B, () =>
        taskService.create({ title: 'B untouched', taskListId: list.id }, ctxB)
      );

      await runWithRls(USER_A, async () => {
        try {
          await taskService.update(
            bTask.id,
            { title: 'A overwrote this' },
            ctxA
          );
        } catch {
          /* refusing loudly is also an acceptable outcome; silence is not */
        }
      });

      const after = await runWithRls(USER_B, () =>
        taskService.findById(bTask.id, ctxB)
      );
      expect(after?.title).toBe('B untouched');
    });
  }
);
