# Database security and workflow checks

`security_and_workflow.test.sql` signs in as each kind of user (by setting the JWT `sub` claim, the way Supabase does) and checks about 125 rules:

- anonymous visitors and not-yet-approved accounts can't read or do anything
- nobody can change their own role; only admins change other people's roles or access, only through the staff functions, never to or from admin
- every access change is recorded in `staff_activity` with the admin who made it (or as trusted setup from the SQL editor)
- admins read all work but can't create, edit, review, submit, clock in, or write tables
- accounts added through the Add user function are attributed to the admin named in `app_metadata` (only if that's an active admin), get the "choose your password" flag, and `complete_password_change()` clears only the caller's flag
- editors only see their own packages, history, attendance, and notifications
- tables can't be written directly; only the workflow functions change data
- managers add products by name (unique, ignoring case), editors and admins can't; packages need no client
- the full package workflow, the delivery-link rule for approval, reassignment notifications
- one open attendance session per person, and the 16-hour auto-close
- deactivated staff lose access but their history stays

It runs inside a transaction that is rolled back, so it never leaves data behind. Any failure stops with `FAILED: <rule>`.

These are plain SQL files, not pgTAP, so `supabase test db` doesn't pick them up. That's deliberate.

## On plain PostgreSQL (no Docker)

`supabase-stub.sql` creates just enough of Supabase (the `anon`/`authenticated` roles, `auth.users`, `auth.uid()`) for the migrations to run:

```bash
supabase/sql-tests/run-on-plain-postgres.sh "postgresql://postgres@127.0.0.1:5432/postgres"
```

The script creates a scratch database `cne_sql_tests`, applies the stub, every migration, then the checks, and drops the database. The URL must be a superuser on a server where you're allowed to create databases. Never point it at Supabase.

## On a local Supabase stack (Docker)

```bash
npx supabase start
npx supabase db reset            # applies supabase/migrations
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/sql-tests/security_and_workflow.test.sql
```

Don't use the stub here; the real stack already has `auth`.

## Volume data for speed tests

`volume-fixture.sql` fills an **empty scratch database** (stub + every migration, as above) with about a year of made-up work: 1 admin, 2 managers, 18 editors, 40 products, 3,000 packages (90 active), and their rounds, activity, notifications, and attendance. It refuses to run if any package or sign-in account exists, so it can't touch a real project. `-v packages=600` loads a smaller set.

```bash
psql "<scratch database url>" -v packages=600 -f supabase/sql-tests/volume-fixture.sql
```

The accounts (`admin@perf.test`, `manager1@perf.test`, `editor01@perf.test`, …) exist only in the stub's `auth.users`, with no passwords; signing in as them in a browser needs a stand-in for Supabase Auth.
