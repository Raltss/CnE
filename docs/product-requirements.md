# CnE — Product Requirements

CnE is an internal workflow web application for a video editing agency. It tracks work from assignment through review to completion, records staff attendance, and notifies people when work needs their attention.

> Status: **requirements agreed, interface proposal approved.** The app runs on Supabase; the newest migration (admin oversight) isn't applied yet. See [Implementation status](#implementation-status) and [`backend-plan.md`](backend-plan.md).
> Items marked **(Default)** are my assumptions where the answers left a detail open. They count as requirements unless overridden.
> Items marked **(Proposal)** have not been approved and are not requirements.

---

## 1. Tech stack (approved)

- React, TypeScript, Vite
- Supabase for the database, authentication, and Realtime
- UI design follows the **UI UX Pro Max** skill (see `CLAUDE.md`)
- Approved UI dependencies: Tailwind CSS v4 + shadcn/ui (Radix), lucide-react, react-router, @tanstack/react-query
- Approved Supabase pieces: Realtime (notifications and the review queue) and an Edge Function for admin invites (the Edge Function is deferred; see Accounts)

Do not change the stack without explicit approval.

## 2. Team and access

- One agency: **1 admin**, **2 managers**, **10–20 editors**.
- **Admin** is a **separate person** who manages staff accounts and roles, and **oversees all work read-only** (packages, review queues, submission rounds, deadlines, completed work, and attendance). The admin does not create, edit, review, or submit packages, and does not clock in. *(Read-only oversight added 2026-10-21.)*
- **Viewing is not acting.** The admin always uses their own session; there's no "sign in as" or impersonation. Oversight screens are labeled **View only**. Every admin change to an account is recorded in the account history under that admin.
- **Managers:** both managers manage the same pool of editors and can oversee all work.
- **Clients/products** have assigned managers. Each **package** has one **responsible manager**.
- **Editors:** see their assigned work and their own work history. They cannot see other editors' packages.

### Accounts

- **Invite-only.** No self sign-up. Public sign-up is turned off in Supabase.
- **Email + password** (Supabase Auth). **Google OAuth is deferred**, a future addition and not a setup prerequisite.
- **Initial approach (2026-10-21):** the admin creates sign-in accounts in the Supabase Dashboard (no invitation email). New accounts have no role and no access until approved. The admin then approves them as manager or editor in **Staff & Roles**, or with the trusted SQL function `private.approve_staff` in the SQL editor. See [`supabase-setup.md`](supabase-setup.md).
- **Admin access** is granted only in the SQL editor (`supabase/scripts/first-admin.sql` for the first admin). The app can't create, change, or deactivate admin accounts.
- **Account history:** every approval, role change, deactivation, reactivation, and name/title change is recorded with who made it (the admin, or "trusted setup" for SQL-editor changes) and when.
- **Later:** the admin invites staff by email through a Supabase Edge Function (needs the service role), the invitee sets a password from the invite link, and password reset goes by email. Until then, the admin resets passwords in the Dashboard.
- **Roles are enforced in the database** (Row Level Security and checked workflow functions), not only in the UI. Nobody can assign or change their own role.
- **Deactivation:** departed staff keep their history but can no longer log in or read data.

### Permission matrix

| Capability | Admin | Manager | Editor |
|---|---|---|---|
| Invite/deactivate staff, change roles (manager ↔ editor), audited | ✅ | — | — |
| Grant or remove admin access | SQL editor only | — | — |
| View the account history | ✅ | — | — |
| Manage clients and products | — | ✅ | — |
| Create, edit, assign, reassign packages | — | ✅ | — |
| Change responsible manager / deadline | — | ✅ | — |
| Hold, resume, cancel, archive, reopen packages | — | ✅ | — |
| View all packages, submission rounds, and activity | ✅ read-only | ✅ | — |
| View own assigned and past packages | — | — | ✅ |
| Start work / submit links | — | — | ✅ (own packages) |
| Approve / mark Apply Feedback | — | ✅ | — |
| Clock in/out | — | ✅ | ✅ |
| View staff attendance | ✅ read-only | ✅ | own only |
| Request attendance correction | — | ✅ (own) | ✅ (own) |
| Approve/reject corrections, correct directly (audited) | — | ✅ | — |

## 3. Work organization

**Client → Product → Package**

A **package** is the unit of work assigned to one editor. Fields:

- Title
- Description / notes
- Brief link
- Reference links (multiple)
- Deliverables (**free text**)
- Assigned editor (exactly one)
- Responsible manager
- Final deadline (one per package, **date + time**, entered and shown in Asia/Manila)

Rules:

- **Responsible manager (Default):** it starts as the product's assigned manager, or the client's if the product has none. Managers can change it at any time, and the change is recorded in the activity history.
- **Reassignment:** managers can move a package to another editor. **Both** the previous and the new editor are notified. Earlier submission rounds stay on the package.
- **Deadline changes:** managers can change the deadline. **(Default)** Each change records the old value, the new value, who made it, and when, and notifies the editor.

## 4. Core workflow

1. Manager creates and assigns a package. → **Assigned**
2. Editor starts work. → **In Progress**
3. Editor submits links for review. → **Submitted**
4. Responsible manager gets an in-app notification.
5. Manager either approves (→ **Completed**) or marks it **Apply Feedback** with an optional note.
6. Editor revises and resubmits. → **Submitted**
7. Approval completes the package. A Completed package can be **reopened**.

### Statuses

Main: **Assigned, In Progress, Submitted, Apply Feedback, Completed**.
Additional: **On Hold, Cancelled, Archived**.

```
Assigned ──(editor: start)──▶ In Progress ──(editor: submit)──▶ Submitted ──(manager: approve)──▶ Completed
                                                                  │   ▲                             │
                                              (manager: feedback) ▼   │ (editor: resubmit)          │ (manager: reopen)
                                                               Apply Feedback ◀─────────────────────┘

Any of Assigned / In Progress / Submitted / Apply Feedback ──(manager: hold)──▶ On Hold ──(manager: resume)──▶ previous status
Any status except Completed and Archived ──(manager: cancel)──▶ Cancelled
Completed or Cancelled ──(manager: archive)──▶ Archived ──(manager: unarchive)──▶ previous status
```

| From | To | Who | Notes |
|---|---|---|---|
| Assigned | In Progress | Assigned editor | |
| In Progress | Submitted | Assigned editor | Creates Round 1 |
| Apply Feedback | Submitted | Assigned editor | Creates the next round |
| Submitted | Completed | Manager | Latest round must have a delivery link (Default) |
| Submitted | Apply Feedback | Manager | Optional short note |
| Completed | Apply Feedback | Manager | Reopen; optional note |
| Assigned / In Progress / Submitted / Apply Feedback | On Hold | Manager | Remembers the previous status |
| On Hold | previous status | Manager | Resume |
| Any except Completed, Archived | Cancelled | Manager | |
| Completed / Cancelled | Archived | Manager | Hidden from active lists |
| Archived | previous status | Manager | Unarchive |

- "Overdue" is a derived flag (past the deadline and in an active status), not a status. On Hold, Cancelled, Completed, and Archived packages are never overdue.
- Every status change is recorded in the activity history.

## 5. Submissions

- Each round has **one Review Link** and **one Delivery Link**.
- The Delivery Link is **optional** on a submit. **(Default)** A manager can only approve a round that has a delivery link.
- Apply Feedback takes an **optional** short note from the manager. Detailed review comments stay in Frame.io for v1.
- Videos stay on external services (Frame.io, Google Drive, etc.).
- **Do not build** video uploading, hosting, or storage.
- Every submission round is kept (Round 1, Round 2, …) with its links, timestamps, and feedback note, including rounds made before a reassignment or reopen.
- Completed, Cancelled, and Archived packages remain visible to their editor in History.

## 6. Attendance

- Managers and editors can clock in and out.
- All times are shown in **Asia/Manila** (PHT, UTC+8).
- Attendance records only. **No** payroll, break tracking, or task timers.
- A person cannot have more than one open clock-in session.
- Sessions can run overnight. A session counts toward its **clock-in date**.
- **Auto-close:** a session still open **16 hours** after clock-in is closed at clock-in + 16h and flagged **Auto-closed**, so the person can request a correction. Running this on a schedule needs a job; see the `pg_cron` proposal.
- **Corrections:**
  - Editors (and managers, for their own records) **request** a correction with a reason. A manager **approves or rejects** it, and the requester is notified.
  - Managers can also correct a record directly, with a required reason.
  - Every correction keeps an audit history: who changed what, when, the previous values, and the reason.

## 7. Notifications

- In-app only for v1. Email comes later.
- Delivered live through **Supabase Realtime**. The review queue also updates live.
- Notifications have read/unread state.

| Event | Recipient |
|---|---|
| Package assigned | Assigned editor |
| Package reassigned | Previous editor and new editor |
| Package submitted / resubmitted | Responsible manager |
| Apply Feedback (with optional note) | Assigned editor |
| Package approved | Assigned editor |
| Package reopened | Assigned editor |
| Put on hold / resumed / cancelled | Assigned editor |
| Deadline changed (Default) | Assigned editor |
| Responsible manager changed (Default) | New responsible manager |
| Correction requested | Managers |
| Correction approved / rejected | Requester |

## 8. Interface priorities

### Manager dashboard
- Packages awaiting review
- Active assignments and editor workload (**workload = count of active packages per editor**: Assigned, In Progress, Submitted, Apply Feedback; On Hold shown separately)
- Upcoming deadlines and overdue packages
- Filters by client, product, editor, and status
- Access to staff attendance and personal clock-in/out

### Admin overview (added 2026-10-21)
- Active packages, overdue packages, pending reviews, editor workload, and who is clocked in now
- A detail page per manager and editor with filters: assignments, deadlines, review queue, submission rounds, review decisions, completed work, and attendance
- Read-only: clearly labeled **View only**, with no workflow buttons; account changes happen only in Staff & Roles

### Editor dashboard
- My assigned packages and deadlines
- Packages that need feedback changes
- Submission actions and status
- Previous/completed work
- Personal clock-in/out and attendance history

### Shared
- Notifications
- Package details with clearly labeled brief, reference, review, and delivery links
- Submission and activity history
- Clear loading, empty, error, and success states
- Responsive layouts and accessible controls
- Navigation that fits each role

## 9. Out of scope for v1

- Video upload, hosting, storage, or playback
- In-app review comments (they stay in Frame.io)
- Email notifications
- Payroll, break tracking, task timers

## 10. Decisions log

Answers to the open planning questions.

| # | Topic | Decision |
|---|---|---|
| 1 | Admin role | Separate person; manages staff access. **Updated 2026-10-21:** also oversees all work read-only, without impersonation |
| 2 | Responsible manager | Can change after assignment. Defaults to the product's (or client's) manager **(Default)** |
| 3 | Assignment | One editor per package; reassignment allowed; both editors notified |
| 4 | Deliverables | Free text for now |
| 5 | Submission shape | One review + one delivery link per round; delivery link not required on every submit; required to approve **(Default)** |
| 6 | Feedback note | Optional |
| 7 | Other statuses | On Hold, Cancelled, Archived added; Completed can be reopened |
| 8 | Deadline | Date + time (Manila); managers can change it; changes audited **(Default)** |
| 9 | Attendance corrections | Editors request, managers approve; open sessions auto-close after 16h and are flagged |
| 10 | Overnight attribution | Counts toward the clock-in date |
| 11 | Auth | Invite-only, email + password. Google OAuth deferred (2026-10-21) |
| 12 | Workload metric | Count of active packages |
| 13 | Deactivation | Keep history, block login |
| 14 | Live updates | Supabase Realtime |
| 15 | First accounts | Created in the Supabase Dashboard; roles assigned by a trusted admin in the SQL editor. Invite Edge Function later (2026-10-21) |
| 16 | Admin actions | In the app, admins approve accounts, switch manager ↔ editor, and deactivate/reactivate, through audited database functions. Admin access stays SQL-only. Package and attendance views are read-only (2026-10-21) |

## 11. Interface proposal (approved)

Designed with UI UX Pro Max (`--design-system`; dials: variance 3, motion 2, density 8). Saved as `design-system/cne/MASTER.md` (page overrides go in `design-system/cne/pages/`).

### Style
Minimalism / Swiss: dense, grid-based, high contrast, functional. Light theme by default, with dark mode through tokens. Motion is limited to 150–250ms hover/focus transitions and respects `prefers-reduced-motion`. No scroll or decorative animation.

### Navigation (role-based)
- **Desktop ≥1024px:** collapsible left sidebar, plus a top bar with global search, a **clock-in/out pill** (live Manila time and session duration), a notifications bell with unread count, and a user menu.
- **Tablet:** the sidebar collapses to an icon rail. **Mobile <768px:** bottom tab bar (≤5 items) with "More"; the clock pill stays in the top bar.
- **Manager:** Dashboard · Review Queue · Deadlines · Packages · Time Clock · Clients & Products · Editors · Attendance · Notifications. *(Deadlines and Time Clock added 2026-10-21 at the user's request, to take upcoming/overdue work and clock-in/out off the dashboard.)*
- **Editor:** My Work · Needs Changes · History · Attendance · Notifications
- **Admin:** Overview · Team · Packages · Attendance · Staff & Roles. No clock pill and no notifications. *(Revised 2026-10-21 for read-only oversight; see `design-system/cne/pages/admin.md`.)*
- Every package and every list filter has its own URL (filters kept in the query string).

### Manager dashboard
> **Revised 2026-10-21:** the wireframe below was too dense in practice. The dashboard now shows 4 tiles plus "Needs your review" and "Team workload", with details in dialogs. Upcoming/overdue moved to the Deadlines page. See `design-system/cne/pages/dashboard.md`.

```
┌ Sidebar ┬──────────────────────────────────────────────────────────┐
│         │ [Clock pill 09:14 PHT · 2h 03m]  [Search]  [🔔3] [Avatar] │
│         ├──────────────────────────────────────────────────────────┤
│         │ KPIs: Awaiting review 4 | In progress 11 | Due ≤48h 5 | Overdue 2 | On hold 1 │
│         ├────────────────────────────────┬─────────────────────────┤
│         │ Awaiting Review (mine first)   │ Upcoming & Overdue       │
│         │ package·editor·round·          │ overdue pinned on top    │
│         │ submitted-at·[Open] [Approve]  │                          │
│         ├────────────────────────────────┼─────────────────────────┤
│         │ Active assignments             │ Editor workload          │
│         │ filters: client·product·       │ bar per editor: active   │
│         │ editor·status·manager          │ count, due-soon, on hold │
│         └────────────────────────────────┴─────────────────────────┘
```
Attendance page: "who's clocked in now", a date-range table with Auto-closed flags, a corrections queue (approve/reject), and the audit trail.

### Editor dashboard
```
KPIs: Assigned 3 | Needs changes 1 | Due this week 2
[Needs Changes]       cards first, showing the manager's note if any
[My Packages]         title · client/product · status · deadline countdown · primary action (Start / Submit)
[Recently Completed]  last 5 → "View history"
Right rail (desktop) / section (mobile): my attendance this week, clock button, "Request correction"
```

### Package detail (shared)
- **Header:** breadcrumb Client › Product › Package, status badge, deadline (with the overdue flag), editor, responsible manager.
- **Labeled link groups** with icons: Brief, References (list), and the latest round's Review and Delivery links.
- **Deliverables:** free text.
- **Role-aware action bar:** Start / Submit / Approve / Apply Feedback / Hold / Resume / Cancel / Archive / Reopen / Reassign.
- **Timeline:** submission rounds merged with status, deadline, assignment, and responsible-manager changes.

### Colors (semantic tokens, AA checked)
| Token | Light | Dark |
|---|---|---|
| `--color-primary` | `#0F766E` (white text 5.4:1) | `#2DD4BF` |
| `--color-accent` | `#C2410C` | `#FB923C` |
| `--color-bg` | `#F8FAFC` | `#0B1120` |
| `--color-surface` | `#FFFFFF` | `#111827` |
| `--color-fg` | `#0F172A` | `#F1F5F9` |
| `--color-muted-fg` | `#475569` | `#94A3B8` |
| `--color-border` | `#E2E8F0` | `#1F2937` |
| `--color-ring` | `#0F766E` | `#2DD4BF` |

Statuses always show an **icon and a text label**, never color alone:

| Status | Color | Icon (lucide) |
|---|---|---|
| Assigned | slate `#475569` | `circle` |
| In Progress | blue `#1D4ED8` | `play` |
| Submitted | violet `#6D28D9` | `upload` |
| Apply Feedback | orange `#C2410C` | `rotate-ccw` |
| Completed | green `#15803D` | `check` |
| On Hold | amber `#B45309` | `pause` |
| Cancelled | gray `#6B7280` | `x` |
| Archived | gray `#6B7280` | `archive` |
| Overdue (modifier) | red `#B91C1C` | `alert-triangle` |

### Typography and spacing
- **Plus Jakarta Sans** (400/500/600/700). Numbers, times, and counts use `tabular-nums`. Optionally **Fira Code** for timestamps and URLs.
- Type scale: 12 / 14 (table body) / 16 (body) / 18 / 20 / 24 / 30. Line height 1.5 for body, 1.25 for headings.
- Spacing: 4px base, mostly 8–32px.

### Reusable components
AppShell (Sidebar, TopBar, BottomNav) · RoleGuard · ClockInOutPill · StatusBadge · DeadlineBadge · KpiStat · FilterBar · DataTable · PackageCard · PackageHeader · PackageActionBar · LinkField / LinkGroup (labeled, icon, opens externally, copy button) · SubmissionForm (URL validation; delivery optional) · FeedbackDialog (optional note) · ReassignDialog · ActivityTimeline · NotificationBell + NotificationList · WorkloadBar · AttendanceTable · CorrectionRequestDialog / CorrectionReviewDialog (reason required) · ConfirmDialog · EmptyState · ErrorState (retry) · Skeleton · Toast · FormField (visible label, inline error).

Accessibility: AA contrast, visible focus rings, 44px touch targets, labeled icon buttons, and `role="status"` on the unread count.

## 12. Proposals (not approved)

- **(Proposal)** Supabase `pg_cron` to run the 16-hour auto-close on a schedule. The alternative is to close stale sessions on the next clock-in or page load, which needs no new extension.
- **(Proposal)** Deadline-approaching reminder notifications.

## Implementation status

Milestone 1, the **frontend prototype**, is done (see [`prototype-notes.md`](prototype-notes.md)). Milestone 2 connects it to **Supabase**: sign-in and the first four migrations are in use on `cne-dev`; the admin-oversight migration (2026-10-21) is ready and tested locally but **not applied yet** (see [`backend-plan.md`](backend-plan.md) and [`supabase-setup.md`](supabase-setup.md)). The localStorage demo is still available with `VITE_USE_DEMO_DATA=true`.

| Area | Status |
|---|---|
| Project scaffold (Vite + React + TS, ESLint) | ✅ Done |
| Requirements and decisions | ✅ Agreed (this document) |
| Design system | ✅ Saved to `design-system/cne/MASTER.md` |
| UI dependencies | ✅ Tailwind CSS v4, lucide-react, react-router installed. shadcn/ui and TanStack Query not needed yet |
| Supabase client, schema, RLS | 🟡 5 migrations, RLS on every table, workflow and staff functions, about 100 SQL security checks passing (plain Postgres 16 + Supabase stub), plus an end-to-end browser run against real Postgres + PostgREST. The admin-oversight migration isn't applied to `cne-dev` yet |
| Auth, invites, roles | 🟡 Email/password sign-in, session restore, sign-out, approval gate, roles enforced in the database. Accounts are created in the Dashboard and roles assigned in SQL. Invite Edge Function, password reset, and Google OAuth not started |
| Clients / products / packages | 🟡 Create, edit, reassign, filters, on Supabase (`create_package`/`update_package`). Clients/products come from `supabase/scripts/sample-clients.sql`; no management UI |
| Package workflow (main statuses) | 🟡 Assigned → In Progress → Submitted → Apply Feedback / Completed, enforced by database functions |
| On Hold / Cancelled / Archived / Reopen | Not started |
| Submissions and history | 🟡 One row per round (never overwritten), review and delivery links, optional feedback note, activity log |
| Attendance (clock in/out, overnight, 16h auto-close) | 🟡 On Supabase; one open session enforced by a unique index; auto-close runs on clock actions and every minute while the app is open (no scheduled job yet) |
| Attendance corrections + audit | Not started |
| Notifications | 🟡 In-app, unread counts, mark read; Supabase Realtime wired up (not yet tested against a live project) |
| Manager / editor dashboards | 🧪 Prototype. Manager dashboard simplified (4 tiles, review + workload, drill-down dialogs; see `design-system/cne/pages/dashboard.md`), plus Deadlines and Time Clock pages |
| Admin (staff and roles) | 🟡 Staff & Roles: approve, change manager ↔ editor, deactivate/reactivate, with an account history naming the admin. First admin via `first-admin.sql`. Invites, name edits, and password resets not in the app yet |
| Admin oversight | 🟡 Overview, Team, per-person detail pages (assignments, submissions, review queue, decisions, attendance, with URL filters), read-only Packages, package detail, and Attendance. Enforced by RLS; needs `20261021120000_admin_oversight.sql` applied |
