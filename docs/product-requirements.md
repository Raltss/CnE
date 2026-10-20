# CnE — Product Requirements

CnE is an internal workflow web application for a video editing agency. It tracks work from assignment through review to completion, records staff attendance, and notifies people when work needs their attention.

> Status: **planning**. Nothing below is implemented yet; see [Implementation status](#implementation-status).
> Items marked **(Proposal)** are suggestions that have not been approved and are not requirements.
> Decisions from the first round of open questions (2026-10-21) are recorded in [§10 Decisions](#10-decisions).

---

## 1. Tech stack (approved)

- React, TypeScript, Vite
- Supabase for the database, authentication, and **Realtime** (live notifications)
- A server-side Supabase function for admin-created accounts (creating users needs the service role, which must never reach the browser)
- UI design follows the **UI UX Pro Max** skill (see `CLAUDE.md`)

Do not change the stack without explicit approval.

## 2. Team and access

- One agency: **1 admin**, **2 managers**, **10–20 editors**.
- **Admin:** a separate person (not one of the managers). Manages staff accounts and roles only.
- **Managers:** both managers manage the same pool of editors and can oversee all work.
- **Clients/products** have assigned managers. Each **package** has one **responsible manager**, which can be changed after assignment.
- **Editors:** see their assigned work and their own work history. They cannot see other editors' packages.
- **Accounts are invite-only.** The admin creates them; there is no self sign-up.
- **Deactivation:** departed staff keep their history but can no longer log in.

### Permission matrix

| Capability | Admin | Manager | Editor |
|---|---|---|---|
| Invite/deactivate staff, change roles | ✅ | — | — |
| Manage clients and products | — | ✅ | — |
| Create, edit, assign, reassign packages | — | ✅ | — |
| Change responsible manager | — | ✅ | — |
| Change package deadline | — | ✅ | — |
| Hold, resume, cancel, archive, reopen packages | — | ✅ | — |
| View all packages | — | ✅ | — |
| View own assigned and past packages | — | — | ✅ |
| Start work / submit links | — | — | ✅ (own packages) |
| Approve / mark Apply Feedback | — | ✅ | — |
| Clock in/out | — | ✅ | ✅ |
| View staff attendance | — | ✅ | own only |
| Request attendance correction | — | ✅ | ✅ (own records) |
| Approve/reject attendance corrections | — | ✅ | — |

The admin does not clock in or work on packages.

## 3. Work organization

**Client → Product → Package**

A **package** is the unit of work assigned to **exactly one editor** at a time. Fields:

- Title
- Description / notes
- Brief link
- Reference links (multiple)
- Deliverables (free text)
- Assigned editor (can be reassigned)
- Responsible manager (can be changed)
- Final deadline: one per package, **date and time in Asia/Manila**. Managers can change it.

## 4. Core workflow

1. Manager creates and assigns a package. → **Assigned**
2. Editor starts work. → **In Progress**
3. Editor submits links for review. → **Submitted**
4. Responsible manager gets an in-app notification.
5. Manager either approves (→ **Completed**) or marks it **Apply Feedback**, with an optional short note.
6. Editor revises and resubmits. → **Submitted** (a new round)
7. Approval completes the package. A Completed package can be reopened.

Managers can also put a package **On Hold**, **Cancel** it, or **Archive** it.

### Status transitions

```
Assigned ──(editor: start)──▶ In Progress ──(editor: submit)──▶ Submitted ──(manager: approve)──▶ Completed ──(manager: archive)──▶ Archived
                                                                  │   ▲                              │
                                              (manager: feedback) ▼   │ (editor: resubmit)          │ (manager: reopen)
                                                               Apply Feedback ◀─────────────────────┘

Any active status ──(manager: hold)──▶ On Hold ──(manager: resume)──▶ previous status
Any active status or On Hold ──(manager: cancel)──▶ Cancelled ──(manager: archive)──▶ Archived
```

"Active" means Assigned, In Progress, Submitted, or Apply Feedback.

| From | To | Who |
|---|---|---|
| Assigned | In Progress | Assigned editor |
| In Progress | Submitted | Assigned editor |
| Submitted | Completed | Manager |
| Submitted | Apply Feedback | Manager |
| Apply Feedback | Submitted | Assigned editor |
| Completed | Apply Feedback (reopen) | Manager (see follow-up F3) |
| Any active | On Hold | Manager |
| On Hold | Previous status | Manager |
| Any active / On Hold | Cancelled | Manager |
| Completed / Cancelled | Archived | Manager |

- "Overdue" is a derived flag (past deadline and not Completed, Cancelled, On Hold, or Archived), not a status.
- **Reassignment** keeps the package's status and submission history; the new editor continues from where it is. Both the previous and the new editor are notified.
- Changes to deadline, assignee, responsible manager, and status appear in the package's activity history.

## 5. Submissions

- Each round has **one Review Link** and **at most one Delivery Link**.
- The Review Link is required on every submit. The Delivery Link is **optional** and does not need to be provided every round (see follow-up F2).
- Videos stay on external services (Frame.io, Google Drive, etc.).
- **Do not build** video uploading, hosting, or storage.
- Detailed review comments stay in Frame.io for v1. Apply Feedback can carry an **optional short note** from the manager.
- Every submission round is kept (Round 1, Round 2, …) along with its links, timestamps, the submitting editor, and the manager's decision and note.
- Completed packages remain visible to the editor for tracking.

## 6. Attendance

- Managers and editors can clock in and out.
- All times are shown in **Asia/Manila** (PHT, UTC+8).
- Attendance records only. **No** payroll, break tracking, or task timers.
- A person cannot have more than one open clock-in session.
- Sessions can run overnight (clock-out on the next calendar day). **A session counts toward its clock-in date.**
- **Forgotten sessions are auto-closed** after a set number of hours (see follow-up F5) and marked as auto-closed so they can be corrected.
- **Corrections:** editors (and managers, for their own records) request a correction with a reason; a manager approves or rejects it. Managers can correct records directly.
- Corrections keep an audit history: who requested, who approved, what changed, when, the previous values, and the reason.

## 7. Notifications

- In-app, delivered **live via Supabase Realtime**. Email comes later (not in v1).
- **Editors** are notified when:
  - they get an assignment,
  - a package is reassigned away from them or to them,
  - feedback is requested (Apply Feedback),
  - a package is approved,
  - a Completed package of theirs is reopened.
- The **responsible manager** is notified when a package is submitted.
- Notifications have read/unread state.
- **(Proposal)** Also notify: the editor when a deadline changes or a package is put on hold or cancelled; the new responsible manager when that changes; managers when an attendance correction is requested; the requester when it is approved or rejected.

## 8. Interface priorities

### Manager dashboard
- Packages awaiting review
- Active assignments and editor workload (**count of active packages per editor**)
- Upcoming deadlines and overdue packages
- Filters by client, product, editor, and status
- Pending attendance correction requests
- Access to staff attendance and personal clock-in/out

### Editor dashboard
- My assigned packages and deadlines
- Packages that need feedback changes
- Submission actions and status
- Previous/completed work
- Personal clock-in/out, attendance history, and correction requests

### Admin
- Staff list: invite, change role, deactivate

### Shared
- Notifications (live)
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
- Self sign-up

## 10. Decisions

Answers to the first round of open questions, 2026-10-21.

| # | Topic | Decision |
|---|---|---|
| 1 | Admin role | The admin is a separate person. |
| 2 | Responsible manager | Can change after assignment. Default: see F1. |
| 3 | Assignment | Exactly one editor per package. Reassignment is allowed; both the previous and new editor are notified. |
| 4 | Deliverables | Free text for now. |
| 5 | Submission shape | One review link and one delivery link per round. The delivery link is not required on every submit. |
| 6 | Feedback note | Apply Feedback has an optional short note. |
| 7 | Other statuses | Add On Hold, Cancelled, Archived. Completed packages can be reopened. |
| 8 | Deadline | Date and time (Manila). Managers can change deadlines. |
| 9 | Attendance corrections | Editors request, managers approve. Forgotten open sessions are auto-closed. |
| 10 | Overnight attribution | A session counts toward its clock-in date. |
| 11 | Auth | Invite-only accounts created by the admin. Sign-in method: see F6. |
| 12 | Workload metric | Count of active packages per editor. |
| 13 | Deactivation | Departed staff keep their history but can no longer log in. |
| 14 | Live updates | Supabase Realtime for notifications. |

### Follow-up questions

Assumptions are written into the sections above; confirm or correct them.

- **F1. Responsible manager default:** default to the product's assigned manager (falling back to the client's), editable by managers? *(Assumed yes.)*
- **F2. Delivery link before approval:** must at least one round have a delivery link before a manager can approve, or can a package complete with none?
- **F3. Reopen target:** does reopening a Completed package go to Apply Feedback (editor revises and resubmits as a new round) or back to In Progress? *(Assumed Apply Feedback.)*
- **F4. Deadline audit:** deadline changes are shown in activity history (old → new, who, when). Should a reason be required?
- **F5. Auto-close threshold:** after how many hours is an open session auto-closed, and what clock-out time is recorded (the threshold time, or left for correction)? Auto-close needs a scheduled job (e.g. Supabase `pg_cron`).
- **F6. Sign-in method:** email + password, or magic link? Does the invite email let the person set a password?
- **F7. Live review queue:** should the manager's review queue also update live via Realtime, or only notifications?

## 11. Proposals (not approved)

- **(Proposal)** Deadline-approaching reminder notifications.
- **(Proposal)** Extra notifications listed in §7.
- **(Proposal)** Supabase Realtime for the review queue (F7).
- **(Proposal)** UI dependencies: Tailwind CSS v4 + shadcn/ui (Radix), lucide-react, react-router, @tanstack/react-query.

## Implementation status

| Area | Status |
|---|---|
| Project scaffold (Vite + React + TS, ESLint) | ✅ Exists (Vite starter page only) |
| Supabase client dependency + CLI config | ✅ Installed, not wired up (no client, env, or migrations) |
| Requirements: first round of open questions | ✅ Decided (follow-ups F1–F7 pending) |
| Auth and roles | Not started |
| Clients / products / packages | Not started |
| Package workflow and statuses | Not started |
| Submissions and history | Not started |
| Attendance and corrections audit | Not started |
| Notifications | Not started |
| Manager / editor / admin dashboards | Not started |
| Design system | Proposed, awaiting approval |
