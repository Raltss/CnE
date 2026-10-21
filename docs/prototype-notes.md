# CnE prototype — Milestone 1 notes

An interactive frontend prototype that runs on **local demo data**, with no real authentication.

> **Update (Milestone 2):** the app now uses Supabase by default (see [`backend-plan.md`](backend-plan.md)). This demo is still available as an opt-in mode: add `VITE_USE_DEMO_DATA=true` to `.env.local`. The notes below describe that demo mode.

## Run it

```bash
npm install
echo "VITE_USE_DEMO_DATA=true" >> .env.local
npm run dev        # http://localhost:5173
npm run build      # type-check + production build
npm run lint
```

## Code layout

| Path | Purpose |
|---|---|
| `src/data/types.ts` | Domain types, shaped like the planned Supabase tables |
| `src/data/workflow.ts` | Pure workflow rules: transitions, permissions, notifications, attendance, auto-close |
| `src/data/validation.ts` | Form/link validation shared by the UI and the workflow |
| `src/data/selectors.ts` | Read-only derivations (overdue, workload, filters) |
| `src/data/seed.ts` | Fictional demo data, built by replaying the workflow commands |
| `src/data/demoBackend.ts` | localStorage-backed store (was `store.ts`). `src/data/store.ts` now picks between this and `supabaseBackend.ts` |
| `src/data/hooks.ts` | `useAppState` (was `useDemoState`), `useStoreStatus`, `useNow` |
| `src/session/` | Demo account switcher (not auth) |
| `src/components/ui/` | Generic UI: Dialog, Field, Toast, EmptyState, Callout, Section |
| `src/components/domain/` | StatusBadge, DeadlineBadge, PackageTable, SubmissionForm, SubmissionHistory, ActivityTimeline, ClockControls, AttendanceTable, NotificationList |
| `src/layout/` | AppShell (sidebar / icon rail / bottom bar), DemoBar, nav config |
| `src/pages/` | Routes for managers, editors, and shared pages |
| `design-system/cne/MASTER.md` | Approved design tokens and rules |

## Implementation decisions

- **Dependencies:** only Tailwind CSS v4, lucide-react, and react-router were added. Dialogs use the native `<dialog>` element (built-in focus trap and Esc), so shadcn/ui/Radix isn't needed yet. Data is synchronous and local, so TanStack Query isn't needed yet. Both stay approved for the Supabase milestone.
- **Shared state:** every demo account reads and writes one shared state in `localStorage` (`cne.demo.state`), so switching accounts shows consistent data. Other tabs in the same browser pick up changes through the `storage` event. Each command re-reads the latest stored state before applying, so the one-open-session rule holds across tabs.
- **Seed data** is generated relative to the current time, so deadlines and attendance always look current. It replays real workflow commands, so seeded history follows the same rules. The demo includes 2 managers, 6 editors, 4 clients, 8 products, and 16 packages across all five workflow statuses, with overdue work, a reused-link round, an overnight shift, and an auto-closed session.
- **Submissions:** at least one link (review or delivery) is required. Every submit creates a new round record, even if the links are identical (the history notes "Same links as Round N").
- **Approval needs a delivery link** (PRD default). A round with only a review link can't be approved. The Approve button is disabled with an explanation, and the manager can mark Apply Feedback instead.
- **Responsible manager** defaults to the product's manager, or the client's if the product has none. It can be changed. Any manager can review and approve; only the responsible manager is notified of submissions.
- **Editing** works on every non-completed package. Reassigning notifies both editors, changing the deadline notifies the editor, and changing the responsible manager notifies the new manager. All changes are logged in Activity.
- **Required package fields:** title, client, product, editor, responsible manager, and deadline (which must be in the future when set or changed). The brief, references, deliverables, and description are optional. Links must be full `http(s)` URLs.
- **Attendance:** sessions live in storage, so closing or refreshing the page never clocks anyone out. A session counts toward its clock-in date, and overnight clock-outs show the next date. Sessions open 16 hours or longer are closed at clock-in + 16h and flagged **Auto-closed**. This runs when the app loads, every minute while it's open, and before any action. Clock-out asks for confirmation.
- **Times:** all display and deadline entry use Asia/Manila (UTC+8, no DST), labeled PHT.
- **Permissions** are checked in `workflow.ts` (e.g. only the assigned editor can start or submit, only managers can review) and reflected in the UI. They're for demonstration only, not security.

## Testing the workflow

1. In the yellow **Demo data** bar, choose **Andrea Santos (Manager)** under *Demo account*.
2. **Packages → New package.** Fill in the details, assign **Bea Lim**, and save. You land on the package (status Assigned).
3. Switch to **Bea Lim (Editor)**. The bell shows a new notification. Open it, or find the package in **My Work**, then click **Start work**.
4. On the package, submit a **Review link** only (e.g. `https://f.io/test-r1`). Submitting with no links shows an error.
5. Switch to the responsible manager (the bell shows the submission). Open the package: **Approve** is disabled because there's no delivery link. Click **Apply Feedback** and add an optional note.
6. Switch back to Bea. The package is under **Needs Changes** with the note. Resubmit with the same review link plus a **Delivery link**. Submission history now shows Round 1 and Round 2 as separate records.
7. Switch to a manager and click **Approve**, then confirm. The package is Completed, Bea is notified, and it appears in Bea's **History**.
8. **Attendance:** click **Clock in** in the top bar, refresh the page, and you're still clocked in. A second clock-in isn't possible. Ivan Torres shows overnight sessions, and Rina Bautista has an Auto-closed one.
9. Refresh at any point and all changes persist. **Reset demo data** in the demo bar restores the sample data after a confirmation.

## Outside this milestone (labeled in the UI where relevant)

- Supabase connection, real sign-in, invites, RLS, Realtime, and the admin staff/roles screens
- On Hold / Cancelled / Archived / Reopen (the types exist; no transitions yet)
- Attendance correction requests and approvals with an audit history (shown as "later milestone" on the Attendance page)
- Client and product management screens (clients and products come from the seed data)
- Email notifications, and deadline reminders (still a proposal)
