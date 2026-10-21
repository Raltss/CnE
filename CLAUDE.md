# CLAUDE.md

CnE is an internal workflow web app for a video editing agency: packages (Client → Product → Package), review workflow, attendance, and in-app notifications.

**Source of truth for requirements:** [`docs/product-requirements.md`](docs/product-requirements.md). Read it before planning or implementing features, and update its "Implementation status" table as work lands.

## Stack

- React 19 + TypeScript + Vite
- Supabase (database, email/password auth, Realtime) via `@supabase/supabase-js`; migrations in `supabase/migrations/`, local config in `supabase/config.toml`. Design and decisions: `docs/backend-plan.md`. Setup: `docs/supabase-setup.md`
- Installed: Tailwind CSS v4 (`@tailwindcss/vite`), lucide-react, react-router
- Supabase Edge Function `supabase/functions/create-staff-account` (Deno) for the admin's Add user. It is the only code that uses the service-role key
- Approved but not yet used: shadcn/ui, @tanstack/react-query. Google OAuth is deferred (future addition)

Do not change the approved stack. Label any new dependency or feature not in the requirements as a **proposal** and get approval before adding it.

## Commands

- `npm run dev`: Vite dev server
- `npm run build`: type-check + production build
- `npm run lint`: ESLint
- `npx supabase start`: local Supabase stack (needs Docker)
- `supabase/sql-tests/run-on-plain-postgres.sh <postgres-url>`: migrations + RLS/workflow checks on plain PostgreSQL
- `npx supabase db push`: apply migrations to the linked project. Only with the user's explicit go-ahead
- `npx supabase functions deploy create-staff-account`: deploy the Add user function. Only with the user's explicit go-ahead

## UI work

- All UI design and implementation must use the **UI UX Pro Max** skill (`ui-ux-pro-max:ui-ux-pro-max`, plus `ui-ux-pro-max:ui-styling` / `design-system` as needed).
- The interface proposal is approved (PRD §11). The design system lives in `design-system/cne/MASTER.md`, with page overrides in `design-system/cne/pages/`. Follow it, and don't regenerate it with `--force` without approval.
- Use semantic color tokens, not raw hex in components. Statuses always show an icon and a label, never color alone. Meet WCAG AA, keep focus visible, and handle loading, empty, error, and success states.

## Data layer and security

- The UI reads only through `useAppState()` in `src/data/hooks.ts` and writes only through `api` in `src/data/store.ts`. Never call Supabase or localStorage from pages or components.
- `src/data/store.ts` picks the backend: `supabaseBackend.ts` (default) or `demoBackend.ts` (localStorage, when `VITE_USE_DEMO_DATA=true`).
- Security lives in the database: RLS for reads, and `SECURITY DEFINER` workflow functions for every write (API users can't write tables directly). Frontend role checks (`RoleGuard`) are only a convenience.
- Workflow rules exist twice: `src/data/workflow.ts` (demo) and the SQL functions (`*_workflow_functions.sql` for packages and attendance, `*_admin_oversight.sql` for staff access). Change both together, and extend `supabase/sql-tests/` when rules change.
- Change the schema only with a new migration file; never edit an applied migration. Only the publishable key goes in `VITE_` env vars; the service-role key is used only inside `supabase/functions`.
- The Add user input rules exist twice: `validateStaffAccountInput` in `src/data/validation.ts` and `validate` in the Edge Function. Change both together.

## Domain rules

- Display all times in **Asia/Manila**.
- Never build video upload, hosting, or storage. Videos stay on Frame.io, Google Drive, etc.; we store links only.
- Keep every submission round. Attendance corrections must keep an audit history.
- Allow at most one open clock-in session per person, and support overnight sessions. A session counts toward its clock-in date and auto-closes, flagged, after 16 hours.
- Accounts are invite-only (email + password, no public sign-up). Admins add managers and editors with a temporary password (never by email), and those people must choose their own password at first sign-in. Dashboard-created accounts have no role until an admin approves them; nobody can change their own role. Admin access is granted only in the SQL editor. Reassignments, deadline changes, and status changes go into the activity history; account access changes go into `staff_activity` with the acting admin.
- Admins oversee all work **read-only** (RLS read policies) and never act as another user. Oversight screens show the `ViewOnlyBanner`; admin actions are limited to staff access in Staff & Roles.

## Known issues

- `README.md` contains unresolved merge-conflict markers.
- `20261021120000_admin_oversight.sql` and `20261021130000_staff_accounts.sql` haven't been applied to `cne-dev` yet, and `create-staff-account` isn't deployed; the app needs the migrations (it loads `staff_activity` and `must_change_password`). Nothing has been tested against the hosted Auth and Realtime; the end-to-end run used real Postgres + PostgREST with simulated Auth.
