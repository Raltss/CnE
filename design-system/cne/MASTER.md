# Design System Master File — CnE

> **LOGIC:** When building a specific page, first check `design-system/cne/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file. Otherwise follow the rules below.

**Project:** CnE (internal workflow tool for a video editing agency)
**Generated:** 2026-10-21 with UI UX Pro Max (`--design-system`, Productivity Tool), then aligned with the approved interface proposal in `docs/product-requirements.md` §11.
**Design Dials:** Variance 3/10 (minimal) · Motion 2/10 (subtle) · Density 8/10 (dense dashboard)

Changes from the raw generator output (approved in the proposal):
- Neutral slate background instead of a tinted teal (`#F0FDFA`); it reads better in dense tables.
- A darker teal primary (`#0F766E`) with **white** text (5.4:1), instead of `#0D9488` with black text.
- The "Product Demo + Features" landing pattern and the GSAP scroll reveal are dropped. This is an internal tool, with no scroll animation.

---

## Color tokens

Components use semantic tokens only (Tailwind utilities such as `bg-surface`, `text-muted-fg`, `border-border`), never raw hex. Tokens are defined in `src/index.css`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-primary` | `#0F766E` | `#2DD4BF` | Primary actions, active nav, links |
| `--color-on-primary` | `#FFFFFF` | `#042F2E` | Text on primary |
| `--color-accent` | `#C2410C` | `#FB923C` | Needs-attention highlights |
| `--color-bg` | `#F8FAFC` | `#0B1120` | App background |
| `--color-surface` | `#FFFFFF` | `#111827` | Cards, tables, dialogs |
| `--color-surface-2` | `#F1F5F9` | `#1F2937` | Table headers, subtle fills |
| `--color-fg` | `#0F172A` | `#F1F5F9` | Body text |
| `--color-muted-fg` | `#475569` | `#94A3B8` | Secondary text |
| `--color-border` | `#E2E8F0` | `#1F2937` | Dividers, inputs |
| `--color-ring` | `#0F766E` | `#2DD4BF` | Focus rings |
| `--color-danger` | `#B91C1C` | `#F87171` | Errors, overdue |
| `--color-success` | `#15803D` | `#4ADE80` | Success toasts |

### Status colors

A status always shows an **icon and a text label**, never color alone. Each status has a `fg` token and a tinted `bg` token, e.g. `--color-status-submitted` / `--color-status-submitted-bg`.

| Status | Color | Icon (lucide) |
|---|---|---|
| Assigned | slate `#475569` | `Circle` |
| In Progress | blue `#1D4ED8` | `Play` |
| Submitted | violet `#6D28D9` | `Upload` |
| Apply Feedback | orange `#C2410C` | `RotateCcw` |
| Completed | green `#15803D` | `Check` |
| On Hold | amber `#B45309` | `Pause` |
| Cancelled | gray `#6B7280` | `X` |
| Archived | gray `#6B7280` | `Archive` |
| Overdue (modifier) | red `#B91C1C` | `TriangleAlert` |

## Typography

- **Plus Jakarta Sans** 400/500/600/700 (Google Fonts) for all text.
- `tabular-nums` for numbers, times, counts, and durations.
- Scale: 12 (meta) / 14 (table body, dense UI) / 16 (body, inputs) / 18 / 20 / 24 / 30. Line height 1.5 for body, 1.25 for headings.
- Inputs use 16px text so iOS doesn't zoom on focus.

## Spacing, radius, elevation

- 4px base. Dense scale: 4 / 8 / 12 / 16 / 24 / 32.
- Radius: 6px for controls, 8px for cards, 12px for dialogs.
- Shadows only on overlays (dialogs, menus, toasts). Cards use a 1px border, no shadow.

## Motion

- 150–250ms color/opacity transitions on hover and focus. No layout-shifting transforms.
- Respect `prefers-reduced-motion`: disable transitions.

## Components

- **Buttons:** primary (filled with primary), secondary (bordered on surface), ghost, and danger. Minimum height 40px desktop and 44px touch, with a visible focus ring (2px ring + 2px offset). Disabled buttons explain why nearby.
- **Inputs:** visible label above the field, helper text below, inline error under the field with `aria-invalid` and `aria-describedby`. Required fields are marked "Required" in text.
- **Cards:** surface, 1px border, 8px radius, 16px padding. Not clickable as a whole unless they hold a single link.
- **Tables:** 14px text, sticky header on `surface-2`, row hover tint. Collapse to stacked cards below 768px.
- **Dialogs:** native `<dialog>` (focus trap, Esc to close, focus returns to the trigger). Max width 560px.
- **Toasts:** bottom-right (bottom-center on mobile), `role="status"`, auto-dismiss after 4s, dismissible.

## Navigation

- ≥1024px: sidebar (240px) and top bar. 768–1023px: icon rail. <768px: bottom tab bar (≤5 items) and top bar.
- Every page and every filter combination has its own URL.

## Anti-patterns

- ❌ Emojis as icons. Use lucide.
- ❌ Raw hex in components.
- ❌ Color-only status.
- ❌ Placeholder-only labels.
- ❌ Removing focus outlines.
- ❌ Horizontal page scroll on mobile.

## Pre-delivery checklist

- [ ] Status badges show an icon and a label
- [ ] Text contrast ≥ 4.5:1 in light and dark
- [ ] Visible focus on every interactive element; logical tab order
- [ ] Loading, empty, error, and success states present
- [ ] Responsive at 375 / 768 / 1024 / 1440px, with no horizontal scroll
- [ ] `prefers-reduced-motion` respected
- [ ] All times in Asia/Manila
