# Design System Master File — CnE ("Playhead")

> **LOGIC:** When building a specific page, first check `design-system/cne/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file. Otherwise follow the rules below.

**Project:** CnE (internal workflow tool for a video editing agency in Manila)
**Redesigned:** 2026-10-26 at the user's request with the Seenry skill (`seenry`): identity first, three identity boards picked blind against category leaders (Frame.io, Linear, Attio), then built and checked with Seenry's gates. It replaces the 2026-10-21/23 UI UX Pro Max system (terracotta on cream, Nunito Sans + Fraunces).

---

## Brand guidelines

- **Idea.** Where now is, and whose turn it is. Every cut moves against an out-point (its deadline) in Manila time, and every round waits on someone. The app's first job is to show both at a glance.
- **Device: the playhead.** A 2px vertical line in playhead red with a small flag at now. It appears only where it carries information: the deadline track (Dashboard, My Work, Overview, Deadlines), the rounds track on a package, the open session on Time Clock and My Work, today's column on Calendar, the runway in table rows, and the Manila clock on sign-in. Anything left of the playhead and still active is overdue, drawn in the same red.
- **Register.** Quiet premium. Neutrals do the work; the only full color field is the bay (the dark sidebar and top bar); playhead red is reserved for now and overdue.
- **Voice.** Plain, specific, in Manila time. Say the day the way people say it ("Today, 6:00 PM", "Tomorrow, 12:00 PM"), countdowns as "in 21h 14m" and "1d 3h late". Status words follow the PRD (Overdue, Apply Feedback, With Client).
- **Rules** (testable):
  1. Red (`now`) appears only for now and overdue: the playhead, overdue badges and counts, late countdowns. Never for decoration, never for a plain count.
  2. One action color: ink (`primary`). One filled primary button per region; row actions are secondary.
  3. Codes and rounds (`PKG-1042`, `R2`) are set in Geist Mono; times, durations and counts in Geist with `tabular-nums`. Separators (`·`) stay in the sans.
  4. No icon tiles, no colored left stripes, no uppercase eyebrows, no dots before text (except a marked `data-seenry-dot` presence or unread marker).
  5. Nothing people read is under 13px; meta and column headers 14px; cells and row text 15px.

## Color tokens

Components use the Tailwind utilities generated in `src/index.css` (`bg-surface`, `text-muted-fg`, `bg-now`, `bg-chrome`, …), never raw values. Tokens are authored in OKLCH; hex below is for reference. Every text and control pair was measured: body and meta text ≥ 4.5:1, control borders ≥ 3:1, in both themes.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-bg` | `#F8F9FB` suite grey | `#0D0E11` | App canvas |
| `--color-surface` | `#FFFFFF` monitor white | `#141619` | Cards, tables, dialogs |
| `--color-surface-2` | `#F2F4F6` | `#1C1E22` | Table headers, segmented controls, notes, hover |
| `--color-fg` | `#15181E` ink | `#EFF0F3` | Text (17.7:1 / 15.9:1) |
| `--color-muted-fg` | `#54585F` | `#A8ABB0` | Secondary text (7.1:1 / 7.9:1) |
| `--color-border` | `#E2E4E7` | white 9% | Hairlines |
| `--color-border-strong` | `#898C92` | `#6B6F75` | Input and secondary-button borders (3.4:1 / 3.6:1) |
| `--color-primary` | `#15181E` ink | `#EDEEF1` | The action color: primary buttons, focus ring |
| `--color-on-primary` | `#FCFCFC` | `#0F1216` | Text on primary |
| `--color-now` | `#CE2D11` playhead red | `#F3654C` | Now and overdue only (5.2:1 / 5.8:1 as text) |
| `--color-chrome` | `#15171B` bay graphite | `#06070A` | Sidebar, top bar, phone tab bar (`.chrome`) |
| `--color-chrome-fg` / `-strong` / `-muted` | `#C8CBCE` / `#F4F5F7` / `#9C9EA3` | `#C2C4C8` / `#F4F5F7` / `#8F9297` | Text on the bay (11:1 / — / 6.7:1) |
| `--color-chrome-2` / `-3` | `#202327` / `#2B2E33` | `#121417` / `#1C1E22` | Hover and selected on the bay |
| `--color-live` | `#58CD78` | same | Clocked-in presence dot on the bay (8.9:1 on graphite) |
| `--color-danger` / `-bg` | `#C22826` / `#FFEBE7` | `#F47C70` / `#3F1916` | Errors, destructive buttons |
| `--color-success` / `-bg` | `#21763C` / `#E2F9E6` | `#6FC884` / `#15291A` | Success toasts, presence in lists |
| `--color-warning` / `-bg` | `#915C08` / `#FFF1D6` | `#E6B55D` / `#32240A` | Heads-up notes, busy days, extra revisions |
| `--color-info` / `-bg` | `#2863AB` / `#E7F3FF` | `#85B4F0` / `#162537` | Info icons |
| `--color-chart-1` / `-2` | `#2A78D6` / `#EB6834` | `#3987E5` / `#D95926` | Reports series (validated with the dataviz checks) |

The bay overrides the focus ring to `chrome-strong` so focus stays visible on graphite.

### Theme

- `data-theme="light" | "dark"` on `<html>` picks the token set. An inline script in `index.html` sets it before the first paint; `src/lib/theme.ts` keeps it in step afterwards.
- The choice is per browser (`localStorage` key `cne-theme`): Light, Dark, or Match device (the default). The top bar has a one-tap toggle on tablet and desktop; Your account has the three-way choice (the only place on phones).
- Dark is its own palette: surfaces rise in lightness, the bay sits darker than the canvas.

### Status colors

A status always shows an **icon and a text label**, never color alone. Pills are quiet tints at one lightness (`h-6`, 14px/500). Overdue is the one status at full strength (solid playhead red, white text).

| Status | Light fg / bg | Icon (lucide) |
|---|---|---|
| Assigned | `#52555B` / `#EDEEF1` | `Circle` |
| In Progress | `#195DAA` / `#E5F1FF` | `Play` |
| Submitted | `#6744AC` / `#F1EDFF` | `Upload` |
| With Client | `#056774` / `#DEF5F9` | `Send` |
| Apply Feedback | `#9B4805` / `#FFECDC` | `RotateCcw` |
| Completed | `#206B38` / `#E3F6E6` | `Check` |
| On Hold | `#7D5E07` / `#FDF2D0` | `Pause` |
| Cancelled / Archived | `#585B5F` / `#EDEEF1` | `X` / `Archive` |
| Overdue (modifier) | white on `#CE2D11` | `TriangleAlert` |

## Typography

- **Geist** 400/500/600 (Google Fonts) for everything people read. Page titles 28/34 600 at −0.025em; section titles 16/24 600; body 16/24; UI, cells and row text 15/22 (`text-ui`); meta and column headers 14/20 (`text-sm`); short labels and badges 13/18 (`text-xs`, the floor).
- **Geist Mono** 400/500 for the data voice: package codes, round labels (R1, R2) and the display clocks (Time Clock, sign-in).
- Weights by role: 400 values and body, 500 labels, controls and row titles, 600 titles and key figures. Never 700.
- Inputs are 16px on phones so iOS doesn't zoom.

## Spacing, radius, elevation

- 4px base: 4 / 8 / 12 / 16 / 20 / 24 / 32 / 48. Pages: 32px gutters on desktop, 16px on phones, content max 1280px; 24px between sections.
- Radius family (product): 6 small parts · **8 controls** (buttons and inputs share it) · **12 cards, tables, panels** · **16 dialogs, toasts** · full for pills, avatars and the clock pill.
- One control height: 44px on desktop, 48px on phones (buttons, inputs, selects); 36px for compact row actions.
- Separate by space and surface tone; cards carry one hairline. Shadows only on dialogs, menus and toasts.

## Motion

- Hover and press 120ms (press scales to 0.98); tabs, toggles and segmented controls 180ms; dialogs rise 8px and fade in 240ms (`animate-rise-in`), toasts the same; the full-page loader fades in late (300ms delay).
- Easing: `ease-out` = `cubic-bezier(0.23, 1, 0.32, 1)`; `ease-move` for the playhead sliding to its new minute.
- No hover lift, no scroll choreography, no animation on 100+/day actions. `prefers-reduced-motion` makes every transition instant (`--cne-instant`).

## Components

- **Shell (`AppShell`):** the bay. Sidebar 240px (icon rail 64px on tablet) with the playhead wordmark, quiet nav counts (mono-free tabular figures; overdue count in a red chip), the person row and sign out. Top bar: Manila date and time, the clock pill (green presence dot, session duration, Clock out), theme toggle, bell. Phones: top bar with the mark, clock pill, bell and an avatar link to Your account; a sticky bottom tab bar (≤5 items, "More" for the rest).
- **Deadline track (`DeadlineTrack`):** the signature. Packages as rows on one seven-day Manila axis (two days back, five ahead): the runway bar from now to the deadline (ink) or the overrun past it (red), the out-point tick at the deadline, the latest round as a dot joined to now by a dashed "waiting" line, one playhead crossing every row. Columns: package (title, `PKG · R · …` meta), timeline, deadline, one action. It is a table for assistive tech (`role="table"`). Phones: rows with the countdown and the due time.
- **Rounds track (`RoundsTrack`):** a package's life from assignment to its out-point, rounds colored by outcome and labeled R1…, completion as a diamond, the playhead at now.
- **Runway (`RunwayTrack`):** the small track in table and list rows (two days back, a week ahead).
- **Figure strip (`KpiStrip`/`KpiStat`):** figures in one divided strip, label above, number at 28px, one line of context; no icon tiles. Overdue figures take the red.
- **Segmented (`Segmented`):** views of one list as links in the URL; a native select on phones.
- **Buttons:** primary (ink fill), secondary (surface + border), ghost, danger (outlined red). **Inputs:** label above (14/500), hint below (14px), error under the field with `aria-invalid`; one chevron on every select.
- **Tables:** 15px cells, 14px header row on `surface-2`, row hover tint, product under the title instead of its own column; compact rows on phones.
- **Dialogs:** native `<dialog>`, 16px radius, header / body / footer on `surface-2`, close button, max 512px (672px `wide` for lists).
- **Notes (`Callout`):** quiet `surface-2` with a colored icon; warning and error notes take their tint.
- **Empty states:** icon in a neutral disc, a title that names the condition, one line on what to do.

## Navigation

- ≥1024px: sidebar and top bar. 768–1023px: icon rail. <768px: bottom tab bar (≤5 items) and top bar.
- Every page, view and filter has its own URL.

## Anti-patterns

- ❌ Red for anything but now and overdue. ❌ More than one filled primary in a region.
- ❌ Icon tiles in cards, colored left stripes, uppercase eyebrows, dots before text.
- ❌ Raw color values in components. ❌ Color-only status. ❌ Text under 13px.
- ❌ Fraunces, Nunito, cream + terracotta (the previous system's defaults).

## Pre-delivery checklist

- [ ] Status badges show an icon and a label
- [ ] Text contrast ≥ 4.5:1 and control borders ≥ 3:1 in light and dark
- [ ] Visible focus on every interactive element, including on the bay
- [ ] Loading, empty, error, and success states present
- [ ] Responsive at 390 / 768 / 1024 / 1440px, no horizontal page scroll
- [ ] `prefers-reduced-motion` respected
- [ ] All times in Asia/Manila
