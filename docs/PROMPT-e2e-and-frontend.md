# Prompt — Cadence E2E coverage + frontend design audit

Paste everything below the line into a fresh chat, from the Cadence repo.

---

I'm working on **Cadence** (`~/Documents/Projects/taskflow-calendar-main`), a
calendar/task app. Next.js-era React frontend, Node service layer over Postgres
(Supabase), deployed on Vercel at `https://www.usecadenceapp.com`.

I want two things: **a real end-to-end test suite**, and **a design audit of the
left sidebar's mini-calendar**. Do the E2E work first.

## Context you need before you start

The database was just migrated and hardened, and that migration broke production
in a way 550 passing backend tests did not catch. This is the exact gap the E2E
suite exists to close, so understand it before writing tests.

- **Tags are now per-user.** `tags.userId` is `NOT NULL` with an FK to `users`.
  Uniqueness moved from a global unique-on-`name` to a unique index on
  `("userId", name)` called `tags_userId_name_key`. Any code arbitrating
  `ON CONFLICT (name)` or looking a tag up by name alone is wrong.
- **RLS is enforced in production.** Seven tenant tables (`tasks`, `calendars`,
  `events`, `tags`, `task_lists`, `task_tags`, `attachments`) have `ENABLE` +
  `FORCE ROW LEVEL SECURITY` and 22 policies. The app connects as `cadence_app`,
  which is `NOSUPERUSER NOBYPASSRLS`, and every request runs inside
  `runWithRls` — `BEGIN`, `set_config('app.user_id', <uid>, true)`, statement,
  `COMMIT`, on one dedicated pooled client.
- **`users` and `user_profiles` are deliberately NOT RLS'd.** They are read
  before authentication; a policy keyed on `app.user_id` would deadlock login.
- **The failure mode to hunt is silence.** If the GUC stops reaching a query,
  reads return **zero rows rather than raising**. The app renders empty lists and
  looks like data loss. Assertions must therefore check _expected content_, never
  just "no error" or "page loaded".

Read `docs/RLS-CUTOVER.md` for the full picture.

### The two bugs that motivated this, both missed by unit tests

1. `TaskService` kept a _private inline copy_ of the tag upsert, separate from
   `TagService`. When uniqueness moved, only `TagService` was updated. Creating
   any task with a tag failed in production with `there is no unique or
exclusion constraint matching the ON CONFLICT specification` while the whole
   backend suite stayed green — the tests exercised `TagService`, and nothing
   exercised `TaskService`'s copy against a real database.
2. A migration's rehearsal fixture built a constraint with
   `ALTER TABLE ... ADD CONSTRAINT` where production had a bare
   `CREATE UNIQUE INDEX`. `DROP CONSTRAINT IF EXISTS` silently no-ops against an
   index, so the rehearsal exercised a code path production did not have. Four
   live tags were deleted.

The lesson both times: **a suite that never touches the real schema proves very
little.** Prefer tests that run against a real Postgres with the real migrations
applied, over more mocked service tests.

## Task 1 — the E2E suite

Build a Playwright suite that drives the actual UI against a real backend and a
real database. Do not mock the service layer.

Cover at minimum:

**Auth** — sign up, log in, log out, session persistence across reload, and
access to a protected route while logged out.

**Tasks** — create plain; create _with one tag_; create _with several tags_;
create with a tag that already exists (the `ON CONFLICT` path — this is bug #1
and must have a dedicated test); edit title; change priority; set and clear a
due date; complete and uncomplete; delete; move between task lists.

**Tags** — create, rename, recolour, delete a tag that is in use, delete one
that is not, and **two different users independently owning a tag of the same
name** (this is what the per-user unique index exists for, and it is the case the
old global index made impossible).

**Calendars and events** — create/rename/delete a calendar; create an event;
edit it; delete it; recurring events if supported; drag to reschedule; switch
month / week / day views.

**Tenant isolation** — two accounts in one run. Everything account A creates must
be invisible to account B: lists, direct navigation by id, and search. This is
the RLS claim, and it should be asserted through the UI rather than the database.

**Empty-state discrimination** — the most important tests here. A genuinely empty
account and an account whose data is being hidden by a broken GUC look identical
in a screenshot. Assert on _specific expected content_ after seeding, so a
regression shows up as a failed assertion instead of a passing "renders" test.

Requirements:

- Real Postgres with the real migrations from `lib/config/migrations/` applied,
  in Docker or testcontainers. Never point tests at production.
- The app must run as a `NOBYPASSRLS` role in tests, mirroring production.
  Running them as a superuser silently disables RLS and the isolation tests
  become vacuous.
- Add an **anti-vacuity guard**: a test that asserts the suite actually ran under
  enforced RLS as a non-bypassing role, so the suite fails loudly rather than
  passing for the wrong reason. `lib/__tests__/rls.cutover-rehearsal.test.ts` has
  a working example of this pattern.
- Deterministic. Unique data per run, no ordering dependencies, no fixed sleeps.
- Wire it into CI with a Postgres service container, and make CI fail if the
  suite reports zero tests or any skip.

Report every genuine bug you find rather than fixing it silently, and tell me
which ones are production-affecting so I can prioritise.

## Task 2 — the mini-calendar design audit

The left sidebar has a mini month calendar while a full calendar is already open
in the main pane. I suspect it is redundant. **Investigate before changing
anything, and tell me what you found.**

- What is it actually wired to? Does clicking a date navigate the main view,
  filter tasks, scope a "create" action, or nothing?
- Does its value change with the main view's mode? A mini month-picker is often
  genuinely useful when the main pane is on week or day view and useless when the
  main pane is already showing the same month.
- Is it the only way to reach any function, or is every affordance duplicated
  elsewhere? Removing the sole path to a feature is not a simplification.
- What does it cost — sidebar width, mobile layout, render work on navigation?

Then recommend: keep, keep-but-only-in-week/day-view, or remove. If removal, do
it properly — component, styles, state, tests, and any now-dead handlers — and
show me the diff before deleting.

Give me a straight recommendation rather than a list of options.
