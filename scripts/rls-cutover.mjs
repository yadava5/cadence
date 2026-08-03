/**
 * One-shot RLS cutover: rotate cadence_app's password, prove the new credential
 * actually works, and only then repoint Vercel at it.
 *
 * The ordering is the whole point. Rotating and switching blindly can fail in a
 * way that returns EMPTY LISTS rather than errors -- the app looks up, the data
 * looks gone. So every check runs against the real pooler first, and Vercel is
 * touched only if all of them pass.
 *
 *   NEW_DB_PASSWORD='...' node scripts/rls-cutover.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';

/* NEW_DB_PASSWORD rotates to that value first. DB_PASSWORD skips the rotation
   and uses a password already set by hand -- same verification either way, and
   the verification is the part that matters. */
const ROTATE = Boolean(process.env.NEW_DB_PASSWORD);
const PW = process.env.NEW_DB_PASSWORD || process.env.DB_PASSWORD;
const APP_ROLE = 'cadence_app';
const say = (m) => console.log(m);
const die = (m) => { console.error(`\n  ABORTED: ${m}\n  Vercel was NOT changed.\n`); process.exit(1); };

if (!PW || PW.includes('PASTE'))
  die('set DB_PASSWORD to the password you already gave cadence_app, or NEW_DB_PASSWORD to rotate it first');
if (ROTATE && PW.length < 16)
  die('NEW_DB_PASSWORD should be at least 16 characters');

const sh = (c, a, o = {}) => execFileSync(c, a, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...o });
const tmp = join(process.cwd(), '.env.cutover.tmp');

say('1/6  reading the current production DATABASE_URL');
sh('vercel', ['env', 'pull', tmp, '--environment=production', '--yes']);
const OLD = (readFileSync(tmp, 'utf8').match(/^DATABASE_URL="?(.+?)"?$/m) || [])[1];
rmSync(tmp, { force: true });
if (!OLD) die('no DATABASE_URL found in the production environment');

const backup = join(homedir(), 'cadence-DATABASE_URL-rollback.txt');
writeFileSync(backup, OLD + '\n', { mode: 0o600 });
say(`     old value saved to ${backup}`);

const u = new URL(OLD);
if (u.username.startsWith(APP_ROLE)) die(`already switched to ${APP_ROLE} -- nothing to do`);
const ref = u.username.split('.').slice(1).join('.');
if (!ref) die(`cannot derive the project ref from username "${u.username}"`);

const nu = new URL(OLD);
nu.username = `${APP_ROLE}.${ref}`;
nu.password = encodeURIComponent(PW);
const NEW = nu.toString();

const ssl = { rejectUnauthorized: false };
say(ROTATE ? '2/6  rotating the password' : '2/6  using the password already set (no rotation)');
const admin = new pg.Pool({ connectionString: OLD, ssl, max: 1 });
if (ROTATE) await admin.query(`ALTER ROLE ${APP_ROLE} WITH PASSWORD $1`, [PW]);

say('3/6  reading ground truth as the current (bypassrls) role');
const truth = (await admin.query(
  `SELECT t."userId" o, count(*)::int tasks,
     (SELECT count(*)::int FROM calendars c WHERE c."userId"=t."userId") cals,
     (SELECT count(*)::int FROM tags g WHERE g."userId"=t."userId") tags
   FROM tasks t GROUP BY 1 ORDER BY 2 DESC LIMIT 1`)).rows[0];
await admin.end();
if (!truth) die('no tasks found -- refusing to verify against an empty database');
say(`     tenant ${truth.o.slice(0, 8)}...  tasks=${truth.tasks} calendars=${truth.cals} tags=${truth.tags}`);

say('4/6  verifying the NEW credential through the production pooler');
const app = new pg.Pool({ connectionString: NEW, ssl, max: 2 });
try {
  const who = (await app.query(
    `select current_user u,(select rolbypassrls from pg_roles where rolname=current_user) b`)).rows[0];
  if (who.u !== APP_ROLE) die(`connected as "${who.u}", expected "${APP_ROLE}"`);
  if (who.b !== false) die(`${APP_ROLE} has BYPASSRLS -- the policies would be inert`);
  say(`     connected as ${who.u}, bypassrls=false`);

  const c = await app.connect();
  let got, unbound;
  try {
    await c.query('BEGIN');
    await c.query(`select set_config('app.user_id',$1,true)`, [truth.o]);
    got = {
      tasks: (await c.query('select count(*)::int n from tasks')).rows[0].n,
      cals: (await c.query('select count(*)::int n from calendars')).rows[0].n,
      tags: (await c.query('select count(*)::int n from tags')).rows[0].n,
    };
    await c.query('COMMIT');
    await c.query('BEGIN');
    unbound = (await c.query('select count(*)::int n from tasks')).rows[0].n;
    await c.query('COMMIT');
  } finally { c.release(); }

  if (got.tasks !== truth.tasks || got.cals !== truth.cals || got.tags !== truth.tags)
    die(`scoped read returned tasks=${got.tasks} calendars=${got.cals} tags=${got.tags}, expected ${truth.tasks}/${truth.cals}/${truth.tags}. The GUC is not reaching the query -- this is the empty-list failure. Do not switch.`);
  say(`     scoped read tasks=${got.tasks} calendars=${got.cals} tags=${got.tags}  (exact match)`);

  if (unbound !== 0) die(`without app.user_id the role still sees ${unbound} tasks -- RLS is not failing closed`);
  say('     fail-closed: 0 rows without app.user_id');
} finally { await app.end(); }

say('5/6  all checks passed -- repointing Vercel production');
try { sh('vercel', ['env', 'rm', 'DATABASE_URL', 'production', '--yes']); } catch { /* absent is fine */ }
sh('vercel', ['env', 'add', 'DATABASE_URL', 'production'], { input: NEW });

say('6/6  redeploying (env vars bind at build time)');
const out = sh('vercel', ['--prod']);
say(out.trim().split('\n').slice(-3).join('\n'));

say(`\n  DONE. Cadence now runs as ${APP_ROLE} with RLS enforced by the database.`);
say(`  Roll back with:  vercel env rm DATABASE_URL production --yes && \\`);
say(`                   vercel env add DATABASE_URL production < ${backup} && vercel --prod\n`);
