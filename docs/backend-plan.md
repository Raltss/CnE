# Backend plan: Supabase

How CnE stores data, signs people in, and enforces who can do what. Setup steps are in [`supabase-setup.md`](supabase-setup.md). The requirements are in [`product-requirements.md`](product-requirements.md).

Status (2026-10-21): the first four migrations appear to be applied on `cne-dev` (sign-in and the first-admin script work there; `npx supabase db push --dry-run` confirms). `20261021120000_admin_oversight.sql`, `20261021130000_staff_accounts.sql`, `20261021140000_products_without_clients.sql`, and the `create-staff-account` Edge Function are ready but **not applied or deployed yet**.

---

## 1. Decisions

| # | Topic | Decision |
|---|---|---|
| B1 | Sign-in method | **Supabase Auth, email + password.** Google OAuth is **deferred** and isn't a setup prerequisite (see §8). |
| B2 | Account creation | **No public sign-up.** Admins add managers and editors in the app (**Add user**): the `create-staff-account` Edge Function creates the confirmed account with a **temporary password** (no email), using the service role on the server only. The person must choose their own password at first sign-in. Creating users in the Supabase Dashboard still works. |
| B3 | Role assignment | The **first admin** is made in the SQL editor (`supabase/scripts/first-admin.sql`). After that, an admin approves accounts as manager or editor, switches between the two, and deactivates or reactivates them **in the app**, through audited functions (B11). `private.approve_staff(…)` still works in the SQL editor. Admin access is granted only in the SQL editor. |
| B4 | Access gate | Only **approved, active** staff (a profile with a role and `is_active = true`) can read anything. New accounts start inactive with no role. |
| B5 | Reads | **Row Level Security** on every table decides which rows each person can read. |
| B6 | Writes | API users have **no** insert/update/delete privileges on work tables. Every change goes through a workflow function that checks role and status and writes everything in one transaction. |
| B7 | Own role | Nobody can change their own role or access. Two locks enforce this: an RLS policy and a trigger. |
| B8 | Live updates | Supabase **Realtime** on packages, submissions, activity, attendance, and notifications. The app refetches on any change. Realtime applies RLS. |
| B9 | Offline demo | The localStorage demo stays available behind `VITE_USE_DEMO_DATA=true`, for UI work without a backend. |
| B10 | Admin oversight (2026-10-21) | Admins **read** everything managers read: products, packages, submission rounds, activity, and attendance. They can't create, edit, review, submit, or clock in: the workflow functions still require the manager or editor role, and nobody writes tables directly. No impersonation: the admin always uses their own session. |
| B12 | Add user (2026-10-21) | The Edge Function verifies the caller's token with Supabase Auth (`verify_jwt = false` in `config.toml`, so it works with the new signing keys), requires an active admin, validates the input, and calls `auth.admin.createUser` with `app_metadata = { created_by, must_change_password }` (only the service role can set app metadata). It then grants the role with `approve_account()` **using the admin's own token**, so the usual checks and history apply; if that fails it deletes the new user. A trigger reads `created_by` (only if it names an active admin) to attribute "Account created". |
| B13 | Passwords (2026-10-21) | Passwords live only in Supabase Auth. `profiles.must_change_password` makes the app show "Choose your password" before anything else; `complete_password_change()` clears it after `auth.updateUser` succeeds and records it in the history. The flag is a prompt, not a lock. The Account page re-checks the current password before changing it. |
| B14 | Products, no clients (2026-10-21) | Work is Product → Package. `create_product(name)` (managers) adds a product; `create_package`/`update_package` no longer take a client. The old client data stays in the database, unused. New packages' responsible manager defaults to their creator in the UI. Migration `20261021140000_products_without_clients.sql`. |
| B11 | Audited staff access (2026-10-21) | `approve_account`, `change_staff_role`, `deactivate_account`, and `reactivate_account` are the only way to change access through the API. The direct `update` on `profiles` from the first migration was removed. A trigger on `profiles` writes every role, access, name, or title change to `staff_activity` with `actor_id = auth.uid()`: the admin who did it, or null for a trusted SQL-editor step. |

## 2. Roles and what the database lets them do

| | Admin | Manager | Editor | Signed in, not approved | Anonymous |
|---|---|---|---|---|---|
| Read profiles (names, roles) | all | all | all | own only | — |
| Approve, change manager↔editor, deactivate, reactivate | others only (not self, not admins), audited | — | — | — | — |
| Grant admin access | SQL editor only | — | — | — | — |
| Read account history (`staff_activity`) | ✅ | — | — | — | — |
| Read products | ✅ read-only | ✅ | ✅ | — | — |
| Add products | — | ✅ | — | — | — |
| Read packages, submissions, activity | all, read-only | all | assigned to them | — | — |
| Create, edit, reassign packages | — | ✅ | — | — | — |
| Start / submit | — | — | own packages | — | — |
| Approve / Apply Feedback | — | ✅ (any manager) | — | — | — |
| Clock in/out | — | ✅ | ✅ | — | — |
| Read attendance | everyone's, read-only | everyone's | own | — | — |
| Read notifications | own | own | own | — | — |

"Admin" follows PRD §2: manages staff access and oversees all work read-only; no package actions and no clocking in.

## 3. Schema (`supabase/migrations/`)

```
auth.users ──1:1── profiles (role, is_active) ──< staff_activity (account history, actor = admin)
                      │
products              │
   └──────────┬───────┘
          packages ──< submissions   (one row per round, never overwritten)
              ├────< activity        (history log)
              └────< notifications   (recipient, read_at)
profiles ──< attendance_sessions     (one open session per person: partial unique index)
```

- IDs are UUIDs. Package codes (`PKG-1001`, …) come from a sequence.
- Times are `timestamptz`; the app shows them in Asia/Manila.
- Products have just a name (unique ignoring case, checked in `create_product`). The `clients` table and the `client_id` columns are kept from before 2026-10-21 but unused; nothing reads or requires them.
- The private helpers (`private.has_role()`, `private.is_active_staff()`, …) live in a schema the Data API doesn't expose.

## 4. Workflow functions (called with `supabase.rpc`)

| Function | Who | Mirrors in `src/data/workflow.ts` |
|---|---|---|
| `create_package(...)` | manager | `createPackage` |
| `update_package(id, ...)` | manager | `updatePackage` (reassign, deadline, manager change, field edits) |
| `start_work(id)` | assigned editor | `startWork` |
| `submit_for_review(id, review, delivery)` | assigned editor | `submitForReview` |
| `request_feedback(id, note)` | manager | `requestFeedback` |
| `approve_package(id)` | manager | `approvePackage` (needs a delivery link) |
| `clock_in()` / `clock_out()` | manager, editor | `clockIn` / `clockOut` |
| `close_stale_sessions()` | any active staff | `autoCloseStaleSessions` (16 h) |
| `mark_notification_read(id)` / `mark_all_notifications_read()` | recipient | same names |
| `approve_account(id, role)` | admin | `approveAccount` (manager or editor only) |
| `change_staff_role(id, role)` | admin | `changeStaffRole` (refused while they hold open packages) |
| `create_product(name)` | manager | `createProduct` |
| `deactivate_account(id)` / `reactivate_account(id)` | admin | `deactivateAccount` / `reactivateAccount` |
| `complete_password_change()` | the signed-in person | (Supabase only; the demo has no passwords) |
| Edge Function `create-staff-account` | admin | `createStaffAccount` (creates the Auth user, then `approve_account`) |

The staff functions refuse changes to yourself and to admin accounts. The audit entry is written by the `audit_profile_changes` trigger, so SQL-editor changes are recorded too.

Each one is `SECURITY DEFINER` with `search_path = ''`. It checks the caller's role from `auth.uid()`, locks the package row, validates input (same rules as `src/data/validation.ts`), writes the activity entry and notifications, and raises a readable error otherwise. The app shows that error message in a toast or form.

**Keep the TypeScript rules and the SQL rules in step.** The demo uses `workflow.ts`; Supabase uses the SQL. The browser also runs `validation.ts` first, so forms can show errors under each field.

## 5. Frontend data layer

```
pages/components ──▶ useAppState() / api   (src/data/hooks.ts, src/data/store.ts)
                            │
              ┌─────────────┴─────────────┐
     supabaseBackend.ts            demoBackend.ts
  (select + rpc + Realtime)   (localStorage + workflow.ts)
```

- `src/session/AuthProvider.tsx`: restores the session, shows Login, loads the profile, blocks unapproved or deactivated accounts, asks for a new password when an admin set a temporary one, and provides `changePassword` for the Account page.
- `src/session/DataGate.tsx`: loads data after sign-in and starts Realtime, with loading and error/retry screens.
- `src/data/supabaseBackend.ts`: fetches the tables (RLS filters them), maps `snake_case` rows to the existing types, calls the workflow functions, and refetches after each command or Realtime event.
- Pages didn't change, apart from awaiting `api` calls and disabling buttons while they run.

Load limits for now: attendance from the last 45 days, the latest 200 notifications per person, and the API's 1,000-row cap per table.

## 6. Testing

- `supabase/sql-tests/security_and_workflow.test.sql`: about 100 checks of RLS, role protection, admin oversight, the audited staff functions, and the workflow. They pass on PostgreSQL 16 with a Supabase stub.
- End to end (2026-10-21): the real app against PostgreSQL 16 with every migration, served by a real PostgREST 16.5, in a headless browser. Only Supabase Auth's token endpoint and Realtime were simulated. Covered: the admin approves a manager and an editor in the app (stored with the admin as actor), the manager assigns, the editor submits, the manager requests feedback, the editor resubmits, the manager approves, a second editor can't see or act on the package or raise their role (UI and direct API calls), the admin inspects both people's work read-only and is refused any workflow action, and data survives reloads and signing out and in. This harness lives outside the repo (Playwright and PostgREST aren't project dependencies).
- Add user end to end (2026-10-21): the real Edge Function code under Deno 2.5, real PostgreSQL + PostgREST, and a minimal stand-in for Supabase Auth that writes to the real `auth.users` (so the triggers run). Covered: adding an editor and a manager, the history attributed to the admin, duplicate emails, refusing admin creation, unauthenticated and non-admin callers, the forced first password change, the old password no longer working, and changing the password on the Account page.
- Not tested yet: the hosted Supabase Auth, Realtime, and the hosted Edge Functions runtime (its injected keys).

## 7. Not done yet

- Applying `20261021120000_admin_oversight.sql` to `cne-dev` (waiting for your go-ahead).
- A test against the hosted project (Auth, PostgREST, Realtime together).
- Password reset by email ("forgot password"). For now the admin resets passwords in the Dashboard. Invite emails aren't planned; Add user uses a temporary password.
- Editing names and titles in the app (use `private.approve_staff` in the SQL editor).
- Renaming or removing products (only adding exists; `supabase/scripts/sample-products.sql` adds a few starter products).
- On Hold / Cancelled / Archived / Reopen, attendance corrections with audit history (same as the prototype).
- A scheduled job for the 16-hour auto-close. It runs whenever someone uses the app, and `pg_cron` is still a proposal.
- Generated TypeScript types (`supabase gen types`) once the schema is applied.

## 8. Future: Google OAuth

Not needed for setup or testing. When it's added:

1. Create OAuth credentials in Google Cloud and enable the Google provider in Supabase.
2. Add a "Continue with Google" button (`supabase.auth.signInWithOAuth({ provider: 'google' })`) and the redirect URLs.
3. Optionally restrict sign-in to the agency's Google Workspace domain.

The access model doesn't change. A Google account still gets an inactive profile with no role until an admin approves it.
