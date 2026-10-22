# Backend plan: Supabase

How CnE stores data, signs people in, and enforces who can do what. Setup steps are in [`supabase-setup.md`](supabase-setup.md). The requirements are in [`product-requirements.md`](product-requirements.md).

Status (2026-10-22): on `cne-dev`, all eight 2026-10-21 migrations are applied (`npx supabase migration list --linked`) and the `create-staff-account` Edge Function is deployed (v2, ACTIVE). One new migration, `20261022100000_account_flags_and_clock_in.sql`, is **ready but not applied** (§1 B16; setup step 3).

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
| B8 | Live updates | Supabase **Realtime**. Since 2026-10-21 the app listens to new `activity` rows (one per package change), `attendance_sessions`, and the person's own `notifications`, and refreshes only the affected lists, merging bursts into one refresh. Realtime applies RLS. |
| B9 | Offline demo | **Removed 2026-10-21.** It duplicated every workflow rule in TypeScript (`workflow.ts`) and needed a second backend. Volume and UI testing use `supabase/sql-tests/volume-fixture.sql` on a scratch database instead. |
| B15 | Loading data (2026-10-21) | Each page reads only what it shows, through TanStack Query (approved in the PRD). Current work is loaded completely, so totals are exact; finished packages, rounds, notifications, and account history are paged with a stable order and an exact count from the database. Each change refreshes only the lists it affects. |
| B10 | Admin oversight (2026-10-21) | Admins **read** everything managers read: products, packages, submission rounds, activity, and attendance. They can't create, edit, review, submit, or clock in: the workflow functions still require the manager or editor role, and nobody writes tables directly. No impersonation: the admin always uses their own session. |
| B12 | Add user (2026-10-21) | The Edge Function verifies the caller's token with Supabase Auth (`verify_jwt = false` in `config.toml`, so it works with the new signing keys), requires an active admin, validates the input, and calls `auth.admin.createUser` with `app_metadata = { created_by, must_change_password }` (only the service role can set app metadata). It then grants the role with `approve_account()` **using the admin's own token**, so the usual checks and history apply; if that fails it deletes the new user. A trigger reads `created_by` (only if it names an active admin) to attribute "Account created". |
| B13 | Passwords (2026-10-21) | Passwords live only in Supabase Auth. `profiles.must_change_password` makes the app show "Choose your password" before anything else; `complete_password_change()` clears it after `auth.updateUser` succeeds and records it in the history. The flag is a prompt, not a lock. The Account page re-checks the current password before changing it. |
| B14 | Products, no clients (2026-10-21) | Work is Product → Package. `create_product(name)` (managers) adds a product; `create_package`/`update_package` no longer take a client. The old client data stays in the database, unused. New packages' responsible manager defaults to their creator in the UI. Migration `20261021140000_products_without_clients.sql`. |
| B16 | Account flags from Auth (2026-10-22) | Supabase Auth's admin `createUser` (GoTrue v2.197) **inserts** the user row first and writes `app_metadata` in a second **UPDATE**, so the insert triggers never saw `must_change_password` or `created_by`: people added with Add user weren't asked to choose a password, and "Account created" had no actor. A trigger on that update (`private.handle_user_app_metadata`) now sets the flag the first time it appears and fills in the creating admin (still only an active admin). A one-time backfill flags accounts that were added this way and never changed their own password. Found only by testing against the real GoTrue binary. |
| B17 | Clock-in race (2026-10-22) | The unique index already allowed one open session; `clock_in()` now turns the losing request's constraint error into "You’re already clocked in." |
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

| Function | Who | Called by `api` in `src/data/api.ts` |
|---|---|---|
| `create_package(...)` | manager | `createPackage` |
| `update_package(id, ...)` | manager | `updatePackage` (reassign, deadline, manager change, field edits) |
| `start_work(id)` | assigned editor | `startWork` |
| `submit_for_review(id, review, delivery)` | assigned editor | `submitForReview` |
| `request_feedback(id, note)` | manager | `requestFeedback` |
| `approve_package(id)` | manager | `approve` (needs a delivery link) |
| `clock_in()` / `clock_out()` | manager, editor | `clockIn` / `clockOut` (a simultaneous second clock-in gets "already clocked in") |
| `close_stale_sessions()` | any active staff | `sweepAttendance` (16 h; every minute while the app is open) |
| `mark_notification_read(id)` / `mark_all_notifications_read()` | recipient | `markNotificationRead` / `markAllNotificationsRead` |
| `approve_account(id, role)` | admin | `approveAccount` (manager or editor only) |
| `change_staff_role(id, role)` | admin | `changeStaffRole` (refused while they hold open packages) |
| `create_product(name)` | manager | `createProduct` |
| `deactivate_account(id)` / `reactivate_account(id)` | admin | `deactivateAccount` / `reactivateAccount` |
| `complete_password_change()` | the signed-in person | `AuthProvider` (after `auth.updateUser`) |
| Edge Function `create-staff-account` | admin | `createStaffAccount` (creates the Auth user, then `approve_account`) |

The staff functions refuse changes to yourself and to admin accounts. The audit entry is written by the `audit_profile_changes` trigger, so SQL-editor changes are recorded too.

Each one is `SECURITY DEFINER` with `search_path = ''`. It checks the caller's role from `auth.uid()`, locks the package row, validates input (same rules as `src/data/validation.ts`), writes the activity entry and notifications, and raises a readable error otherwise. The app shows that error message in a toast or form.

**The rules live in the SQL.** The browser runs `validation.ts` first only so forms can show errors under each field; keep those field checks in step with the functions.

## 5. Frontend data layer

```
pages/components ──▶ query hooks (src/data/queries.ts) ──▶ select  ─┐
        │                    ▲ cache (TanStack Query)               ├─▶ Supabase (RLS)
        └──────────▶ api (src/data/api.ts) ──────────▶ rpc ─────────┘
                             │ refreshes the affected query keys
src/data/live.ts ◀── Realtime: activity, attendance, own notifications
```

- `src/session/AuthProvider.tsx`: restores the session, shows Login, loads the profile, blocks unapproved or deactivated accounts, asks for a new password when an admin set a temporary one, and provides `changePassword` for the Account page. When a session is found it starts the first reads (`startSession`: clear the cache, prefetch people, products, and current work) while the profile is checked.
- `src/SignedInApp.tsx`: the cache provider, live updates, and the router. It clears the cache when the person changes or signs out.
- `src/data/queries.ts`: one hook per list, with explicit columns and filters. Current work (`packages` not completed/cancelled/archived, each with its latest round as an embedded `latest:submissions(...)` limited to one) is read completely, past the Data API's 1,000-row cap. Finished packages (25), rounds (25), notifications (30), and account history (20) are paged with `Prefer: count=exact`. Attendance: one person's last 31 days, or the team's last 14.
- `src/data/api.ts`: each change runs one function and then refreshes the query keys it affects; lists on screen refetch, others are marked stale. The same change requested again while it's still running (a double click) joins the first request instead of sending a second. A refused change ("already approved", "already clocked in") refreshes the same keys, because the screen was probably out of date. Marking notifications read updates the cache directly.
- `src/data/live.ts`: one Realtime channel per signed-in person. A new `activity` row from someone else (or from the same person in another tab) refreshes current work, that package, and the history lists; attendance changes refresh attendance; a new notification refreshes the notification list, the unread count, and current work (an editor whose package was reassigned can't read its activity any more, only this notice).
- Pages show `PageStatus` (loading, or an error with Try again) while their own queries load; the sidebar and page header don't wait. A failed background refresh keeps the data already on screen.
- Account switching: a different person signing in on the same browser starts on `/` (their home page) with a new router and an empty cache. `StaffGate` re-checks role and access when the tab regains focus and every 5 minutes, so a deactivated or re-roled person is moved to the right screen without a reload (RLS already blocks their reads).
- Pages other than the three home pages are separate downloads (`src/routes.tsx`); React and supabase-js are separate long-cached files (`vite.config.ts`).

## 6. Testing

- `supabase/sql-tests/security_and_workflow.test.sql`: about 100 checks of RLS, role protection, admin oversight, the audited staff functions, and the workflow. They pass on PostgreSQL 16 with a Supabase stub.
- End to end (2026-10-21): the real app against PostgreSQL 16 with every migration, served by a real PostgREST 16.5, in a headless browser. Only Supabase Auth's token endpoint and Realtime were simulated. Covered: the admin approves a manager and an editor in the app (stored with the admin as actor), the manager assigns, the editor submits, the manager requests feedback, the editor resubmits, the manager approves, a second editor can't see or act on the package or raise their role (UI and direct API calls), the admin inspects both people's work read-only and is refused any workflow action, and data survives reloads and signing out and in. This harness lives outside the repo (Playwright and PostgREST aren't project dependencies).
- Add user end to end (2026-10-21): the real Edge Function code under Deno 2.5, real PostgreSQL + PostgREST, and a minimal stand-in for Supabase Auth that writes to the real `auth.users` (so the triggers run). Covered: adding an editor and a manager, the history attributed to the admin, duplicate emails, refusing admin creation, unauthenticated and non-admin callers, the forced first password change, the old password no longer working, and changing the password on the Account page.
- Performance (2026-10-21): `supabase/sql-tests/volume-fixture.sql` (a year of data: 3,000 packages, ~4,000 rounds, ~14,000 activity entries, ~11,000 notifications) on PostgreSQL 16 + PostgREST 16.5, production builds served with compression, a stand-in Realtime server, and Lighthouse 12.8 (mobile simulation, median of 3). Before → after, 600-package set: API data on the manager dashboard 161 KB → 12 KB; requests after Apply Feedback 17 → 2; after another person's submission 8 → 1; renders opening Packages 7,977 → ~2,170; Lighthouse dashboard 94 → 96, My Work 94 → 96–97, sign-in 93 → 97. Two database fixes in `20261021150000_query_performance.sql`: JIT off for `authenticated` (current-work read 22–34 ms → ~4.5 ms at 3,000 packages) and an index for the finished list (16.6 ms → 2.5 ms). The same end-to-end suites pass on the new data layer, plus live-update checks (notifications, reassignment, second tab).
- v1 verification (2026-10-22), on a local stack with the **real** Supabase Auth binary (GoTrue v2.197.0, as on `cne-dev`) and PostgREST v14.18 (as on `cne-dev`) over PostgreSQL 16, the Edge Function under Deno 2.9, a small gateway for `/auth/v1`, `/rest/v1`, `/functions/v1`, and a Realtime stand-in that applies each subscriber's RLS:
  - `supabase/sql-tests/`: 127 checks pass (3 new, for the GoTrue update order).
  - `supabase/e2e/verify-backend.mjs`: 94 API checks pass, each person a separate signed-in session (admin adds the staff through the Edge Function; first password change; full workflow with feedback loop; notifications as rows and live; reassignment; Manila formatting; attendance including two simultaneous clock-ins; editors refused approval, role changes, and other people's records; deactivated and never-approved accounts read nothing). Before the B16 fix, 3 failed: the forced password change.
  - Browser (Playwright, outside the repo) on the production build, each person in their own browser context and a non-Manila time zone: 58 checks pass, including double clicks creating one package and one round, a stale tab after a refused clock-in, overnight and auto-closed sessions shown in Manila time from a London browser, session restore, sign-out, a second person signing in on the same browser, live deactivation, and the waiting screen. The same run on the code before these fixes failed 4 (stale tab not refreshed, next person inheriting the previous page, deactivated person staying in, their live channel staying open).
  - Requests (production build, manager): sign-in + Dashboard 7 reads; someone else's submission 2; own approval 1 change + 1 read; returning to the Dashboard 0.
- Not tested yet: the hosted Supabase Auth, Realtime, and the hosted Edge Functions runtime (its injected keys). Run `verify-backend.mjs` against `cne-dev` for that (setup §10).

## 7. Not done yet

- Applying `20261022100000_account_flags_and_clock_in.sql` to `cne-dev` (`npx supabase db push`, your go-ahead; setup step 3).
- A run against the hosted project (Auth, PostgREST, Realtime, Edge runtime together): `supabase/e2e/verify-backend.mjs` with an admin login.
- Deferred after v1 (feature freeze 2026-10-22): On Hold / Cancelled / Archived / Reopen, attendance corrections with audit history, password reset by email, editing names and titles in the app (use `private.approve_staff` in the SQL editor), renaming or removing products, Google sign-in.
- A scheduled job for the 16-hour auto-close. It runs whenever someone uses the app, and `pg_cron` is still a proposal.
- Generated TypeScript types (`supabase gen types`).

## 8. Future: Google OAuth

Not needed for setup or testing. When it's added:

1. Create OAuth credentials in Google Cloud and enable the Google provider in Supabase.
2. Add a "Continue with Google" button (`supabase.auth.signInWithOAuth({ provider: 'google' })`) and the redirect URLs.
3. Optionally restrict sign-in to the agency's Google Workspace domain.

The access model doesn't change. A Google account still gets an inactive profile with no role until an admin approves it.
