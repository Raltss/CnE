# CLAUDE.md

CnE is an internal workflow web app for a video editing agency: packages (Product → Package; clients were removed 2026-10-21), review workflow, attendance, and in-app notifications.

**Source of truth for requirements:** [`docs/product-requirements.md`](docs/product-requirements.md). Read it before planning or implementing features, and update its "Implementation status" table as work lands.

## Stack

- React 19 + TypeScript + Vite
- Supabase (database, email/password auth, Realtime) via `@supabase/supabase-js`; migrations in `supabase/migrations/`, local config in `supabase/config.toml`. Design and decisions: `docs/backend-plan.md`. Setup: `docs/supabase-setup.md`
- Installed: Tailwind CSS v4 (`@tailwindcss/vite`), lucide-react, react-router, @tanstack/react-query (reads and caching)
- Supabase Edge Function `supabase/functions/create-staff-account` (Deno) for the admin's Add user. It is the only code that uses the service-role key
- Approved but not yet used: shadcn/ui. Google OAuth is deferred (future addition)

Do not change the approved stack. Label any new dependency or feature not in the requirements as a **proposal** and get approval before adding it.

## Commands

- `npm run dev`: Vite dev server
- `npm run build`: type-check + production build
- `npm run lint`: ESLint
- `npx supabase start`: local Supabase stack (needs Docker)
- `supabase/sql-tests/run-on-plain-postgres.sh <postgres-url>`: migrations + RLS/workflow checks on plain PostgreSQL
- `node supabase/e2e/verify-backend.mjs` (env vars in `supabase/e2e/README.md`): end-to-end API check of a running backend with separate signed-in sessions. It creates test accounts, so on a hosted project only with the user's go-ahead, never on production
- `npx supabase db push`: apply migrations to the linked project. Only with the user's explicit go-ahead
- `npx supabase functions deploy create-staff-account`: deploy the Add user function. Only with the user's explicit go-ahead

## UI work

- All UI design and implementation must use the **UI UX Pro Max** skill (`ui-ux-pro-max:ui-ux-pro-max`, plus `ui-ux-pro-max:ui-styling` / `design-system` as needed).
- The interface proposal is approved (PRD §11). The design system lives in `design-system/cne/MASTER.md`, with page overrides in `design-system/cne/pages/`. Follow it, and don't regenerate it with `--force` without approval.
- Use semantic color tokens, not raw hex in components. Statuses always show an icon and a label, never color alone. Meet WCAG AA, keep focus visible, and handle loading, empty, error, and success states.

## Data layer and security

- The UI reads only through the query hooks in `src/data/queries.ts` (TanStack Query) and writes only through `api` in `src/data/api.ts`. Never call Supabase from pages or components.
- Each page loads only what it shows: explicit columns and filters, RLS still deciding the rows. Load current (unfinished) work completely so totals are exact; page long histories with a stable order and the database's exact count. Each `api` call names the query keys its change affects; `src/data/live.ts` refreshes only what Realtime says changed. The cache is cleared on sign-in and sign-out.
- Keep repeated clicks and account switches safe: `call()` in `api.ts` joins an identical change that's still in flight and refreshes the affected keys after a refusal too; a different person signing in starts on their own home page with a new router; `StaffGate` re-checks access when the tab regains focus.
- Security lives in the database: RLS for reads, and `SECURITY DEFINER` workflow functions for every write (API users can't write tables directly). Frontend role checks (`RoleGuard`) are only a convenience.
- Workflow rules live in the SQL functions (`*_workflow_functions.sql` for packages and attendance, `*_admin_oversight.sql` for staff access). `src/data/validation.ts` repeats the form-field checks so errors show under each field; keep it in step, and extend `supabase/sql-tests/` when rules change.
- Change the schema only with a new migration file; never edit an applied migration. Only the publishable key goes in `VITE_` env vars; the service-role key is used only inside `supabase/functions`.
- The Add user input rules exist twice: `validateStaffAccountInput` in `src/data/validation.ts` and `validate` in the Edge Function. Change both together.

## Domain rules

- Display all times in **Asia/Manila**.
- Never build video upload, hosting, or storage. Videos stay on Frame.io, Google Drive, etc.; we store links only.
- Keep every submission round. Attendance corrections must keep an audit history.
- Clients never sign in: after internal approval a manager sends a round to the client (With Client) and records the client's approval or changes. Client changes count against the product's included revisions. A package is completed only with a delivery link on its latest round; the editor may add a missing one, never overwrite one.
- A package can be deleted only while it's Assigned with no rounds (a mistake). Anything started is cancelled, then archived, never erased. Completed and cancelled packages keep their editor and deadline; archived ones can't be edited until unarchived. Lifecycle actions (hold, resume, cancel, archive, unarchive, reopen, delete) and product rename are manager-only.
- Allow at most one open clock-in session per person, and support overnight sessions. A session counts toward its clock-in date and auto-closes, flagged, after 16 hours.
- Accounts are invite-only (email + password, no public sign-up). Admins add managers and editors with a temporary password (never by email), and those people must choose their own password at first sign-in. Dashboard-created accounts have no role until an admin approves them; nobody can change their own role. Admin access is granted only in the SQL editor. Reassignments, deadline changes, and status changes go into the activity history; account access changes go into `staff_activity` with the acting admin.
- Admins oversee all work **read-only** (RLS read policies) and never act as another user. Oversight screens show the `ViewOnlyBanner`; admin actions are limited to staff access in Staff & Roles.

## Known issues

- `cne-dev` (2026-10-22): the eight 2026-10-21 migrations are applied and `create-staff-account` is deployed (v2). `20261022100000_account_flags_and_clock_in.sql` is **not applied yet**; until it is, people added with Add user aren't asked to choose their own password. The four 2026-10-23 migrations (lifecycle, then client review and reports) aren't applied either; until they are, the package actions, With Client, product allowances, and Reports fail on `cne-dev`. Nothing in this repo has been run against the hosted Auth and Realtime yet: the 2026-10-22 runs used real GoTrue v2.197 + PostgREST v14.18 on local PostgreSQL 16, with a Realtime stand-in.
- Supabase Auth's admin `createUser` writes `app_metadata` in an UPDATE after inserting the user, so anything that reads it must run on that update too (see `20261022100000_…`). Test account flows against real GoTrue, not a stub that inserts everything at once.
- The offline demo (`VITE_USE_DEMO_DATA`) was removed on 2026-10-21. For volume tests, load `supabase/sql-tests/volume-fixture.sql` into a scratch database only.
- Measure Lighthouse on a production build (`npm run build && npm run preview`), never on `npm run dev`.
