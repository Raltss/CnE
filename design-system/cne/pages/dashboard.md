# Page override: Manager dashboard

> Overrides `../MASTER.md` for `/dashboard`. Anything not listed here follows Master.
> Added 2026-10-21 (the dense dashboard was overwhelming); redesigned 2026-10-26 with the Playhead system.

**Density:** 5/10 here (Master is 8/10). The dashboard answers "what needs me now?" in one work surface.

## Layout

```
Dashboard                                                       [+ New package]
Mon, Oct 26, 2026 · 5 waiting for review
┌ [Needs review 5][With client 3][Overdue 4][Due in 48h 9][All active 22] ─────────────┐   ← views in the URL (?view=)
│ Package                     Sat 24  Sun 25  [15:16]  Tue 27 …  Deadline      │
│ Taste test street int… Yours  ·──────┃──────────┤         Thu, Oct 29…  [Review R1] │   ← one playhead across every row
│ PKG-1009 · R1 · waiting 5h · Rafael    (round dot, dashed wait to now, runway, out-point) │
│ …                                                                             │
│ Open the review queue                                                         │
└───────────────────────────────────────────────────────────────────────────────┘
┌ Team workload · 7 of 9 editors have work ─────────────────────────────────────┐
│ Ana Reyes        8 active ›  │ Rafael Bautista   4 active › │ Gabriel Torres … │   ← 3 columns ≥1280, 2 ≥768
│ ■□□■■■■■ 1 overdue · 2 need changes                                           │
└───────────────────────────────────────────────────────────────────────────────┘
```

- **No figure tiles.** The view switcher carries the counts; Overdue's count takes the playhead red when above zero.
- **Default view:** Needs review if anything waits, else Overdue if anything is late, else All active. Each view has its own URL.
- **Rows:** title (with "Yours" when you're the responsible manager in Needs review), `PKG · R · waiting · editor`, the track, the deadline with its countdown, one action: **Review R{n}** (opens the review dialog) for submitted packages, **Open** otherwise. Row actions are secondary buttons of one width.
- **Team workload:** one segment per active package (overdue solid red first, needs changes outlined amber, the rest ink, on hold hollow), the counts in words, a row opens the editor's dialog (their active packages, "Open in Packages").
- Phones: the views become a select; the track becomes rows with the countdown and due time; the track card runs full-bleed.

## Dialogs

- **Review** opens one dialog: latest round links, Approve, Apply Feedback, and "Open full package". Approve-confirm and the feedback note are steps **inside the same dialog**. Never stack two dialogs.
- **Editor rows** open a dialog with that editor's active packages.
- Dialogs are for previews and quick actions only, never primary navigation.

## Related pages

- **Deadlines** (`/deadlines`): three groups (Overdue, Due in the next 48 hours, Later this week), each a deadline track with its count, and an "All packages / I'm responsible" toggle in the URL.
- **Time Clock** (`/time-clock`, managers): Manila time in mono, the open session drawn against its 16-hour auto-close, one clock-in/out button, totals for today and the last 7 days, and the last 7 days of sessions.

## Navigation

Manager sidebar: Dashboard · Review Queue · Deadlines · Packages · Calendar · Time Clock · Attendance · Reports · Notifications. On phones the bottom bar shows the first 4 and a **More** item that opens the rest in a dialog; its badge sums the hidden badges.
