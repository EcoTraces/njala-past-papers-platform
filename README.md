# Njala Past Papers & Exam Practice Platform

A secure, searchable platform for university examination past papers and
exam practice, built first for Njala University, Sierra Leone, with an
architecture designed to extend to other institutions without a rewrite.

Students authenticate with their **Student ID**, search a verified
catalogue of past examination papers, view/download them, and practice
with auto-marked questions. Lecturers upload papers and author questions
for their own courses. Library staff run the verification workflow.
Administrators manage users, roles, academic structure, and system
settings. Every privileged action is authorized independently at three
layers - the frontend route guard, the API's RBAC middleware, and
Postgres Row Level Security - so a request that bypasses the UI still
gets a correct 401/403, not a data leak.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React + TypeScript + Vite, Tailwind CSS, React Router, TanStack Query, React Hook Form + Zod, Radix UI |
| API | Node.js + TypeScript, Fastify, Zod, OpenAPI/Swagger |
| Document processing | Python 3.12 + FastAPI, PyMuPDF, Tesseract OCR |
| Database & auth | Supabase (PostgreSQL, Row Level Security, Auth, Storage) |
| Deployment | Vercel (web), Render (api + document-service), Supabase (managed Postgres/Storage) |
| CI | GitHub Actions - lint, typecheck, unit tests, a real Postgres-backed RLS/RBAC suite, e2e |

## Monorepo layout

```
apps/
  web/               React/Vite frontend
  api/                Fastify REST API
  document-service/  FastAPI OCR/text-extraction service
packages/
  shared/             Shared TypeScript types + Zod validation (used by web and api)
supabase/
  migrations/         SQL schema, RLS policies, triggers (numbered, applied in order)
  seed/               Development seed data
  tests/              RLS/RBAC assertions run against a real Postgres instance
scripts/              db-test-setup.sh / db-test-assertions.sh (see TESTING.md)
docs/                 Architecture, API, security, deployment, database notes
.github/workflows/    CI
```

## Getting started (local development)

Prerequisites: Node.js 20+, Python 3.12+, a Supabase project (or the
[Supabase CLI](https://supabase.com/docs/guides/cli) for a local stack),
Tesseract OCR installed locally if you want to run the document service
without Docker.

```bash
# 1. Install Node dependencies (npm workspaces: shared, api, web)
npm install

# 2. Configure environment variables
cp .env.example apps/api/.env        # fill in Supabase URL/keys
cp apps/web/.env.example apps/web/.env
cp apps/document-service/.env.example apps/document-service/.env

# 3. Apply the database schema to your Supabase project
#    (Supabase CLI: supabase link, then supabase db push - see DEPLOYMENT.md)

# 4. Run everything
npm run build:shared
npm run dev:api      # http://localhost:4000  (Swagger UI at /api/docs)
npm run dev:web      # http://localhost:5173

# document-service (separate terminal, Python)
cd apps/document-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload
```

Or run the whole stack in containers: `docker compose up --build` (see
`docker-compose.yml`; still requires a Supabase project to point at).

## Documentation

- [PRD.md](./PRD.md) - product requirements and scope
- [ARCHITECTURE.md](./ARCHITECTURE.md) - system design, request flow, auth model
- [DATABASE.md](./DATABASE.md) - schema, RLS policy design, ERD notes
- [API.md](./API.md) - REST API reference (also live at `/api/docs`)
- [SECURITY.md](./SECURITY.md) - authn/authz model, threat model, hardening notes
- [DEPLOYMENT.md](./docs/deployment/README.md) - Vercel/Render/Supabase deployment
- [TESTING.md](./TESTING.md) - how to run every test suite, including the RLS/RBAC harness
- [CONTRIBUTING.md](./CONTRIBUTING.md) - development workflow
- [CODING_RULES.md](./CODING_RULES.md) - engineering conventions enforced in this repo
- [ROADMAP.md](./ROADMAP.md) - what's implemented vs. planned
- [CHANGELOG.md](./CHANGELOG.md)

## Status

This is a real, working full-stack implementation of the platform's core
architecture and primary user flows (auth, RBAC, paper workflow, search,
practice mode with deterministic auto-marking, dashboards, admin, OCR
pipeline) - see [ROADMAP.md](./ROADMAP.md) for exactly what is built
versus what remains for a full production rollout (notification/email
delivery integration, richer analytics, additional automated coverage,
a live Supabase/Render/Vercel deployment).
