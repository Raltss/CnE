# CnE

Internal workflow app for a video editing agency: packages (Product → Package) assigned to editors, a review loop with external review and delivery links (Frame.io, Google Drive, …), submission history, in-app notifications, and clock-in/out attendance. Admins manage staff access and oversee all work read-only.

React 19 + TypeScript + Vite, with Supabase for the database, email/password sign-in, and Realtime. All permissions are enforced in the database (Row Level Security and checked workflow functions).

## Run it

You need Node 22+ and a Supabase project with the migrations applied ([`docs/supabase-setup.md`](docs/supabase-setup.md)).

```bash
cp .env.example .env.local    # then fill in VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
npm install
npm run dev                   # development server, http://localhost:5173
```

Production build and local preview:

```bash
npm run build                 # type-check + build into dist/
npm run preview               # serve dist/ at http://localhost:4173
```

## Checks

```bash
npm run lint
supabase/sql-tests/run-on-plain-postgres.sh "postgresql://postgres@127.0.0.1:5432/postgres"   # scratch database only
node supabase/e2e/verify-backend.mjs   # needs CNE_* variables; see supabase/e2e/README.md
```

## Documentation

- [`docs/product-requirements.md`](docs/product-requirements.md): requirements, decisions, and implementation status
- [`docs/supabase-setup.md`](docs/supabase-setup.md): connecting a project, migrations, the first admin, adding staff, verification
- [`docs/how-the-app-works.md`](docs/how-the-app-works.md): how the code fits together, with a walkthrough you can try
- [`docs/backend-plan.md`](docs/backend-plan.md): data model, security, and test results
