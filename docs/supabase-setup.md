# Supabase setup (email + password)

How to connect CnE to your Supabase project, add staff, and give them roles.
For the reasoning behind the design, see [`backend-plan.md`](backend-plan.md).

> **Google OAuth is not needed.** Sign-in is email + password only for now. Google sign-in is a planned future addition (see the end of this page). Leave the Google provider disabled.

Your project is already linked: `supabase/.temp` points at **cne-dev** (`hmvrqkuqyqjtryqpskvg`), and `.env.local` has its URL and publishable key.

---

## 1. Check the environment variables

`.env.local` (git-ignored) needs exactly these two values from **Dashboard → Project Settings → API Keys**:

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

- Use the **publishable** key. Never put the `service_role`/secret key in a `VITE_` variable, because those are shipped to the browser. Only the Add user Edge Function (step 4) uses the service role, on Supabase's servers.
- `.env.example` shows the format. If neither value is set, the app shows "Supabase isn't configured". (The old offline demo, `VITE_USE_DEMO_DATA`, was removed on 2026-10-21; the app always needs Supabase.)

## 2. Turn off public sign-up (Dashboard)

**Authentication → Sign In / Providers:**

1. **Allow new users to sign up:** off. Admins add people; nobody can register themselves.
2. **Email** provider: enabled. (Leave "Confirm email" on or off; accounts added by an admin are confirmed directly.)
3. **Google** and other providers: leave disabled.

**Authentication → URL Configuration:**

4. **Site URL:** `http://localhost:5173` for development (change it to the real URL when you deploy).

Even if sign-up were left on, a self-registered account gets an inactive profile with no role, so it can't read any data. Turning sign-up off is the first lock; the database is the second.

## 3. Apply the migrations

The migrations are in `supabase/migrations/`:

| File | What it creates |
|---|---|
| `20261021100000_staff_access.sql` | `profiles`, roles (`admin`/`manager`/`editor`), access helpers, the "new user → inactive profile" trigger, the self-role-change guard, and the SQL-editor setup functions |
| `20261021100100_work_tables.sql` | clients (unused since 140000), products, packages, submissions, activity, attendance, notifications, and their read policies (RLS) |
| `20261021100200_workflow_functions.sql` | the workflow commands (`create_package`, `submit_for_review`, `approve_package`, `clock_in`, …) |
| `20261021100300_realtime.sql` | adds the live tables to Realtime |
| `20261021120000_admin_oversight.sql` | admin **read-only** access to all work, the account history (`staff_activity`, filled by a trigger), and the audited staff functions (`approve_account`, `change_staff_role`, `deactivate_account`, `reactivate_account`). Removes direct profile updates through the API |
| `20261021130000_staff_accounts.sql` | accounts added in the app: the "choose your own password" flag (`must_change_password`), the job title from the new account's details, history attribution to the admin who added them, and `complete_password_change()` |
| `20261021140000_products_without_clients.sql` | products without clients: `create_product(name)` for managers, package functions without a client, and the old client data kept but unused |
| `20261021150000_query_performance.sql` | faster reads: turns off JIT compilation for signed-in API requests, and adds an index for listing finished packages newest first. No data changes |

From the project folder:

```bash
npx supabase login                 # once, opens the browser
npx supabase db push --dry-run     # shows what would run
npx supabase db push               # applies it to cne-dev
```

- The dry run lists only the files that aren't applied yet. If the first four are already applied, that's `20261021120000_admin_oversight.sql`, `20261021130000_staff_accounts.sql`, `20261021140000_products_without_clients.sql`, and `20261021150000_query_performance.sql`. If it lists anything else, or reports tables that already exist, stop and review before pushing.
- These migrations don't change or delete existing accounts, packages, rounds, or attendance. They add policies, the `staff_activity` table, the `must_change_password` column, triggers, functions, and one index, set `jit = off` for the `authenticated` role, and start each existing account's history with an "Account history started" entry.
- **Apply them before using the updated app.** It loads `staff_activity` and `must_change_password`, and shows "Couldn't load your account" or "Couldn't load this" until they exist.

## 4. Deploy the Add user function

**Add user** in the app runs a small server-side function, `supabase/functions/create-staff-account`, because creating sign-in accounts needs the service-role key, which must never be in the browser.

```bash
npx supabase functions deploy create-staff-account
```

- Supabase gives the function its URL and keys automatically (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`); there's nothing to configure.
- `supabase/config.toml` sets `verify_jwt = false` for this function on purpose: the function checks the caller's token itself with Supabase Auth, then requires an active admin.
- No email is ever sent. It creates the account already confirmed.

If Add user says "Couldn't reach the Add user function", it isn't deployed (or the deploy failed). If it says "missing its Supabase settings", your project's legacy API keys may be turned off; tell me and we'll switch the function to the new key names.

## 5. The first admin (do this once)

The app can't create the first admin, because only an admin may change roles, and nobody may change their own. So the first admin is made in the SQL Editor. Open `supabase/scripts/first-admin.sql`, replace `owner@example.com` in both places with your account's email, paste it into **SQL Editor → New query**, and run it as the default `postgres` role (don't impersonate a user).

The script:
- finds the Auth user by email, and stops with a clear error if there's none;
- creates the profile if it's missing;
- sets `role = 'admin'` and `is_active = true`, keeping the existing name and title.

It runs in one transaction and is safe to rerun. Then reload the app: you land on the admin **Overview**.

## 6. Add managers and editors

### In the app (recommended)

Sign in as the admin → **Staff & Roles → Add user**:

1. Enter their **full name**, **work email**, and optionally a **job title**.
2. Choose **Manager** or **Editor**. (Admin access can't be granted here.)
3. Type a **temporary password**, or click **Generate a password**.
4. Click **Add manager** / **Add editor**. The next screen shows the email and temporary password once, with copy buttons.
5. Share them **privately** (in person or a private message). No email is sent.

When they first sign in, CnE asks them to **choose their own password** before showing anything else. After that, only they know it. Anyone can change their password later under **Your account** (sidebar, or tap your name in the top bar on small screens).

The account history records "Account created" and "Approved as …" under your name, then "Replaced the temporary password with their own" under theirs. Until they do, Staff & Roles shows a **Temporary password** badge next to them.

### Other options

- **Accounts created in the Dashboard** (Authentication → Users → Add user → **Create new user**, with **Auto Confirm User** ticked; don't use "Send invitation", which sends an email) arrive as "Waiting for approval". Approve them in **Staff & Roles → Approve…**. They keep the password you set there; there's no forced change.
- **SQL editor** (the original approach; recorded as "Trusted setup (SQL editor)"):

  ```sql
  -- approve_staff(email, role, full name, job title). Name and title are optional.
  select private.approve_staff('andrea@yourdomain.test', 'manager', 'Andrea Santos', 'Operations Manager');
  -- Remove access but keep their history:
  select private.deactivate_staff('andrea@yourdomain.test');
  ```

  The app doesn't edit names and titles yet. Calling `approve_staff` again with the same role is the way to change them.

**Manage access** on an approved account switches between manager and editor (refused while they still hold open packages), and deactivates or reactivates the account.

### Check the result

```sql
select email, full_name, role, is_active, must_change_password from public.profiles order by created_at;

-- Who changed what, newest first.
select p.email, a.message, coalesce(actor.full_name, 'Trusted setup (SQL editor)') as changed_by, a.at
from public.staff_activity a
join public.profiles p on p.id = a.profile_id
left join public.profiles actor on actor.id = a.actor_id
order by a.at desc
limit 20;
```

## 7. Two test accounts: one manager, one editor

You type the emails and passwords yourself; nothing is stored in the repo.

1. As the admin: **Staff & Roles → Add user**. Add the manager (role **Manager**) and copy the temporary password.
2. **Add another**: add the editor (role **Editor**) and copy that password too.
3. Sign in as each one (a private window helps) and choose a real password when asked.

## 8. Add products

Packages belong to a **product** (there are no clients). As a manager: **Packages → Add product**, type the name, and add it. You can also click **New product** next to the Product field while creating a package; the new product is selected for you.

Optional: `supabase/scripts/sample-products.sql` adds four starter products from the SQL editor (it skips names that already exist).

## 9. Try it

```bash
npm run dev     # http://localhost:5173
```

Use a normal window for one person and a private window (or another browser) for the next.

1. **Manager:** sign in → **Packages → New package**, pick a product (or add one with **New product**), assign your **test editor**, set a deadline, **Create and assign**. Reload: it's still there.
2. **Editor:** sign in → the assignment is on **My Work** and in the bell. Open it → **Start work** → paste a review link → **Submit for review**.
3. **Manager:** open the package (it's in **Review Queue**) → **Apply Feedback**, add a short note → **Send back for changes**.
4. **Editor:** the package is under **Needs Changes** with the note → add a review link and a **delivery link** → **Resubmit for review** (Round 2).
5. **Manager:** **Approve** → **Approve and complete**. Status: Completed.
6. **Admin:** **Overview** shows active, overdue, pending reviews, workload, and who's clocked in. **Team** → the editor shows the assignment, both rounds, and attendance; the manager shows packages, the review queue, and decisions. Every screen says **View only**, and opening the package shows no workflow buttons.
7. **Another editor** (optional third account): they don't see the package; its URL shows "Package not found"; **Overview** says "This page is for admins".
8. **Persistence:** reload any page, or sign out (sidebar, or the icon in the top bar on small screens) and sign back in. Everything is still there.

## 10. Check the security rules yourself (optional)

`supabase/sql-tests/security_and_workflow.test.sql` signs in as each role and checks about 125 rules: RLS isolation, admin read-only oversight, the audited staff functions, accounts added in the app, password-change records, no self-promotion, no direct writes, the workflow, attendance, and notifications. It runs in a transaction that's rolled back, so it leaves no data behind. See [`supabase/sql-tests/README.md`](../supabase/sql-tests/README.md).

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Supabase isn't configured" | `.env.local` is missing a value, or the dev server wasn't restarted after editing it |
| "The email or password is incorrect" | Wrong password, or the user doesn't exist in Authentication → Users |
| "This email address hasn't been confirmed" | Create the user with **Auto Confirm User** ticked, or confirm them in the Users list |
| "Waiting for access" after signing in | Approve the account in **Staff & Roles**, or run `private.approve_staff(...)`. For the very first admin, run `supabase/scripts/first-admin.sql` |
| "Couldn't load your account" mentioning `must_change_password` | `20261021130000_staff_accounts.sql` hasn't been applied (step 3) |
| "Couldn't load this" mentioning `staff_activity` | `20261021120000_admin_oversight.sql` hasn't been applied (step 3) |
| "Couldn't load this" / `relation "public.packages" does not exist` | The migrations haven't been applied (step 3) |
| Add user: "Couldn't reach the Add user function" | Deploy it (step 4) |
| Add user: "An account with this email already exists." | Someone already signs in with that email; find them in the list (they may be waiting for approval or deactivated) |
| "Can't change the role yet" in Staff & Roles | The person still holds open packages. A manager reassigns them first |
| Someone forgot their password | Password reset by email isn't built yet. In the Dashboard: Authentication → Users → the user → reset or set a new password |
| The Product list in New package is empty | Add a product (step 8) |
| "A product called … already exists" | Product names are unique, ignoring capital letters; pick the existing one |
| Changes from another person don't appear live | Check that `20261021100300_realtime.sql` ran; reloading the page, or switching back to the browser tab, always shows the latest data |

## Later: Google sign-in (not required now)

When the agency wants it: create Google OAuth credentials, enable the Google provider in Supabase, add a "Continue with Google" button that calls `supabase.auth.signInWithOAuth({ provider: 'google' })`, and add the redirect URL. Nothing else changes: a Google account still gets an inactive profile with no role until an admin approves it, so the access rules stay the same.
