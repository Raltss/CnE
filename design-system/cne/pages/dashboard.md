# Page override: Manager dashboard

> Overrides `../MASTER.md` for `/dashboard`. Anything not listed here follows Master.
> Added 2026-10-21 at the user's request: the dense dashboard was overwhelming.

**Density:** 5/10 here (Master is 8/10). The dashboard answers "what needs me now?" Everything else is one click away, in a dialog or on its own page.

## Layout

```
Hi, <name>  · date · "Here's what needs your attention"          [New package]
┌ Awaiting review ┐┌ Overdue ┐┌ Due in 48 hours ┐┌ Active packages ┐   ← 4 tiles max, each opens a dialog
└─────────────────┘└─────────┘└─────────────────┘└─────────────────┘
┌ Needs your review (≤5 rows, Review → dialog) ┐┌ Team workload (row → dialog) ┐
└──────────────────────────────────────────────┘└──────────────────────────────┘
```

- **No more than 4 KPI tiles.** Each has a number, a label, and one short hint line. 2 columns on mobile, 4 at ≥1280px.
- **No more than 2 content sections.** Lists show at most 5 rows, then link to the full page.
- Upcoming/overdue work lives on **Deadlines** (`/deadlines`); the full active list lives on **Packages**. Neither is repeated on the dashboard.
- Spacing: 24px between sections, 32px below the tile row, 16–20px row padding, 20px horizontal padding in lists.
- Sections align to the top (`items-start`), so a short list doesn't leave a tall empty card.

## Drill-down with dialogs

- **Tiles** open a dialog listing those packages, with "Close" and a link to the full page.
- **Review** opens one review dialog: latest round links, Approve, Apply Feedback, and "Open full package". Approve-confirm and the feedback note are steps **inside the same dialog** ("Back" returns). Never stack two dialogs.
- **Editor rows** open a dialog with that editor's active packages.
- Dialogs are for previews and quick actions only, never primary navigation. Package titles inside them link to the package page.
- Focus: the browser focuses the first control on open; switching steps moves focus to the step's main control.

## Related pages (same relaxed density)

- **Deadlines** (`/deadlines`): three groups (Overdue, Due in the next 48 hours, Later this week), each with a count, and an "All / I'm responsible" toggle in the URL.
- **Time Clock** (`/time-clock`, managers): large Manila clock, status, one clock-in/out button, totals for today and the last 7 days, and the last 7 days of sessions.

## Navigation

Manager sidebar: Dashboard · Review Queue · Deadlines · Packages · Time Clock · Attendance · Notifications. On mobile the bottom bar shows the first 4 and a **More** item that opens the rest in a dialog. Its badge sums the hidden badges.
