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
- RLS/RBAC verified against a real Postgres instance (18 scenarios,
  including direct storage.objects access, mass-assignment/
  self-escalation attempts, duplicate-content detection at the DB
  constraint level, and paper-version-history IDOR probes via a
  manually-supplied `paper_id`; see TESTING.md), not just written and
  hoped-for.

**Backend**
- Fastify API: student-ID + staff-email auth (including a real
  account-activation gate - self-registered students start `PENDING`
  and need a LIBRARY_STAFF/ADMIN to activate them, verified by a
  regression test), RBAC middleware, the
  full paper workflow (draft → submitted → review → approved →
  published → archived/rejected), question bank + verification,
  practice sessions with deterministic, server-only auto-marking
  (never trusts a score from the client) + manual marking for
  subjective questions (Loop 09 found and fixed three critical
  practice-integrity bugs here - see TASK.md) + real time-spent
  tracking across pause/resume/submit, role dashboards, admin
  user/role/academic-structure management, audit logging, rate
  limiting, OpenAPI docs.
- Python FastAPI document-processing service: PyMuPDF text extraction
  with an automatic Tesseract OCR fallback, async job handoff (a
  genuine `QUEUED`→`PROCESSING`→`COMPLETED`/`FAILED` lifecycle,
  extraction offloaded to a worker thread with a hard timeout so it
  can't block the service's own event loop), shared-secret-
  authenticated callback, and retry handling for recoverable failures
  (both a dispatch-time retry-with-backoff and an automatic re-queue of
  a bounded number of recoverable processing failures) - see "Findings
  from Loop 07" in TASK.md.
- Search/discovery: filter by course/course-code/faculty/department/
  programme/academic-year/semester/examination-type, full-text keyword
  search over title + OCR-extracted text, and a relevance-ranked sort
  (`search_examination_papers()`, a SECURITY INVOKER RPC - RLS still
  governs visibility) alongside recent/popular/title. Includes a real,
  measured RLS-policy performance fix found via a 50,000-row test - see
  "Findings from Loop 08" in TASK.md and DATABASE.md.
- Dashboards backed by real database data, not placeholder numbers:
  student (attempt count + true average score across every submitted
  attempt, department-scoped recommendations), lecturer (practice
  statistics across their own courses, draft/unverified-question
  pending actions), library (catalogue stats via exact-count queries),
  and admin (active users, total views/downloads, total practice
  attempts, recent system activity) - the last four backed by a new
  `admin_dashboard_stats()` SQL function since PostgREST's query
  builder can't express `SUM()`/role-filtered `COUNT()` aggregates any
  more than it could `ts_rank()` in Loop 08 - see "Findings from
  Loop 10" in TASK.md.

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
- No `paper_versions`/`paper_categories` UI. Versioning now has full
  API support (`GET`/`POST /api/papers/:id/versions`, Loop 06) - only
  the frontend screen for replacing a file is still missing.
  `paper_categories` has neither API nor UI yet.
- The browse/search page (Loop 08) has course/examination-type/
  academic-year/semester filters and a working relevance sort - the
  API also supports faculty/department/programme filters, but the UI
  doesn't expose them yet (course is what students actually search by
  in practice, so it was prioritized).
- The `(select ...)`-wrapped-function RLS performance pattern (Loop 08,
  see DATABASE.md) is applied only to `examination_papers`'s SELECT
  policies, where a realistic-volume test measured the regression it
  fixes. The same pattern is very likely worth applying schema-wide
  (and to that table's own INSERT/UPDATE/DELETE policies), but wasn't
  done speculatively without a matching measurement justifying each
  change - a good candidate for the security-hardening pass.
- Analytics is limited to what `/api/analytics` and the dashboards
  expose (most-viewed/downloaded papers, basic counts, real total/
  30-day upload counts via an exact-count query as of Loop 10). A
  dedicated `/app/analytics` page now renders this as real Recharts bar
  charts (code-split so the dependency doesn't bloat the main bundle) -
  still no exportable reports or time-series trends.
- No dedicated "Help"/support ticketing beyond the static Help/Contact
  pages.
- Content moderation / duplicate-record management beyond the
  checksum-based unique-index duplicate prevention is not built as a
  distinct workflow.

**Testing depth**
- No e2e coverage for flows that require a real account (login,
  upload, practice, review) - would need a seeded Supabase test
  project wired into CI.
- No load/performance testing.
- No automatic recovery for a failed *callback* specifically (the
  Python service finishes processing successfully, but the POST back
  to Node fails) - only the job-dispatch and processing-failure retry
  paths are covered (Loop 07); this one still needs a manual reprocess.
  A real message queue would close this gap for free.

## Suggested next steps, in priority order

1. Stand up a real Supabase project, run the migrations, create the
   first SUPER_ADMIN (docs/deployment/bootstrap-admin.md), deploy
   api/document-service to Render and web to Vercel, and smoke-test
   every role's core flow against the live stack.
2. Wire a real transactional email provider for password resets and
   notification-worthy events.
3. Add a Supabase test project to CI and extend the Playwright suite to
   cover authenticated flows end-to-end.
4. Build the `paper_versions` replace-file UI (API is ready) and the
   `paper_categories` tagging feature (API and UI both still missing).
5. Add exportable reports/time-series trends to the analytics page.
