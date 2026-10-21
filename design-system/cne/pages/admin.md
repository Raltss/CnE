# Page override: Admin oversight

> Overrides `../MASTER.md` for the admin pages: `/overview`, `/team`, `/team/:id`, `/staff`, and the admin view of `/packages`, `/packages/:id`, and `/attendance`. Anything not listed here follows Master.
> Added 2026-10-21 at the user's request: the admin oversees everyone's work read-only and manages staff access.

**Density:** 5/10 on Overview (like the manager dashboard), Master's 8/10 on tables (Team, person tabs, Staff).

## Viewing is not acting

- Every oversight screen starts with the **View only** note (`ViewOnlyBanner`): info tone, eye icon, one or two sentences. On a person's page it names the admin ("You're signed in as yourself…") and the person being viewed.
- No workflow buttons for admins anywhere (Start, Submit, Approve, Apply Feedback, Edit, New package). The package Actions panel shows "View only" with links to the editor's and manager's pages instead.
- There's no "view as" or account switching. Links go to the person's page, never to their session.
- Real actions exist only in **Staff & Roles**, behind a dialog that ends with "Recorded in the account history as done by you (<name>)". **Add user** is the page's primary button. Deactivation is a confirm step inside the same dialog (danger button, warning about open packages). Never stack two dialogs.

## Layouts

```
Overview
Team overview · date                                     (no primary action)
[View only]  [N accounts waiting → Staff & Roles]        ← warning callout only when someone waits
┌ Active ┐┌ Overdue ┐┌ Pending reviews ┐┌ Clocked in now ┐   ← 4 tiles; first three open dialogs, the last links to Attendance
┌ Editor workload (rows → /team/:id) ┐┌ Clocked in now (rows → attendance tab) ┐
│                                    │└ Managers: reviews waiting, responsible ┘
└────────────────────────────────────┘
```

- **Team:** tabs Editors | Managers (`?role=`), an Access filter (`?access=`), and a table with right-aligned counts (overdue in danger color only when above zero) and "Right now" clock status. Stacked cards below 768px.
- **Person page:** back link, header card (name, role badge, access badge, clock status, "Manage access" secondary button), View only note, 4 KPI tiles that link to the matching tab and filter, then tabs as links (`?tab=`):
  - Editor: Assignments · Submissions · Attendance
  - Manager: Packages (responsible or created) · Review queue · Decisions · Attendance
  - Filters sit above each tab's table in a 1/2/4-column grid; each value is in the URL. Switching tabs clears the filters.
- **Staff & Roles:** access tabs (All, Waiting, Active, Deactivated) with counts; the account list (waiting first) and the account history side by side at ≥1280px, stacked below that.

## Add user and passwords

- **Add user dialog:** full name, work email (hint "They sign in with this"), job title (optional), the shared `RolePicker`, and a temporary password with a show/hide icon button and a "Generate a password" ghost button (14 characters, no look-alike characters, shown in a monospace font). Footer button names the role ("Add editor"). A shield note says no email is sent and the change is recorded under the admin.
- **Success step** in the same dialog: warning callout ("copy the password now, it isn't shown again"), email and password in a bordered list with copy icon buttons, then "Add another" or "Done".
- **Temporary password** badge (info tone, key icon) on accounts that haven't chosen their own password yet.
- **Choose your password** (first sign-in) uses the sign-in card layout; **Your account** is a normal page: Profile card (2/5) and Change password (3/5) on desktop, stacked on mobile. Password forms: visible labels, an 8–72 hint, one "Show passwords" toggle, inline errors.

## Badges

- Role badge: neutral pill (`surface-2`), lucide icon + label (Admin: shield-check, Manager: briefcase, Editor: film).
- Access badge: Active (success, circle-check), Waiting for approval (warning, circle-dashed), Deactivated (closed gray, circle-off).
- Outcome badge for submission rounds: Awaiting review / Apply Feedback / Approved, same colors as the package statuses.

## Navigation

Admin sidebar: Overview · Team · Packages · Attendance · Staff & Roles (5 items, so the mobile bottom bar needs no "More"). The Staff & Roles badge counts accounts waiting for approval. No clock pill and no notifications bell.
