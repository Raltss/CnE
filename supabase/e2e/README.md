# Backend end-to-end check

`verify-backend.mjs` checks a running CnE backend through the public API, the way the app uses it. Every person is a separate signed-in Supabase session; it never uses the service-role key.

What it does, in order:

1. You (admin) sign in and add a test manager and two test editors with **Add user** (the `create-staff-account` Edge Function). The account history must name you.
2. Each test person signs in with the temporary password, must be asked to choose their own, sets it, and the temporary one stops working.
3. The manager adds a product and creates a package (description, brief, references, deliverables, one deadline) for editor 1.
4. Editor 1 opens it, starts work, and submits a review link. The manager marks Apply Feedback with a note; editor 1 resubmits with a delivery link; the manager approves. Both rounds are kept.
5. Notifications: who gets which (as rows), and that they arrive live through Realtime. Editor 2's live feed must never receive editor 1's package.
6. Refusals: editors can't approve, mark feedback, change roles, write tables, or read other people's packages, notifications, attendance, or the account history; admins can't create, review, or clock in.
7. Reassignment notifies both editors and keeps the rounds; the deadline change is recorded in Manila time (PHT).
8. Attendance: one open session (also with two clock-ins at the same moment), still open after signing in again, visible to managers, hidden from other editors.
9. The admin deactivates editor 2, whose still-valid token then reads no business data. Optionally, a never-approved account reads nothing.
10. The test accounts are deactivated (their records stay).

## Run it

From the project folder (it uses `@supabase/supabase-js` from `node_modules`; Node 22 or newer):

```bash
CNE_SUPABASE_URL=https://<project-ref>.supabase.co \
CNE_SUPABASE_KEY=<publishable key> \
CNE_ADMIN_EMAIL=<an active admin> \
CNE_ADMIN_PASSWORD='<their password>' \
node supabase/e2e/verify-backend.mjs
```

| Variable | |
|---|---|
| `CNE_SUPABASE_URL`, `CNE_SUPABASE_KEY` | The project URL and **publishable** key (the same values as `.env.local`) |
| `CNE_ADMIN_EMAIL`, `CNE_ADMIN_PASSWORD` | An active admin account |
| `CNE_PENDING_EMAIL`, `CNE_PENDING_PASSWORD` | Optional: an account created in the Dashboard and never approved |
| `CNE_TEST_EMAIL_DOMAIN` | Optional: domain for the test accounts (default `example.com`) |
| `CNE_KEEP_ACCOUNTS=1` | Optional: leave the test accounts active |

Each line prints `PASS`, `FAIL` (with the reason), or `SKIP`; the exit code is 1 if anything failed.

## What it leaves behind

A product `E2E Product <run>`, two packages with their rounds, activity, and notifications, a few attendance sessions, and three deactivated accounts `cne-e2e-<run>-{manager,editor,other}@<domain>`. Run it on a development project such as `cne-dev`, **never on production**. Nothing it creates can be deleted from the app; remove the accounts in the Dashboard (Authentication → Users) if you want them gone.
