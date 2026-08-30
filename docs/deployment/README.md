# Deployment

Three pieces to deploy: **Supabase** (database/auth/storage), **Render**
(the Node API and the Python document-processing service), and
**Vercel** (the React frontend). None of this has been executed against
real infrastructure in this repository's history (see ROADMAP.md) - this
document is the concrete, step-by-step path to do it.

## 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Install the [Supabase CLI](https://supabase.com/docs/guides/cli) and
   authenticate: `supabase login`.
3. Link the repo to the project: `supabase link --project-ref <ref>`
   (run from the repo root, where `supabase/config.toml` lives).
4. Apply the schema: `supabase db push`. This runs every file in
   `supabase/migrations/` in order - see DATABASE.md for what each one
   does.
5. **Do not** run `supabase/seed/seed.sql` against production - it's
   development/demo data only. If you want it for a staging project:
   `psql "$SUPABASE_DB_URL" -f supabase/seed/seed.sql`.
6. In the Supabase dashboard, under Project Settings → API, copy:
   - **Project URL** → `SUPABASE_URL` (api) / `VITE_SUPABASE_URL` (web)
   - **anon public key** → `SUPABASE_ANON_KEY` / `VITE_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (api only -
     **never** put this in `apps/web`'s env or any `VITE_`-prefixed
     variable; it must never reach the browser)
7. Configure Auth → Email templates / SMTP if you want Supabase's own
   mail sending for the staff password-reset flow (`resetPasswordForEmail`
   from the frontend). This is separate from the student password-reset
   flow, which goes through the pluggable `EmailProvider` in `apps/api`
   (see SECURITY.md) - configure a real provider there too before
   relying on it.
8. Under Storage, confirm the `examination-papers` bucket exists (it's
   created by the `..._storage.sql` migration) and is **not** public.

## 2. Render (API + document-service)

The repo includes `render.yaml` (a Render Blueprint) for both services.

1. In the Render dashboard: **New +** → **Blueprint**, point it at this
   repository.
2. Render will detect `render.yaml` and propose the `njala-api` and
   `njala-document-service` web services (both `runtime: docker`).
3. Before the first deploy, set every env var marked `sync: false` in
   `render.yaml`:
   - `njala-api`: `API_PUBLIC_URL` (this service's own Render URL),
     `WEB_APP_URL` (the Vercel URL from step 3), `SUPABASE_URL`,
     `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
     `CORS_ALLOWED_ORIGINS` (the Vercel URL), `DOCUMENT_SERVICE_URL`
     (the `njala-document-service` Render URL, once known).
   - `njala-document-service`: `DOCUMENT_SERVICE_SHARED_SECRET` (must
     be identical to `njala-api`'s `DOCUMENT_SERVICE_CALLBACK_SECRET`,
     which Render auto-generates - copy it over manually), and
     `NODE_API_CALLBACK_URL` = `https://<njala-api URL>/api/internal/processing-callback`.
4. Both services expose `/health` (document-service) and `/api/health`
   (api) as their Render health check path, already set in
   `render.yaml`.
5. First deploy will build from `apps/api/Dockerfile` /
   `apps/document-service/Dockerfile` respectively - `dockerContext` is
   set correctly in `render.yaml` (repo root for the API, so it can see
   `packages/shared`; `apps/document-service` for the Python service).

## 3. Vercel (web)

1. Import the repository into Vercel.
2. Set **Root Directory** to `apps/web` (the included `vercel.json`
   assumes this - its `buildCommand`/`installCommand` `cd ../..` back to
   the monorepo root to build `packages/shared` first).
3. Set environment variables: `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE_URL` (=
   `https://<njala-api Render URL>/api`).
4. Deploy. Framework preset should auto-detect as Vite given
   `vercel.json`.
5. Go back to Render and update `njala-api`'s `WEB_APP_URL` and
   `CORS_ALLOWED_ORIGINS` to the real Vercel URL, then redeploy the API
   (CORS is allow-listed, not wildcarded - see SECURITY.md).

## 4. First SUPER_ADMIN

There is no code path that self-creates a privileged account (see
SECURITY.md). See [bootstrap-admin.md](./bootstrap-admin.md) for the
one-time manual step.

## 5. Smoke test

1. Visit the Vercel URL - the landing page should load.
2. `GET https://<api>/api/health` → `{"status":"ok"}`;
   `GET https://<api>/api/health/ready` → confirms DB connectivity.
3. `GET https://<document-service>/health` → `{"status":"ok"}`.
4. Sign up a student account, log in, browse (empty) papers.
5. Log in as the bootstrapped SUPER_ADMIN, create a faculty/department/
   programme/course/academic year/semester, provision a LECTURER
   account, and upload a test paper through the full workflow to
   `PUBLISHED` to confirm the document-service round-trip (`ocr_status`
   should move to `COMPLETED` and the paper should become searchable).

## Transactional email

Student password resets go through `apps/api/src/lib/email.ts`'s
`EmailProvider` interface, not Supabase's own mailer (Supabase's mailer
would try to deliver to the synthetic
`<student-id>@students.njala.auth.internal` address, which isn't a real
mailbox - see ARCHITECTURE.md). The default `ConsoleEmailProvider` logs
instead of sending. To go live:

1. Implement `EmailProvider` against a real provider (Resend, SendGrid,
   Postmark, or Supabase's own SMTP relay called directly via its API)
   in a new file under `apps/api/src/lib/`.
2. Replace the `emailProvider` export in `email.ts` with an instance of
   your implementation, reading credentials from a new env var you add
   to `.env.example`/`config/env.ts`.
3. Staff password resets are unaffected - they already use Supabase
   Auth's own `resetPasswordForEmail()` from the frontend, which needs
   Supabase's SMTP configured (Auth → Email templates, step 7 above).

## Environment variable reference

See `.env.example` at the repo root and the per-app `.env.example`
files (`apps/api/.env.example`, `apps/web/.env.example`,
`apps/document-service/.env.example`) for the full list with
descriptions. Never commit a real `.env` file - `.gitignore` already
excludes them.

## CI/CD

`.github/workflows/ci.yml` runs on every push/PR to `main` (lint,
typecheck, unit tests, the RLS/RBAC suite, e2e, Python tests, and
production builds). It does not currently deploy anything - Render and
Vercel each have their own git-push-triggered deploy once connected to
this repository, which is the standard, simplest setup for both
platforms and doesn't need a custom GitHub Actions deploy step.
