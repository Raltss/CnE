# Database security and workflow checks

`security_and_workflow.test.sql` signs in as each kind of user (by setting the JWT `sub` claim, the way Supabase does) and checks about 100 rules:

- anonymous visitors and not-yet-approved accounts can't read or do anything
- nobody can change their own role; only admins change other people's roles or access, only through the staff functions, never to or from admin
- every access change is recorded in `staff_activity` with the admin who made it (or as trusted setup from the SQL editor)
- admins read all work but can't create, edit, review, submit, clock in, or write tables
- editors only see their own packages, history, attendance, and notifications
- tables can't be written directly; only the workflow functions change data
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
