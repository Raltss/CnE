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

**Revised 2026-10-23 at the user's request:** a warm palette (terracotta on cream, warm browns in dark), a theme choice (Light / Dark / Match device), and new fonts (Nunito Sans + Fraunces). Palette direction from UI UX Pro Max's "warm terracotta + cream" palette; fonts from its "Soft Rounded" pairing (Nunito Sans body) plus Fraunces for titles. Every pair below was checked for AA contrast.

---

## Color tokens

Components use semantic tokens only (Tailwind utilities such as `bg-surface`, `text-muted-fg`, `border-border`), never raw hex. Tokens are defined in `src/index.css`.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-primary` | `#B4471F` | `#F0956B` | Primary actions, active nav, links |
| `--color-on-primary` | `#FFFFFF` | `#2B1208` | Text on primary |
| `--color-accent` | `#A15C07` | `#F5B94A` | Needs-attention highlights (count badges) |
| `--color-bg` | `#FAF6F1` | `#1A1512` | App background |
| `--color-surface` | `#FFFDFA` | `#221C18` | Cards, tables, dialogs |
| `--color-surface-2` | `#F3ECE3` | `#2D2520` | Table headers, subtle fills |
| `--color-fg` | `#2A211B` | `#F4ECE3` | Body text |
| `--color-muted-fg` | `#6E5F53` | `#B8A796` | Secondary text |
| `--color-border` | `#E7DDD1` | `#3A3029` | Dividers |
| `--color-border-strong` | `#A08F80` | `#7A6858` | Input and secondary-button borders (3:1) |
| `--color-ring` | `#B4471F` | `#F0956B` | Focus rings |
| `--color-danger` | `#B42318` | `#F58A7C` | Errors, overdue |
| `--color-success` | `#2B7330` | `#7FCF83` | Success toasts |
| `--color-chart-1` | `#2A78D6` | `#3987E5` | Chart series 1 (Reports: internal revisions) |
| `--color-chart-2` | `#EB6834` | `#D95926` | Chart series 2 (Reports: client revisions) |

Chart colors follow the dataviz method: categorical slots 1–2 of its reference palette, validated with its palette checks against `--color-surface` in each theme (CVD ΔE ≥ 24, normal-vision ΔE ≥ 31, ≥ 3:1 contrast). Values and labels stay in text tokens; every chart has a legend with direct labels, and tables repeat the numbers.

### Theme

- `data-theme="light" | "dark"` on `<html>` picks the token set. An inline script in `index.html` sets it before the first paint; `src/lib/theme.ts` keeps it in step afterwards.
- The choice is per browser (`localStorage` key `cne-theme`): Light, Dark, or Match device (the default, following `prefers-color-scheme` live).
- The top bar and the sign-in screens have a one-tap light/dark toggle; Your account has the three-way choice.

### Status colors

A status always shows an **icon and a text label**, never color alone. Each status has a `fg` token and a tinted `bg` token, e.g. `--color-status-submitted` / `--color-status-submitted-bg`.

| Status | Color | Icon (lucide) |
|---|---|---|
| Assigned | warm gray `#5C4F45` | `Circle` |
| In Progress | blue `#1D4ED8` | `Play` |
| Submitted | violet `#6D28D9` | `Upload` |
| With Client | teal `#0E6A80` (dark `#7DD3E8`) | `Send` |
| Apply Feedback | orange `#B13C0A` | `RotateCcw` |
| Completed | green `#2B7330` | `Check` |
| On Hold | amber `#975106` | `Pause` |
| Cancelled | warm gray `#6B5F56` | `X` |
| Archived | warm gray `#6B5F56` | `Archive` |
| Overdue (modifier) | red `#B42318` | `TriangleAlert` |

## Typography

- **Nunito Sans** 400/500/600/700 (Google Fonts) for all UI text. It has tabular figures, so `tabular-nums` works.
- **Fraunces** 600–700 for `h1` page titles and the CnE wordmark (`font-display`) only. Never for tables, labels, or body text.
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
