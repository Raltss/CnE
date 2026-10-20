# CLAUDE.md

CnE is an internal workflow web app for a video editing agency: packages (Client → Product → Package), review workflow, attendance, and in-app notifications.

**Source of truth for requirements:** [`docs/product-requirements.md`](docs/product-requirements.md). Read it before planning or implementing features, and update its "Implementation status" table as work lands.

## Stack

- React 19 + TypeScript + Vite
- Supabase (database + auth) via `@supabase/supabase-js`; local config in `supabase/config.toml`

Do not change the approved stack. Label any new dependency or feature not in the requirements as a **proposal** and get approval before adding it.

## Commands

- `npm run dev`: Vite dev server
- `npm run build`: type-check + production build
- `npm run lint`: ESLint
- `npx supabase start`: local Supabase stack

## UI work

- All UI design and implementation must use the **UI UX Pro Max** skill (`ui-ux-pro-max:ui-ux-pro-max`, plus `ui-ux-pro-max:ui-styling` / `design-system` as needed).
- Once the interface proposal is approved, the design system will live in `design-system/cne/MASTER.md`, with page overrides in `design-system/cne/pages/`. Follow it, and don't regenerate it with `--force` without approval.
- Use semantic color tokens, not raw hex in components. Statuses always show an icon and a label, never color alone. Meet WCAG AA, keep focus visible, and handle loading, empty, error, and success states.

## Domain rules

- Display all times in **Asia/Manila**.
- Never build video upload, hosting, or storage. Videos stay on Frame.io, Google Drive, etc.; we store links only.
- Keep every submission round. Attendance corrections must keep an audit history.
- Allow at most one open clock-in session per person, and support overnight sessions.

## Known issues

- `README.md` contains unresolved merge-conflict markers.
- `supabase/config.toml` `auth.site_url` is `http://127.0.0.1:3000`, but Vite serves on `5173` by default.
