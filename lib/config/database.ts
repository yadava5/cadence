/**
 * Database configuration for Vercel API routes (Pure SQL via pg)
 */
import {
  Pool,
  types,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from 'pg';
import { SUPABASE_CA } from './supabaseCA.js';
import { getRlsUserId } from './rlsContext.js';

/**
 * TLS for the DB connection. Against Supabase we pin the Supabase Root
 * 2021 CA and REQUIRE certificate verification (rejectUnauthorized),
 * closing the MITM exposure of the old `sslmode=no-verify`. For a local
 * Postgres (no supabase/pooler in the host) TLS is left off.
 */
function resolveSsl(
  url: string
): false | { ca: string; rejectUnauthorized: true } {
  if (/supabase\.com|pooler\.supabase/.test(url)) {
    return { ca: SUPABASE_CA, rejectUnauthorized: true };
  }
  return false;
}

// Configure pg to parse TIMESTAMP WITHOUT TIME ZONE as UTC
// PostgreSQL TIMESTAMP WITHOUT TIME ZONE strips timezone info.
// By default, pg interprets returned timestamps as local time, which is incorrect.
// We need to interpret them as UTC since that's what we store.
// Type OID 1114 = TIMESTAMP (without time zone)
types.setTypeParser(1114, (stringValue: string) => {
  // Append 'Z' to indicate UTC when parsing
  return new Date(stringValue + 'Z');
});

// Database configuration object
export const databaseConfig = {
  url:
    process.env.DATABASE_URL ||
    'postgresql://localhost:5432/react_calendar_dev',
  maxConnections: parseInt(process.env.DATABASE_MAX_CONNECTIONS || '10'),
  connectionTimeout: parseInt(process.env.DATABASE_TIMEOUT || '10000'),
  queryTimeout: parseInt(process.env.DATABASE_QUERY_TIMEOUT || '60000'),
};

// Global pool (cached in dev to avoid multiple instances during HMR)
declare global {
  var __pgPool: Pool | undefined;
}

const createPool = () => {
  const p = new Pool({
    connectionString: databaseConfig.url,
    max: databaseConfig.maxConnections,
    idleTimeoutMillis: databaseConfig.connectionTimeout,
    // Fail a stuck connect fast instead of hanging the whole request.
    connectionTimeoutMillis: databaseConfig.connectionTimeout,
    ssl: resolveSsl(databaseConfig.url),
    // Pin the schema for every connection this pool hands out. Cadence's
    // SQL uses unqualified table names (FROM users, FROM tasks, ...), and it
    // co-tenants a Supabase pooler with an app that connects as
    // `?schema=lifequest`. Without this, a pooled server connection left on
    // search_path=lifequest would resolve our unqualified queries against the
    // wrong schema → intermittent "relation ... does not exist" 500s. Setting
    // `options` also makes our connections un-shareable with the other tenant's
    // (the pooler keys server connections by startup parameters).
    // Single-token form (matches how Prisma sends `?schema=`), so the Supabase
    // pooler forwards it cleanly AND keys our server connections separately
    // from the co-tenant's `search_path=lifequest` ones — they never share.
    options: '--search_path=public',
  });
  // pg pools emit 'error' from IDLE clients (e.g. the Supabase pooler reaping a
  // server connection). With no listener, Node treats it as an unhandled
  // 'error' event and crashes the function → intermittent 500s. Swallow-and-log
  // instead; the pool transparently opens a fresh connection on the next query.
  p.on('error', (err) => {
    console.error('pg pool idle-client error (non-fatal):', err.message);
  });
  return p;
};

export const pool: Pool = globalThis.__pgPool || createPool();

// Cache the pool across warm serverless invocations (Fluid Compute reuses
// instances) so every request reuses one healthy, error-handled pool.
globalThis.__pgPool = pool;

export type SqlClient = Pool | PoolClient;

export async function initDatabase(): Promise<void> {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('✅ Database connected successfully (API)');
  } catch (error) {
    console.error('❌ Database connection failed (API):', error);
    throw error;
  }
}

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const { rows } = await pool.query('SELECT 1');
    return rows.length === 1;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

export async function cleanupDatabase(): Promise<void> {
  try {
    await pool.end();
    console.log('✅ Database disconnected successfully (API)');
  } catch (error) {
    console.error('❌ Database disconnection failed (API):', error);
  }
}

// A dropped/reaped pooler connection surfaces as a connection-level error the
// first time pg touches it. These are safe to retry once on a pooled query
// (the retry draws a fresh connection); they are NOT retried inside a caller's
// own transaction (a passed-in `client`), where a mid-transaction reconnect
// would be incorrect.
function isTransientConnectionError(error: unknown): boolean {
  const e = error as { message?: string; code?: string };
  const msg = e?.message ?? '';
  return (
    /Connection terminated|connection terminated unexpectedly|server closed the connection|read ECONNRESET|Client has encountered a connection error|timeout expired|ETIMEDOUT|ECONNRESET|EPIPE/i.test(
      msg
    ) || e?.code === 'ECONNRESET'
  );
}

// Distinguish a real transaction client (a PoolClient checked out by
// `withTransaction`) from the pool. Services pass `this.db` — which IS the Pool
// — as the 3rd `client` arg on every call, so a Pool passed here must be
// treated identically to "no client" (route it through the RLS GUC path);
// only a genuine PoolClient means "caller already owns a transaction with the
// GUC set", so we run on it directly.
const isPool = (c: SqlClient): c is Pool => c instanceof Pool;

// Simple query helper.
//
// RLS wiring: tenant tables enforce FORCE ROW LEVEL SECURITY keyed on the
// transaction-local `app.user_id` GUC. A plain pooled autocommit query cannot
// carry that GUC safely (the pooler shares physical connections across
// tenants), so when an RLS identity is bound to the async context we run the
// statement inside a short transaction that sets `app.user_id` locally, runs
// the query, and commits — the GUC is discarded at COMMIT and never leaks.
//
// When no identity is bound (pre-auth login/register, health checks, or the
// non-RLS auth pool paths) we keep the original plain-pooled behaviour so those
// flows are unaffected. Under FORCE RLS such a query sees no rows / is rejected
// on the tenant tables, which is the intended fail-closed posture.
//
// The row generic defaults to `QueryResultRow` (pg's `{ [column: string]: any }`)
// rather than `unknown`. Nearly every caller writes `const res = await query(...)`
// with no explicit type and then reads `res.rows[0].id`; with an `unknown`
// default that is an error in every one of them, and several of those callers
// live in files owned by other work in flight. pg constrains its own row
// generic to `QueryResultRow`, which an *interface* (e.g. `EventEntity`) never
// satisfies — interfaces get no implicit index signature — so the generic is
// carried by us and applied at the driver boundary with a cast.
export async function query<T = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  client?: SqlClient
): Promise<QueryResult<T>> {
  // A real transaction client already runs inside a BEGIN whose GUC was set at
  // transaction start (see withTransaction) — use it directly, and never retry
  // (a mid-transaction reconnect would be incorrect).
  if (client && !isPool(client)) {
    return (client as PoolClient).query(sql, params) as Promise<QueryResult<T>>;
  }

  const userId = getRlsUserId();
  if (!userId) {
    try {
      return (await pool.query(sql, params)) as QueryResult<T>;
    } catch (error) {
      if (isTransientConnectionError(error)) {
        console.warn('pg transient error, retrying query once:', String(error));
        return pool.query(sql, params) as Promise<QueryResult<T>>;
      }
      throw error;
    }
  }
  return runGucTx<T>(userId, sql, params);
}

// Run a single statement inside a short transaction that binds `app.user_id`
// transaction-locally, so RLS policies resolve to `userId` for exactly this
// statement. The BEGIN, SET, statement, and COMMIT are pipelined (issued
// without awaiting each round-trip in turn) to keep this to a single network
// flight — important on the latency-sensitive serverless path.
async function runGucTx<T>(
  userId: string,
  sql: string,
  params: unknown[],
  attempt = 0
): Promise<QueryResult<T>> {
  const c = await pool.connect();
  // Guard against double-release: on the transient-retry path we release the
  // broken client eagerly (so it is destroyed before we draw a fresh one), and
  // the `finally` must not release it a second time (pg throws on that).
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    c.release();
  };
  try {
    const begin = c.query('BEGIN');
    const setcfg = c.query("SELECT set_config('app.user_id', $1, true)", [
      userId,
    ]);
    const result = c.query(sql, params) as Promise<QueryResult<T>>;
    const commit = c.query('COMMIT');
    await begin;
    await setcfg;
    const r = await result;
    await commit;
    return r;
  } catch (error) {
    try {
      await c.query('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    // A dropped/reaped pooler connection surfaces on the first touch; retry
    // once on a fresh connection (the whole tx is replayed — safe, nothing
    // committed).
    if (isTransientConnectionError(error) && attempt === 0) {
      console.warn(
        'pg transient error, retrying RLS query once:',
        String(error)
      );
      release();
      return runGucTx<T>(userId, sql, params, 1);
    }
    throw error;
  } finally {
    release();
  }
}

// Transaction helper for API routes.
//
// RLS wiring: bind `app.user_id` transaction-locally right after BEGIN so every
// statement the callback runs on this client — including raw `client.query(...)`
// calls that bypass the `query()` helper (e.g. DELETE /api/account) — is scoped
// by RLS to the request's user. The GUC is discarded at COMMIT/ROLLBACK, so it
// never leaks across the shared pooler. When no identity is bound the GUC is
// left unset (fail-closed on tenant tables; the non-RLS auth-pool paths are
// unaffected).
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  const userId = getRlsUserId();
  try {
    await client.query('BEGIN');
    if (userId) {
      await client.query("SELECT set_config('app.user_id', $1, true)", [
        userId,
      ]);
    }
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    throw error;
  } finally {
    client.release();
  }
}

// NOTE: no `process.on('beforeExit')` pool teardown here. Under Fluid Compute a
// warm instance is reused across requests, and `beforeExit` fires whenever the
// event loop drains between requests — ending the pool there would leave the
// next reused invocation querying an already-ended pool ("Cannot use a pool
// after calling end") → intermittent 500s. Let the platform reap connections.

export default pool;
