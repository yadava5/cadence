# RLS cutover — Cadence

Status on 2026-08-03: **steps 1–3 applied and verified. The final switch (step 4)
is the `DATABASE_URL` change and is the owner's to make.**

Today the app connects as `postgres`, which carries `BYPASSRLS`. RLS is enabled,
forced and correct — and completely inert for the application, because a
bypassing role never consults a policy. Step 4 is the entire point of the
exercise: it is what makes the policies load-bearing.

## What is already done

| step | change                                                        | verified by                                          |
| ---- | ------------------------------------------------------------- | ---------------------------------------------------- |
| 1    | `REVOKE` all grants from `anon` / `authenticated` on 9 tables | `pg_class.relacl` empty of those roles               |
| 2    | `0001a` — `tags.userId`, backfill, per-user unique, FK        | 15 rows, 7 names, 0 unowned, all `task_tags` resolve |
| 3    | `0002` — `ENABLE` + `FORCE` RLS, 22 policies, 7 tables        | `pg_class.relrowsecurity AND relforcerowsecurity`    |
| 3b   | `cadence_app` role, `NOSUPERUSER NOBYPASSRLS`, granted        | see the proof below                                  |

`users` and `user_profiles` are deliberately NOT RLS'd: they are read before a
user is authenticated, so a policy keyed on `app.user_id` would deadlock login.

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

## Step 4 — the switch (owner)

The role currently has a placeholder password. Rotate it first.

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
