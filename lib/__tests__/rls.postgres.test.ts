/**
 * Real-Postgres Row-Level-Security enforcement tests.
 *
 * Unlike the mocked service suites (which only exercise the application-level
 * `WHERE "userId" = ...` filter), these tests stand up a REAL Postgres, apply
 * the actual RLS migration (0002_enable_rls.sql), create a dedicated
 * NON-BYPASSRLS application role, and drive the ACTUAL production machinery —
 * `lib/config/database.ts` `query()`/`withTransaction()` with their
 * transaction-local `app.user_id` GUC, plus `runWithRls` — to prove RLS
 * genuinely isolates tenants at the database layer.
 *
 * Skipped entirely unless RLS_TEST_PG_ADMIN_URL points at a SUPERUSER Postgres
 * (the admin builds the schema/role/policies and seeds via bypass), e.g. a
 * throwaway Docker container:
 *
 *   docker run --rm -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
 *   RLS_TEST_PG_ADMIN_URL=postgresql://postgres:postgres@localhost:5432/postgres \
 *     npx vitest run --config vitest.backend.config.ts lib/__tests__/rls.postgres.test.ts
 *
 * so ordinary CI / desktop runs (no Postgres) stay green.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Pool, type QueryResult } from 'pg';

const ADMIN_URL = process.env.RLS_TEST_PG_ADMIN_URL;
const HERE = dirname(fileURLToPath(import.meta.url));

const APP_ROLE = 'cadence_rls_app';
const APP_PW = 'cadence_rls_app_pw';

// text (cuid-shaped) ids — the policies compare text-to-text, no ::uuid cast.
const USER_A = 'user_aaaaaaaaaaaaaaaaaaaaaa';
const USER_B = 'user_bbbbbbbbbbbbbbbbbbbbbb';

const TENANT_TABLES = [
  'calendars',
  'events',
  'task_lists',
  'tasks',
  'tags',
  'task_tags',
  'attachments',
] as const;

// The app-role connection URL, derived from the admin URL.
function appUrl(): string {
  const u = new URL(ADMIN_URL as string);
  u.username = APP_ROLE;
  u.password = APP_PW;
  return u.toString();
}

// Production query machinery, imported dynamically AFTER DATABASE_URL is
// pointed at the app role (so the cached pool connects as the non-bypass role).
let query: <T = unknown>(
  sql: string,
  params?: unknown[],
  client?: unknown
) => Promise<QueryResult<T>>;
let withTransaction: <T>(
  cb: (client: {
    query: (sql: string, params?: unknown[]) => Promise<QueryResult>;
  }) => Promise<T>
) => Promise<T>;
let runWithRls: <T>(userId: string | null, fn: () => T) => T;
let appPool: Pool;

let admin: Pool;

async function buildSchemaRoleAndPolicies(): Promise<void> {
  const schemaSql = readFileSync(join(HERE, 'fixtures', 'schema.sql'), 'utf8');
  const rlsSql = readFileSync(
    join(HERE, '..', 'config', 'migrations', '0002_enable_rls.sql'),
    'utf8'
  );

  // Clean slate.
  await admin.query('DROP SCHEMA IF EXISTS public CASCADE');
  await admin.query('CREATE SCHEMA public');

  // Drop a leftover app role from a prior run (idempotent).
  await admin.query(
    `DO $$ BEGIN
       IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${APP_ROLE}') THEN
         EXECUTE 'DROP OWNED BY ${APP_ROLE} CASCADE';
         EXECUTE 'DROP ROLE ${APP_ROLE}';
       END IF;
     END $$`
  );

  // Build the tables/indexes/FKs, then apply the REAL RLS migration.
  await admin.query(schemaSql);
  await admin.query(rlsSql);

  // Non-bypass, least-privilege app role (mirrors 0003 grants).
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

  // Seed the two tenants (users are not RLS'd; admin bypasses RLS anyway).
  await admin.query(
    `INSERT INTO users (id, email, "updatedAt") VALUES ($1,$2,NOW()),($3,$4,NOW())`,
    [USER_A, 'a@example.com', USER_B, 'b@example.com']
  );
}

// Seed each tenant's rows through the ACTUAL app role + RLS GUC, so the INSERTs
// themselves are checked by the WITH CHECK policies.
async function seedTenant(userId: string, suffix: string): Promise<void> {
  await runWithRls(userId, async () => {
    await query(
      `INSERT INTO task_lists (id, name, color, "userId", "createdAt", "updatedAt")
       VALUES ($1,$2,'#8B5CF6',$3,NOW(),NOW())`,
      [`list_${suffix}`, `List ${suffix}`, userId]
    );
    await query(
      `INSERT INTO calendars (id, name, color, "isVisible", "isDefault", "userId", "createdAt", "updatedAt")
       VALUES ($1,$2,'#3B82F6',true,false,$3,NOW(),NOW())`,
      [`cal_${suffix}`, `Cal ${suffix}`, userId]
    );
    await query(
      `INSERT INTO tasks (id, title, "userId", "taskListId", "createdAt", "updatedAt")
       VALUES ($1,$2,$3,$4,NOW(),NOW())`,
      [`task_${suffix}`, `Task ${suffix}`, userId, `list_${suffix}`]
    );
    await query(
      `INSERT INTO events (id, title, start, "end", "userId", "calendarId", "createdAt", "updatedAt")
       VALUES ($1,$2,NOW(),NOW(),$3,$4,NOW(),NOW())`,
      [`event_${suffix}`, `Event ${suffix}`, userId, `cal_${suffix}`]
    );
    // Both tenants create a tag named 'urgent' — proves per-user uniqueness.
    await query(
      `INSERT INTO tags (id, name, type, color, "userId")
       VALUES ($1,'urgent','PROJECT',NULL,$2)`,
      [`tag_${suffix}`, userId]
    );
    await query(
      `INSERT INTO attachments (id, "fileName", "fileUrl", "fileType", "fileSize", "taskId", "createdAt")
       VALUES ($1,$2,'https://example.com/f','application/pdf',10,$3,NOW())`,
      [`att_${suffix}`, `file_${suffix}.pdf`, `task_${suffix}`]
    );
    await query(
      `INSERT INTO task_tags ("taskId", "tagId", value, "displayText", "iconName")
       VALUES ($1,$2,'urgent','Urgent','flame')`,
      [`task_${suffix}`, `tag_${suffix}`]
    );
  });
}

describe.skipIf(!ADMIN_URL)('RLS enforcement (real Postgres)', () => {
  beforeAll(async () => {
    admin = new Pool({ connectionString: ADMIN_URL });
    await buildSchemaRoleAndPolicies();

    // Point the production DB module at the non-bypass app role, then import it
    // fresh so its cached pool connects as that role.
    process.env.DATABASE_URL = appUrl();
    (globalThis as { __pgPool?: Pool }).__pgPool = undefined;
    const dbmod = await import('../config/database.js');
    const rlsmod = await import('../config/rlsContext.js');
    query = dbmod.query as typeof query;
    withTransaction = dbmod.withTransaction as typeof withTransaction;
    appPool = dbmod.pool;
    runWithRls = rlsmod.runWithRls;

    await seedTenant(USER_A, 'a');
    await seedTenant(USER_B, 'b');
  }, 60_000);

  afterAll(async () => {
    if (appPool) await appPool.end();
    (globalThis as { __pgPool?: Pool }).__pgPool = undefined;
    if (admin) await admin.end();
  });

  // --------------------------------------------------------------------------
  // The role + FORCE facts the enforcement rests on.
  // --------------------------------------------------------------------------
  it('app role is NON-BYPASSRLS and all 7 tenant tables are FORCE RLS', async () => {
    const bypass = await admin.query(
      `SELECT rolbypassrls FROM pg_roles WHERE rolname=$1`,
      [APP_ROLE]
    );
    expect(bypass.rows[0].rolbypassrls).toBe(false);

    const forced = await admin.query(
      `SELECT relname, relforcerowsecurity, relrowsecurity
         FROM pg_class
        WHERE relname = ANY($1) AND relnamespace = 'public'::regnamespace`,
      [TENANT_TABLES as unknown as string[]]
    );
    expect(forced.rows).toHaveLength(TENANT_TABLES.length);
    for (const row of forced.rows) {
      expect(row.relrowsecurity, `${row.relname} ENABLE`).toBe(true);
      expect(row.relforcerowsecurity, `${row.relname} FORCE`).toBe(true);
    }
  });

  // --------------------------------------------------------------------------
  // Guarantee 1: with the GUC set, a tenant sees ONLY its own rows.
  // --------------------------------------------------------------------------
  it('with GUC set, each tenant reads only its own direct-owned rows', async () => {
    const aTasks = await runWithRls(USER_A, () =>
      query<{ id: string }>(`SELECT id FROM tasks ORDER BY id`)
    );
    expect(aTasks.rows.map((r) => r.id)).toEqual(['task_a']);

    const bTasks = await runWithRls(USER_B, () =>
      query<{ id: string }>(`SELECT id FROM tasks ORDER BY id`)
    );
    expect(bTasks.rows.map((r) => r.id)).toEqual(['task_b']);

    const aCal = await runWithRls(USER_A, () =>
      query<{ id: string }>(`SELECT id FROM calendars ORDER BY id`)
    );
    expect(aCal.rows.map((r) => r.id)).toEqual(['cal_a']);

    const aLists = await runWithRls(USER_A, () =>
      query<{ id: string }>(`SELECT id FROM task_lists ORDER BY id`)
    );
    expect(aLists.rows.map((r) => r.id)).toEqual(['list_a']);

    const aEvents = await runWithRls(USER_A, () =>
      query<{ id: string }>(`SELECT id FROM events ORDER BY id`)
    );
    expect(aEvents.rows.map((r) => r.id)).toEqual(['event_a']);
  });

  // --------------------------------------------------------------------------
  // Guarantee 2: without any context, insert is rejected + reads are empty.
  // --------------------------------------------------------------------------
  it('without RLS context, INSERT is rejected (fail-closed WITH CHECK)', async () => {
    await expect(
      query(
        `INSERT INTO tasks (id, title, "userId", "taskListId", "createdAt", "updatedAt")
         VALUES ('ghost','Ghost',$1,'list_a',NOW(),NOW())`,
        [USER_A]
      )
    ).rejects.toThrow();
  });

  it('without RLS context, SELECT returns nothing (fail-closed USING)', async () => {
    const res = await query<{ id: string }>(`SELECT id FROM tasks`);
    expect(res.rows).toEqual([]);
  });

  // --------------------------------------------------------------------------
  // Guarantee 3: the DB (not an app filter) isolates tenants — raw, UNFILTERED
  // count under B is bounded to B's own rows.
  // --------------------------------------------------------------------------
  it('raw unfiltered count under B counts only B rows (DB-enforced)', async () => {
    const tasks = await runWithRls(USER_B, () =>
      query<{ c: number }>(`SELECT count(*)::int AS c FROM tasks`)
    );
    expect(tasks.rows[0].c).toBe(1);

    const events = await runWithRls(USER_B, () =>
      query<{ c: number }>(`SELECT count(*)::int AS c FROM events`)
    );
    expect(events.rows[0].c).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Join-owned tables: attachments + task_tags are scoped via the parent task.
  // --------------------------------------------------------------------------
  it('attachments are visible only via the owning task', async () => {
    const a = await runWithRls(USER_A, () =>
      query<{ id: string }>(`SELECT id FROM attachments ORDER BY id`)
    );
    expect(a.rows.map((r) => r.id)).toEqual(['att_a']);

    const bCount = await runWithRls(USER_B, () =>
      query<{ c: number }>(`SELECT count(*)::int AS c FROM attachments`)
    );
    expect(bCount.rows[0].c).toBe(1); // only att_b, never att_a
  });

  it('task_tags are visible only via the owning task', async () => {
    const a = await runWithRls(USER_A, () =>
      query<{ tagId: string }>(`SELECT "tagId" FROM task_tags ORDER BY "tagId"`)
    );
    expect(a.rows.map((r) => r.tagId)).toEqual(['tag_a']);

    const bCount = await runWithRls(USER_B, () =>
      query<{ c: number }>(`SELECT count(*)::int AS c FROM task_tags`)
    );
    expect(bCount.rows[0].c).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Per-user tags: both tenants own an 'urgent' tag; each sees only its own.
  // --------------------------------------------------------------------------
  it('tags are per-user: both own "urgent", neither sees the other', async () => {
    const a = await runWithRls(USER_A, () =>
      query<{ id: string }>(
        `SELECT id FROM tags WHERE name='urgent' ORDER BY id`
      )
    );
    expect(a.rows.map((r) => r.id)).toEqual(['tag_a']);

    const b = await runWithRls(USER_B, () =>
      query<{ id: string }>(
        `SELECT id FROM tags WHERE name='urgent' ORDER BY id`
      )
    );
    expect(b.rows.map((r) => r.id)).toEqual(['tag_b']);

    const aCount = await runWithRls(USER_A, () =>
      query<{ c: number }>(`SELECT count(*)::int AS c FROM tags`)
    );
    expect(aCount.rows[0].c).toBe(1);
  });

  // --------------------------------------------------------------------------
  // Pooling safety: the tx-local GUC never leaks across users on a reused pool.
  // --------------------------------------------------------------------------
  it('GUC does not leak across users on the reused pool', async () => {
    // B first: must see zero of A's rows.
    const bCount = await runWithRls(USER_B, () =>
      query<{ c: number }>(
        `SELECT count(*)::int AS c FROM tasks WHERE id='task_a'`
      )
    );
    expect(bCount.rows[0].c).toBe(0);

    // Re-enter A on the same pool: still sees exactly A's row (no stale/empty
    // GUC left on the reused physical connection).
    const aCount = await runWithRls(USER_A, () =>
      query<{ c: number }>(
        `SELECT count(*)::int AS c FROM tasks WHERE id='task_a'`
      )
    );
    expect(aCount.rows[0].c).toBe(1);

    // And a no-context query immediately after sees nothing (GUC discarded).
    const none = await query<{ c: number }>(
      `SELECT count(*)::int AS c FROM tasks`
    );
    expect(none.rows[0].c).toBe(0);
  });

  // --------------------------------------------------------------------------
  // Multiple statements inside one runWithRls all enforce (each query()
  // re-applies the GUC in its own short transaction).
  // --------------------------------------------------------------------------
  it('multiple queries in one runWithRls are all scoped', async () => {
    await runWithRls(USER_A, async () => {
      const t = await query<{ c: number }>(
        `SELECT count(*)::int AS c FROM tasks`
      );
      const e = await query<{ c: number }>(
        `SELECT count(*)::int AS c FROM events`
      );
      const g = await query<{ c: number }>(
        `SELECT count(*)::int AS c FROM tags`
      );
      expect(t.rows[0].c).toBe(1);
      expect(e.rows[0].c).toBe(1);
      expect(g.rows[0].c).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // withTransaction sets the GUC at BEGIN, so raw client.query() inside it
  // (the DELETE /api/account pattern) is scoped too.
  // --------------------------------------------------------------------------
  it('withTransaction scopes raw client.query via GUC at BEGIN', async () => {
    const count = await runWithRls(USER_A, () =>
      withTransaction(async (client) => {
        const r = await client.query(`SELECT count(*)::int AS c FROM tasks`);
        return (r.rows[0] as { c: number }).c;
      })
    );
    expect(count).toBe(1);
  });
});
