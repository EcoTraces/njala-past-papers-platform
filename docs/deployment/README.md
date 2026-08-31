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

## Rollback

- **Render** (`njala-api`, `njala-document-service`): every deploy is
  kept in the service's Deploys tab. A bad deploy is rolled back by
  clicking a previous successful deploy and choosing **Rollback to
  this deploy** - no rebuild needed, Render redeploys that exact image.
  Do this first if a deploy is actively broken; investigate after.
- **Vercel**: same idea under the project's Deployments tab - **Promote
  to Production** on any previous deployment switches production
  traffic to it immediately, independent of a rebuild.
- **Database migrations are forward-only** - `supabase/migrations/`
  has no down-migration convention (each file is a one-way `create`/
  `alter`). Rolling back application code (Render/Vercel) does **not**
  undo a migration that already ran. Practical implications:
  - Never run a new/unreviewed migration directly against production.
    Apply it to a staging Supabase project first (a second project on
    the free tier is enough), exercise the app against it, then
    `supabase db push` to production once confirmed.
  - Prefer additive, backward-compatible migrations (new nullable
    columns, new tables) over destructive ones (dropping/renaming a
    column a currently-deployed API version still reads) so that an
    application-level rollback doesn't leave the old code talking to a
    schema it no longer understands.
  - If a bad migration must be undone, write and review a new,
    explicit reverse migration by hand (e.g. a `drop column`/`alter`
    file with the next timestamp) - there's no automated `db down`.

## Service health monitoring

- Both Render services already expose their configured health check
  path (`/api/health` for `njala-api`, `/health` for
  `njala-document-service` - see `render.yaml`). Render polls this on
  an interval and automatically restarts an instance that starts
  failing it, and blocks a new deploy from receiving traffic until its
  health check passes - no extra configuration needed for that baseline.
- `GET /api/health/ready` (api only) additionally confirms real
  database connectivity (queries `system_settings`), distinct from the
  plain liveness check - useful for diagnosing "the process is up but
  can't reach Supabase" separately from "the process itself is down."
  This is not Render's configured health check path (liveness is
  intentionally the simpler, faster check for that), but is worth
  polling from an external uptime monitor (see below) or hitting
  manually when triaging an incident.
- Nothing in this repository currently pages/alerts on a health check
  failure beyond Render's own auto-restart - for production use,
  point an external uptime monitor (e.g. Better Uptime, UptimeRobot,
  Checkly) at `/api/health`, `/api/health/ready`, and
  `/health` on a short interval (1-5 min) with real alerting, since
  Render restarting a crashed instance is not the same as anyone being
  told it happened.
- All three Dockerfiles (`apps/api`, `apps/document-service`,
  `apps/web`) also declare their own `HEALTHCHECK` instruction, so
  `docker ps`/`docker compose ps` reports container health directly
  for local/self-hosted runs, and `.github/workflows/ci.yml`'s
  `docker` job builds all three images on every push/PR - a broken
  `Dockerfile` (a bad `COPY` path, a dependency that only fails inside
  the container) fails CI instead of only surfacing at an actual
  Render/Vercel deploy.

## Environment variable reference

See `.env.example` at the repo root and the per-app `.env.example`
files (`apps/api/.env.example`, `apps/web/.env.example`,
`apps/document-service/.env.example`) for the full list with
descriptions. Never commit a real `.env` file - `.gitignore` already
excludes them.

**Never expose these outside their server-side owner**:
`SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS entirely - server-only, never
in a `VITE_`-prefixed variable or anywhere Vercel/the browser can see
it), `DOCUMENT_SERVICE_CALLBACK_SECRET` /
`DOCUMENT_SERVICE_SHARED_SECRET` (the same shared secret under each
service's own name - must match between the two Render services, never
sent to the frontend), any real database password (`SUPABASE_DB_URL`
carries one - treat it like the service-role key), and, if a
transactional email provider is ever wired up (see below), that
provider's API key.

Exactly which variable belongs on which platform, so nothing ends up
configured (or exposed) in the wrong place:

| Variable | Vercel (`apps/web`) | Render `njala-api` | Render `njala-document-service` | Supabase |
|---|---|---|---|---|
| `NODE_ENV` | - | ✅ *(`production`)* | - | - |
| `DOCUMENT_SERVICE_ENV` | - | - | ✅ *(`production`)* | - |
| `SUPABASE_URL` | - | ✅ | - | *(is the project)* |
| `VITE_SUPABASE_URL` | ✅ | - | - | - |
| `SUPABASE_ANON_KEY` | - | ✅ | - | *(Project Settings → API)* |
| `VITE_SUPABASE_ANON_KEY` | ✅ | - | - | - |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ never | ✅ | - | *(Project Settings → API)* |
| `SUPABASE_DB_URL` | ❌ never | optional (manual `psql` use only - the app itself never reads it) | - | *(Project Settings → Database)* |
| `SUPABASE_STORAGE_BUCKET` | - | ✅ | - | *(created by migration)* |
| `STUDENT_AUTH_IDENTIFIER_DOMAIN` | - | ✅ | - | - |
| `VITE_API_BASE_URL` | ✅ | - | - | - |
| `API_PUBLIC_URL` | - | ✅ | - | - |
| `WEB_APP_URL` | - | ✅ *(the Vercel URL)* | - | - |
| `CORS_ALLOWED_ORIGINS` | - | ✅ *(the Vercel URL)* | - | - |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | - | ✅ | - | - |
| `SIGNED_URL_EXPIRY_SECONDS` | - | ✅ | - | - |
| `LOG_LEVEL` | - | ✅ | - | - |
| `DOCUMENT_SERVICE_URL` | - | ✅ *(the doc-service's Render URL)* | - | - |
| `DOCUMENT_SERVICE_CALLBACK_SECRET` | ❌ never | ✅ | - | - |
| `NODE_API_CALLBACK_URL` | - | - | ✅ *(the API's Render URL + path)* | - |
| `DOCUMENT_SERVICE_SHARED_SECRET` | ❌ never | - | ✅ *(same value as `DOCUMENT_SERVICE_CALLBACK_SECRET` above)* | - |
| `TESSERACT_CMD` / `OCR_LANGUAGE` / `MAX_UPLOAD_MB` | - | - | ✅ | - |
| `VITE_APP_NAME` | ✅ | - | - | - |

Notes on reading the table: Supabase's own dashboard is where the
`SUPABASE_*` key values *come from* (Project Settings → API/Database),
not somewhere you paste them back into - it's listed as a column only
to show where each value originates. A ❌ marks a variable that must
**never** be set on that platform even though it might seem convenient
(most importantly: the service-role key and both shared-secret names
must never reach Vercel/the browser, since anything in a Vercel env var
prefixed `VITE_` is bundled into the public JS and anything not
`VITE_`-prefixed on Vercel is still visible to anyone with Vercel
project access - Vercel is not a private secret store for this app's
purposes, only `VITE_`-prefixed public config belongs there at all).

## CI/CD

`.github/workflows/ci.yml` runs on every push/PR to `main` (lint,
typecheck, unit tests, the RLS/RBAC suite, e2e, Python tests, and
production builds). It does not currently deploy anything - Render and
Vercel each have their own git-push-triggered deploy once connected to
this repository, which is the standard, simplest setup for both
platforms and doesn't need a custom GitHub Actions deploy step.
