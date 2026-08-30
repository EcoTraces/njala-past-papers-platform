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
