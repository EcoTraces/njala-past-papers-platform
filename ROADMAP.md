# Roadmap

An honest accounting of what this build actually implements versus what
remains, so nobody mistakes this for further along than it is. "Done"
means: real code, exercised by an automated test or a manual run
recorded in this repository's commit history - not just written.

## Done

**Database & security**
- Full normalized Postgres schema (roles/permissions, academic
  structure, paper workflow, question bank, practice sessions,
  bookmarks, notifications, audit logs, processing jobs, system
  settings).
- RLS on every table, private Storage bucket with signed URLs,
  SECURITY DEFINER helpers, a deterministic auto-marking trigger.
- RLS/RBAC verified against a real Postgres instance (15 scenarios,
  including direct storage.objects access and mass-assignment/
  self-escalation attempts;
  see TESTING.md), not just written and hoped-for.

**Backend**
- Fastify API: student-ID + staff-email auth (including a real
  account-activation gate - self-registered students start `PENDING`
  and need a LIBRARY_STAFF/ADMIN to activate them, verified by a
  regression test), RBAC middleware, the
  full paper workflow (draft → submitted → review → approved →
  published → archived/rejected), question bank + verification,
  practice sessions with deterministic auto-marking + manual marking
  for subjective questions, role dashboards, admin user/role/academic-
  structure management, audit logging, rate limiting, OpenAPI docs.
- Python FastAPI document-processing service: PyMuPDF text extraction
  with an automatic Tesseract OCR fallback, async job handoff, shared-
  secret-authenticated callback.

**Frontend**
- All page categories from the brief exist and call the real API:
  public pages, student (dashboard, browse/search, paper detail + PDF
  preview + signed download + bookmarking, practice flow, attempts,
  bookmarks, notifications, profile), lecturer (my papers, upload,
  question bank), library (upload, review queue with workflow
  actions), admin (users, academic structure, audit logs).
- Role-based route protection, accessible form validation, loading/
  empty states throughout.

**Infra**
- Dockerfiles (api, web, document-service), docker-compose for local
  full-stack runs, GitHub Actions CI (lint/typecheck/unit tests/build
  for all three Node packages + Python + the RLS/RBAC suite + a
  Playwright job), vercel.json, render.yaml.

**Tests**
- Unit tests: `packages/shared` (validation + enum/permission
  consistency), `apps/api` (RBAC middleware, paper workflow state
  machine, upload validation incl. magic-byte sniffing and path-
  traversal resistance), `apps/document-service` (health, auth guard,
  PDF extraction).
- e2e (Playwright): public navigation, auth-guard redirects.
- Database: the RLS/RBAC suite described above.

## Not done / explicitly out of scope for this pass

**Deployment**
- Nothing has been deployed to a live Supabase project, Render, or
  Vercel - that requires an operator's real accounts and secrets,
  which this environment doesn't have. `docs/deployment/README.md`
  documents the exact steps; they haven't been executed against real
  infrastructure.
- `docs/deployment/bootstrap-admin.md` describes creating the very
  first SUPER_ADMIN by hand (deliberately - no code path auto-creates
  one); it hasn't been run against a live project either.

**Integrations**
- Transactional email is a documented pluggable interface
  (`EmailProvider`) defaulting to console logging. No real provider
  (Resend/SendGrid/Supabase SMTP) is wired up.
- No SMS/push notifications - `notifications` are in-app only.

**Breadth not built**
- No dedicated PDF.js canvas viewer with page thumbnails/in-document
  search - the current viewer uses the browser's native PDF rendering
  via an iframe pointed at a signed URL, which works but is simpler
  than a custom PDF.js integration.
- No `paper_versions`/`paper_categories` UI (the tables and API-level
  support exist; there's no frontend screen for replacing a file with
  a new version or managing category tags yet).
- Analytics is limited to what `/api/analytics` and the dashboards
  expose (most-viewed/downloaded papers, basic counts). A dedicated
  `/app/analytics` page now renders this as real Recharts bar charts
  (code-split so the dependency doesn't bloat the main bundle) - still
  no exportable reports or time-series trends.
- No dedicated "Help"/support ticketing beyond the static Help/Contact
  pages.
- Content moderation / duplicate-record management beyond the
  checksum-based unique-index duplicate prevention is not built as a
  distinct workflow.

**Testing depth**
- No e2e coverage for flows that require a real account (login,
  upload, practice, review) - would need a seeded Supabase test
  project wired into CI.
- No dedicated OCR-on-a-scanned-image test for the document service
  (the extraction test uses a text-based PDF).
- No load/performance testing.

## Suggested next steps, in priority order

1. Stand up a real Supabase project, run the migrations, create the
   first SUPER_ADMIN (docs/deployment/bootstrap-admin.md), deploy
   api/document-service to Render and web to Vercel, and smoke-test
   every role's core flow against the live stack.
2. Wire a real transactional email provider for password resets and
   notification-worthy events.
3. Add a Supabase test project to CI and extend the Playwright suite to
   cover authenticated flows end-to-end.
4. Build the `paper_versions` replace-file UI and `paper_categories`
   tagging UI.
5. Add exportable reports/time-series trends to the analytics page.
