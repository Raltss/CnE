# Supabase setup (email + password)

How to connect CnE to your Supabase project, create staff accounts, and give them roles.
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

- Use the **publishable** key. Never put the `service_role`/secret key in a `VITE_` variable, because those are shipped to the browser.
- `.env.example` shows the format. If neither value is set, the app shows "Supabase isn't configured".
- To run the old offline demo instead, add `VITE_USE_DEMO_DATA=true` and restart `npm run dev`.

## 2. Turn off public sign-up (Dashboard)

**Authentication → Sign In / Providers:**

1. **Allow new users to sign up:** off. The admin creates accounts; nobody can register themselves.
2. **Email** provider: enabled. (Leave "Confirm email" on or off; accounts you create in step 4 are confirmed directly.)
3. **Google** and other providers: leave disabled.

**Authentication → URL Configuration:**

4. **Site URL:** `http://localhost:5173` for development (change it to the real URL when you deploy).

Even if sign-up were left on, a self-registered account gets an inactive profile with no role, so it can't read any data. Turning sign-up off is the first lock; the database is the second.

## 3. Apply the migrations

The migrations are in `supabase/migrations/`:

| File | What it creates |
|---|---|
| `20261021100000_staff_access.sql` | `profiles`, roles (`admin`/`manager`/`editor`), access helpers, the "new user → inactive profile" trigger, the self-role-change guard, and the SQL-editor setup functions |
| `20261021100100_work_tables.sql` | clients, products, packages, submissions, activity, attendance, notifications, and their read policies (RLS) |
| `20261021100200_workflow_functions.sql` | the workflow commands (`create_package`, `submit_for_review`, `approve_package`, `clock_in`, …) |
| `20261021100300_realtime.sql` | adds the live tables to Realtime |
| `20261021120000_admin_oversight.sql` | admin **read-only** access to all work, the account history (`staff_activity`, filled by a trigger), and the audited staff functions (`approve_account`, `change_staff_role`, `deactivate_account`, `reactivate_account`). Removes direct profile updates through the API |

From the project folder:

```bash
npx supabase login                 # once, opens the browser
npx supabase db push --dry-run     # shows what would run
npx supabase db push               # applies it to cne-dev
```

- If the first four are already applied, the dry run lists **only** `20261021120000_admin_oversight.sql`. If it lists anything else, or reports tables that already exist, stop and review before pushing.
- The new migration doesn't change or delete existing accounts, packages, rounds, or attendance. It adds policies, one table, a trigger, and functions, and starts each existing account's history with an "Account history started" entry.
- **Apply it before using the updated app.** The app now also loads the account history, and shows "Couldn't load your work" until that table exists.

## 4. Create sign-in accounts (Dashboard)

**Authentication → Users → Add user → Create new user**, once per person:

1. Type the person's email and a password (at least 8 characters).
2. Tick **Auto Confirm User**, so they can sign in without a confirmation email.
3. Click **Create user**.

Use **Create new user**, not **Send invitation**: the invitation option sends an email. Nothing in this guide sends email.

Each new user automatically gets a row in `public.profiles` with **no role** and **inactive**, and an "Account created, waiting for approval" entry in the account history. If they sign in now, they see "Waiting for access".

## 5. Approve accounts and assign roles

Nobody can change their own role or access, and only an admin can change anyone else's. Admin access itself is granted only in the SQL editor.

### First admin (do this once)

The app can't create the first admin, because only an admin may change roles. So the first admin is made in the SQL Editor. Open `supabase/scripts/first-admin.sql`, replace `owner@example.com` in both places with your account's email, paste it into **SQL Editor → New query**, and run it as the default `postgres` role (don't impersonate a user).

The script:
- finds the Auth user by email, and stops with a clear error if there's none;
- creates the profile if it's missing;
- sets `role = 'admin'` and `is_active = true`, keeping the existing name and title.

It runs in one transaction and is safe to rerun. Then reload the app: you land on the admin **Overview**.

### Managers and editors: in the app (recommended)

Sign in as the admin → **Staff & Roles**. Waiting accounts are listed first.

1. Click **Approve…** next to the account.
2. Choose **Manager** or **Editor**, then **Approve as …**.

The change runs as you, through the `approve_account` database function, and the account history records it as done by you. **Manage access** on an approved account switches between manager and editor (refused while they still hold open packages or are a client's assigned manager), and deactivates or reactivates the account.

### Or in the SQL editor

The approach from the first setup still works. These changes are recorded as "Trusted setup (SQL editor)", because the SQL editor has no signed-in app user:

```sql
-- approve_staff(email, role, full name, job title). Name and title are optional.
select private.approve_staff('andrea@yourdomain.test', 'manager', 'Andrea Santos', 'Operations Manager');
select private.approve_staff('bea@yourdomain.test',    'editor',  'Bea Lim',       'Motion Editor');

-- Remove access but keep their history:
select private.deactivate_staff('bea@yourdomain.test');
```

The app doesn't edit names and titles yet. Calling `approve_staff` again with the same role is the way to set them; it only records the name and title change.

### Check the result

```sql
select email, full_name, role, is_active from public.profiles order by created_at;

-- Who changed what, newest first.
select p.email, a.message, coalesce(actor.full_name, 'Trusted setup (SQL editor)') as changed_by, a.at
from public.staff_activity a
join public.profiles p on p.id = a.profile_id
left join public.profiles actor on actor.id = a.actor_id
order by a.at desc
limit 20;
```

## 6. Two test accounts: one manager, one editor

You type the emails and passwords yourself in the Dashboard; nothing is stored in the repo.

1. **Step 4** twice: create the manager's and the editor's sign-in accounts (Auto Confirm ticked, no invitation).
2. Sign in to the app as your admin → **Staff & Roles**. Both appear under **Waiting**.
3. **Approve…** the first one as **Manager** and the second as **Editor**.
4. Optional, for nicer names (SQL Editor, using the same emails and roles):

   ```sql
   select private.approve_staff('<manager email>', 'manager', '<Full name>', 'Operations Manager');
   select private.approve_staff('<editor email>',  'editor',  '<Full name>', 'Video Editor');
   ```

5. **Step 7** below adds starter clients. It needs the approved manager's email.

If you'd rather not use the app for step 3, the two `approve_staff` lines in step 4 do the approval and the names at once.

## 7. Add starter clients and products

There's no client/product screen yet. Open `supabase/scripts/sample-clients.sql`, change the two manager emails at the top (use the same email twice if you have one manager), paste it into the SQL editor, and run it. It adds 2 clients and 4 products. Running it again does nothing.

## 8. Try it

```bash
npm run dev     # http://localhost:5173
```

Use a normal window for one person and a private window (or another browser) for the next.

1. **Manager:** sign in → **Packages → New package**, pick a client and product, assign your **test editor**, set a deadline, **Create and assign**. Reload: it's still there.
2. **Editor:** sign in → the assignment is on **My Work** and in the bell. Open it → **Start work** → paste a review link → **Submit for review**.
3. **Manager:** open the package (it's in **Review Queue**) → **Apply Feedback**, add a short note → **Send back for changes**.
4. **Editor:** the package is under **Needs Changes** with the note → add a review link and a **delivery link** → **Resubmit for review** (Round 2).
5. **Manager:** **Approve** → **Approve and complete**. Status: Completed.
6. **Admin:** **Overview** shows active, overdue, pending reviews, workload, and who's clocked in. **Team** → the editor shows the assignment, both rounds, and attendance; the manager shows packages, the review queue, and decisions. Every screen says **View only**, and opening the package shows no workflow buttons.
7. **Another editor** (optional third account): they don't see the package; its URL shows "Package not found"; **Overview** says "This page is for admins".
8. **Persistence:** reload any page, or sign out (sidebar, or the icon in the top bar on small screens) and sign back in. Everything is still there.

## 9. Check the security rules yourself (optional)

`supabase/sql-tests/security_and_workflow.test.sql` signs in as each role and checks about 100 rules: RLS isolation, admin read-only oversight, the audited staff functions, no self-promotion, no direct writes, the workflow, attendance, and notifications. It runs in a transaction that's rolled back, so it leaves no data behind. See [`supabase/sql-tests/README.md`](../supabase/sql-tests/README.md).

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "Supabase isn't configured" | `.env.local` is missing a value, or the dev server wasn't restarted after editing it |
| "The email or password is incorrect" | Wrong password, or the user doesn't exist in Authentication → Users |
| "This email address hasn't been confirmed" | Create the user with **Auto Confirm User** ticked, or confirm them in the Users list |
| "Waiting for access" after signing in | Approve the account in **Staff & Roles**, or run `private.approve_staff(...)`. For the very first admin, run `supabase/scripts/first-admin.sql` |
| "Couldn't load your work" mentioning `staff_activity` | `20261021120000_admin_oversight.sql` hasn't been applied (step 3) |
| "Couldn't load your work" / `relation "public.packages" does not exist` | The migrations haven't been applied (step 3) |
| "Can't change the role yet" in Staff & Roles | The person still holds open packages (or is a client's or product's manager). A manager reassigns them first |
| A manager can't pick a client in New package | Run step 7 |
| Changes from another person don't appear live | Check that `20261021100300_realtime.sql` ran; reloading the page always shows the latest data |

## Later: Google sign-in (not required now)

When the agency wants it: create Google OAuth credentials, enable the Google provider in Supabase, add a "Continue with Google" button that calls `supabase.auth.signInWithOAuth({ provider: 'google' })`, and add the redirect URL. Nothing else changes: a Google account still gets an inactive profile with no role until an admin approves it, so the access rules stay the same.
