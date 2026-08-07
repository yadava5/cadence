# RLS cutover — Cadence

Status on 2026-08-03: **DONE — steps 1–4 all applied and verified.** The
`DATABASE_URL` switch was made on 2026-08-03; production now connects as
`cadence_app` (`NOSUPERUSER NOBYPASSRLS`), so the policies are load-bearing
rather than inert.

Until that switch the app connected as `postgres`, which carries `BYPASSRLS`:
RLS was enabled, forced and correct, and completely inert for the application,
because a bypassing role never consults a policy. Step 4 is what changed that.

The previous connection string is saved for rollback at
`~/cadence-DATABASE_URL-rollback.txt` (owner-only, outside the repo — it
contains a live credential and must never be committed).

## What is already done

| step | change                                                                                                | verified by                                                   |
| ---- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1    | `REVOKE` all grants from `anon` / `authenticated` on 9 tables                                         | `pg_class.relacl` empty of those roles                        |
| 2    | `0001a` — `tags.userId`, backfill, per-user unique, FK                                                | 15 rows, 7 names, 0 unowned, all `task_tags` resolve          |
| 3    | `0002` — `ENABLE` + `FORCE` RLS, 22 policies, 7 tables                                                | `pg_class.relrowsecurity AND relforcerowsecurity`             |
| 3b   | `cadence_app` role, `NOSUPERUSER NOBYPASSRLS`, granted                                                | see the proof below                                           |
| 4    | `DATABASE_URL` switched to `cadence_app` (2026-08-03)                                                 | rollback string saved 2026-08-03; role proof above            |
| 5    | `0004` — `ENABLE` (no `FORCE`) + one permissive policy each on `users` / `user_profiles` (2026-08-07) | `SET LOCAL ROLE cadence_app` probe identical before and after |

`users` and `user_profiles` are still **not** scoped by a self-referential
policy, and must never be: they are read before a user is authenticated, so a
policy keyed on `app.user_id` would deadlock login. What `0004` changed is only
that RLS is now switched **on** for them with a permissive `FOR ALL TO
cadence_app` policy, so the schema reads uniformly. Access is unchanged.

**`0004` did not close an exposure, and the record should not be read as if it
did.** Step 1 of this table already removed every `anon`/`authenticated` grant
on all nine tables, and that was re-measured on 2026-08-07 before `0004` was
written: those two roles hold zero privileges anywhere in `public`, and
Supabase's security advisor returns an empty lint set because PostgREST has no
grants with which to reach the tables at all. Grants are the control here; RLS
on these two is defence in depth behind a door that is already locked.

**The form matters more than the change.** Enabling RLS on these tables the
obvious way — `ENABLE` with no policy, mirroring the other seven — is a total
login outage, and that was demonstrated rather than reasoned about. Inside a
rolled-back transaction on production, `ALTER TABLE public.users ENABLE ROW
LEVEL SECURITY` with no policy, probed as `cadence_app`, returned **0 rows**
for `SELECT ... FROM users WHERE email = 'john@example.com'` — the first query
of every login. Plain `ENABLE` binds every non-owner role; `FORCE` is what
additionally binds the owner. `cadence_app` is a non-owner with `NOBYPASSRLS`,
so it is bound the moment RLS goes on. Hence: no `FORCE`, and a permissive
policy that hands `cadence_app` back exactly what `GRANT` already gave it.

## The proof that the policies actually scope

Run as `cadence_app` **through the production Supavisor pooler**, not against a
local container:

```
auth + bypassrls ... cadence_app bypassrls=false
scoped read ........ tasks=5 calendars=2 tags=7    <- matches ground truth exactly
fail-closed ........ no-GUC tasks=0                <- refuses everything unbound
```

and in-database, via `SET LOCAL ROLE`:

```
tasks as postgres .. 6      no GUC ........... 0     cross-tenant rows  0
as owner ........... 5      as other tenant .. 1     cross-tenant write REFUSED
```

5 + 1 = 6 is the whole table, partitioned exactly along tenancy with nothing
visible across the boundary and no write able to cross it.

Two things this had to rule out, both of which would have surfaced as **empty
lists in production rather than errors**:

- **Does Supavisor accept a custom role?** Yes — username form
  `cadence_app.<project-ref>`.
- **Does a transaction-local GUC survive transaction-mode pooling (port 6543)?**
  Yes, because `lib/config/database.ts` takes a dedicated client from the pool
  and issues `BEGIN` / `set_config(..., true)` / statement / `COMMIT` / `release`
  on it. The GUC and the query are guaranteed to be the same physical
  connection. Had the GUC been set on the pool instead, every read would return
  zero rows.

## Step 4 — the switch (owner) · APPLIED 2026-08-03

Kept as the record of what was run, and as the rollback recipe.

The role shipped with a placeholder password, so it was rotated first.

```sql
ALTER ROLE cadence_app WITH PASSWORD 'a-long-random-password-you-generate';
```

Then set the connection string. Same shape as the current one, only the
username and password change:

```
postgresql://cadence_app.oglbrffkyelkcwheyhdx:<NEW-PASSWORD>@aws-1-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
```

```sh
vercel env rm  DATABASE_URL production        # keep the old value pasted somewhere
vercel env add DATABASE_URL production        # paste the new string
vercel --prod                                 # redeploy; env vars are build-time bound
```

**Rollback is the same three commands with the old string.** Nothing in the
schema needs reverting — RLS staying on is harmless to a bypassing role, which
is exactly what today's state demonstrates.

## After the switch, check these in order

1. Log in. If login breaks, the cause is `users` / `user_profiles`, not policies.
2. Calendars, tasks, tags all render. **Empty lists are the failure signature to
   watch for** — they mean the GUC is not reaching the query.
3. Create a task, create a tag. Writes exercise `WITH CHECK`, reads do not.
4. Second account sees only its own data.
