# Changelog

All notable changes to this project. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/).

## [0.1.0] - Unreleased

Initial build of the platform's core architecture and primary user
flows.

### Added

- Monorepo scaffold (npm workspaces: `packages/shared`, `apps/api`,
  `apps/web`; standalone `apps/document-service`).
- Full Supabase Postgres schema with RLS on every table, a private
  Storage bucket with signed URLs, and a deterministic auto-marking
  trigger for objective practice questions.
- Fastify REST API: student-ID/staff-email auth, RBAC middleware, the
  paper review workflow, question bank, practice sessions, role
  dashboards, admin user/academic-structure management, audit logging,
  OpenAPI docs.
- FastAPI document-processing service: PyMuPDF text extraction with a
  Tesseract OCR fallback, async job handoff with a shared-secret
  callback.
- React/Vite frontend covering every page category in the PRD, wired
  to the real API.
- Dockerfiles, docker-compose, GitHub Actions CI (Node, Python,
  database/RLS, e2e), vercel.json, render.yaml.
- Unit tests (shared/api/document-service), Playwright e2e (public
  routes + auth guard), and a real Postgres-backed RLS/RBAC assertion
  suite (11 scenarios).
- Full documentation set (this file plus README, PRD, ARCHITECTURE,
  DATABASE, API, SECURITY, DEPLOYMENT, TESTING, CONTRIBUTING,
  CODING_RULES, ROADMAP).

### Fixed

- A missing `VITE_SUPABASE_URL` crashed `@supabase/supabase-js` at
  client-construction time and blanked the entire frontend, including
  public pages that need no session. `apps/web/src/lib/env.ts` now
  falls back to a syntactically valid placeholder and logs a clear
  error instead of crashing the app (found and fixed while getting the
  Playwright suite green).

See ROADMAP.md for what is intentionally not yet built (live
deployment, real email delivery, broader analytics, etc).

## [Unreleased] - Full repository audit (Loop 01)

A full-repository audit (see TASK.md) reading every source file, not
prior summaries, found and fixed:

### Fixed

- **Account activation was not actually enforced.** Self-registered
  students were created `ACTIVE` immediately, even though the
  `authenticate()` middleware already had `PENDING`-account rejection
  logic in place - the activation gate was unreachable. Fixed:
  `signupStudent()` now creates `PENDING` accounts; `loginStudent()`
  explicitly rejects `PENDING` accounts with a clear message; the
  frontend routes a pending signup to a new `/account-pending` page
  instead of the app shell, and `ProtectedRoute` redirects any
  non-`ACTIVE` user there as well; the admin Users screen now shows a
  correct "Activate" action and a status badge. Covered by a new
  `apps/api/src/services/auth.service.test.ts`.
- **Test files were being compiled into every production build
  output** (`apps/api/dist`, `packages/shared/dist`). Added
  `tsconfig.build.json` (extends the base config, excludes
  `**/*.test.ts`) to both packages; `typecheck` still uses the full
  config, which is what caught a real type error in a new test file
  during this fix.
- `apps/web/src/pages/public/Login.tsx` no longer declares its own
  login-form validation schemas - it now reuses
  `studentLoginSchema`/`staffLoginSchema` from `packages/shared`,
  removing a divergent duplicate (the local copy skipped Student ID
  format validation/normalization).
- Removed an empty, unused `tests/` directory tree left over from
  initial scaffolding.
