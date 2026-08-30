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

## [Unreleased] - Database/RLS hardening (Loop 02)

### Added

- Expanded `supabase/tests/rls_rbac_assertions.sql` from 11 to 15
  scenarios: direct `storage.objects` access under different roles
  (mirrors `examination_papers` visibility; no role can write to it
  directly - uploads are service-role-only), a lecturer unable to
  self-assign `course_lecturers` ownership, and a lecturer unable to
  reassign a paper's `uploaded_by` via `UPDATE` (mass-assignment/
  IDOR-via-update).

### Fixed

- `scripts/db-test-setup.sh` never granted `anon`/`authenticated`
  table-level privileges on `storage.objects`/`storage.buckets` (only
  on `public`-schema tables), so the new storage test failed with
  `permission denied for table objects` until fixed - the stub now
  mirrors Supabase's real default grants on the `storage` schema too.

## [Unreleased] - Auth/RBAC hardening via direct API attack tests (Loop 03)

Added the first HTTP-level integration tests in this project's
history - `app.rbac.test.ts` calls `buildApp()` and drives it with real
`app.inject()` requests, rather than unit-testing middleware functions
against hand-built fake `request` objects. This immediately surfaced
two real bugs that 50 passing unit tests had never caught, because
nothing had ever actually constructed the app before.

### Fixed

- **The app could not start.** `@fastify/helmet@12.0.1` (resolved by
  `npm install` for the `^12.0.1` range) requires Fastify 5.x; this
  project runs Fastify 4.29.1, and every other `@fastify/*` plugin here
  is already Fastify-4-compatible. Pinned to `^11.1.1`.
- **The centralized error handler masked legitimate `4xx` errors from
  Fastify/its plugins as generic `500`s** - concretely, a client
  correctly hitting the new stricter auth rate limit (see below) got
  `500 Internal Server Error` instead of `429 Too Many Requests`,
  indistinguishable from a real server bug. Fixed to pass through any
  error already carrying a legitimate `4xx` status; unrecognized `5xx`
  errors still get the generic masked message.

### Added

- A stricter, dedicated rate limit on `/api/auth/login`/`staff-login`
  (10/minute) and `/signup`/`password-reset/request` (5/minute), on
  top of the existing API-wide limit.
- `app.rbac.test.ts` (15 scenarios) and `auth.rate-limit.test.ts` (1
  scenario, but the one that caught the error-handler bug above).
- `'silent'` added to the `LOG_LEVEL` enum, used to keep the real
  Fastify app's request logging out of test output.

See TASK.md ("Findings from Loop 03") for the full writeup.

## [Unreleased] - Node API audit (Loop 04)

### Added

- `papers.rbac.test.ts` (12 HTTP-level integration scenarios): extends
  the app.inject()-based RBAC coverage from Loop 03 to the paper
  workflow, question bank, and practice modules - a student/lecturer
  blocked from approve/reject/archive/delete on a paper, a
  student/lecturer blocked from verifying a question, a student
  blocked from manually marking a practice answer, and unauthenticated
  requests to start a practice session or browse papers both rejected.

### Changed

- Extracted the fake-Supabase test boundary shared by `app.rbac.test.ts`
  and the new `papers.rbac.test.ts` into `apps/api/src/test/fakeSupabase.ts`
  instead of duplicating the mock a third time. `tsconfig.build.json`
  now also excludes `src/test/**` so this test-only helper doesn't ship
  in the production build output.

### Verified

- Every route module under `apps/api/src/routes/` (11 files) is
  imported and registered in `app.ts` - no orphan/fake route files.
- 78 total unit/integration tests passing (19 shared + 57 api + 2
  web); full monorepo build/typecheck/lint clean.

## [Unreleased] - Frontend audit (Loop 05)

### Fixed

- **The public-page header overflowed horizontally on mobile.** A
  manual responsive audit using real Playwright screenshots at
  375px/768px/1440px (not just trusting the Tailwind classes) found
  `Landing.tsx`'s header had no responsive treatment: five nav items
  in one unbreaking flex row forced the row - and the whole page -
  wider than a 375px viewport, wrapping the logo onto three lines and
  leaving a horizontal-scroll artifact on every page sharing that
  header. Fixed: secondary links hidden below `sm:`, primary CTA
  shortened to "Sign up" on mobile. Regression-tested in
  `e2e/responsive-layout.spec.ts`.

### Added

- `/app/analytics` (ADMIN/SUPER_ADMIN/LIBRARY_STAFF): real Recharts
  bar charts of the most-viewed and most-downloaded papers from
  `GET /api/analytics`, which had existed since the initial build with
  nothing in the frontend ever calling it. Code-split via
  `React.lazy`/`Suspense` - Recharts had pushed the main JS bundle from
  ~630KB to over 1MB, so it's now its own ~375KB chunk loaded only when
  visited.
- `e2e/responsive-layout.spec.ts` (2 scenarios).

### Verified

- Grepped `apps/web/src` for placeholder/fake-functionality patterns
  ("Coming soon", TODO markers, disabled-with-no-explanation buttons) -
  none found.
- 8/8 e2e passing (up from 6); full monorepo build/typecheck/lint
  clean.

## [Unreleased] - Past-paper lifecycle: versioning, validation, real-file/IDOR testing (Loop 06)

### Added

- `GET`/`POST /api/papers/:id/versions`: full file-versioning support.
  `paper_versions` and its RLS policies existed since the initial
  schema but had no API surface until now. Replacing a file validates
  the new upload, rejects an identical-content re-upload, updates
  `examination_papers` to the new file, archives the superseded file
  into `paper_versions`, re-queues OCR, and records an audit event.
- Filename-extension validation (`ALLOWED_PAPER_EXTENSIONS`) as a
  third check in `validatePaperUpload`, independent of the existing
  declared-MIME-type and magic-byte checks - catches a disguised
  double extension (`paper.pdf.exe`) or a wrong extension even when
  the MIME type and file bytes both check out.
- `apps/api/test-fixtures/`: real PDFs generated via PyMuPDF (not
  hand-built buffers) plus a real non-PDF file with a `.pdf`
  extension, and `storage.service.real-files.test.ts` (6 tests)
  driving them through the real validation/checksum code - including a
  checksum cross-verified against the OS `sha256sum` tool.
- 4 new `supabase/tests/rls_rbac_assertions.sql` scenarios (14 → 18):
  duplicate-content detection at the DB constraint level using a real
  fixture checksum; `paper_versions` select/insert authorization
  (owner/staff only, a manually-supplied `paper_id` from an unrelated
  user is blocked); a manually-guessed superseded-version storage path
  is still invisible to a student.
- An HTTP-level RBAC test proving a STUDENT is rejected at the
  preHandler role gate before `POST /:id/versions` ever parses the
  multipart body.

### Fixed

- The original upload handler's "roll back the orphaned file" comment
  was aspirational - `deletePaperFile` was dead code, never called. A
  failed insert (most commonly a duplicate-checksum unique-constraint
  hit) left the file sitting in Storage with nothing pointing at it,
  and surfaced as a masked `500` instead of a clear `409`. Fixed in
  both the original upload path and the new version-replace path.
- An RLS-rejected version replace (role check passes, but the caller
  isn't authorized for *this* paper) fell through the central error
  handler to a masked `500` instead of a `403` - Postgrest's
  `PGRST116` (zero rows matched) carries no numeric `statusCode`.
  Fixed to match the existing `transitionPaperStatus` pattern: mapped
  to `ForbiddenError`.

### Verified

- `npm run build`/`typecheck`/`lint`/`test` all clean; 90 tests passing
  (up from 78: +6 extension-validation unit, +6 real-PDF-fixture
  integration, +1 versioning RBAC HTTP-integration).
- 18/18 RLS/RBAC scenarios passing against a freshly recreated
  Postgres instance.

## [Unreleased] - Python document-processing pipeline: async, retries, real files (Loop 07)

### Added

- A genuine `PROCESSING` state: `apps/document-service` now reports it
  the instant its background task actually starts work, distinct from
  `QUEUED` (set the moment the job row is created). Previously a
  dead enum value - jobs jumped straight from `QUEUED` to
  `COMPLETED`/`FAILED`.
- Retry handling for recoverable failures, end to end: `apps/document-
  service` classifies every failure as `recoverable` (couldn't
  download the file, timed out, an unexpected error) or not (a
  corrupt/oversized file); `apps/api`'s job-dispatch step retries up to
  3 times with backoff; its callback handler automatically re-queues a
  recoverable `FAILED` report up to `MAX_AUTO_REPROCESS_ATTEMPTS = 2`
  additional attempts before giving up.
- `POST /api/papers/:id/reprocess` (LIBRARY_STAFF/ADMIN): a manual
  retry action for a paper stuck in a failed processing state, wired to
  a new "Retry" button on the library dashboard's processing-failures
  list (which previously showed the error with no way to act on it,
  and a raw paper UUID instead of its title).
- A hard `processing_timeout_seconds` ceiling (120s default) around
  extraction/OCR, enforced via `asyncio.wait_for` now that extraction
  runs in a worker thread (`asyncio.to_thread`) rather than inline.
- Per-page OCR resilience: one page's Tesseract call crashing no longer
  fails the entire document's extraction.
- Real-file test coverage: genuinely scanned/image-only PDFs (PIL-
  rendered text with no text layer, not just a low-character-count
  text PDF) driven through the actual OCR path, a real corrupt PDF, an
  oversized file, and a job-pipeline integration suite
  (`test_job_pipeline.py`, 6 tests) covering the PROCESSING callback
  sequence, recoverable/non-recoverable classification, the timeout,
  and a deterministic (non-timing-race) proof that extraction doesn't
  block the service's event loop.
- Node-side test coverage that didn't exist before this loop:
  `documentProcessing.service.test.ts` (8 tests, against a small
  in-memory fake of the two tables it touches) and
  `internal.callback.test.ts` (7 tests, HTTP-level via `app.inject()`).

### Fixed

- `extract_document` (PyMuPDF + Tesseract, both synchronous/CPU-bound)
  ran inline inside the async background task, blocking
  `apps/document-service`'s own event loop for the full duration of
  every extraction - a second job or even a health check had to wait
  behind whatever the first one was doing. Now runs via
  `asyncio.to_thread`.
- A dispatch failure (Node couldn't reach the Python service) left the
  job silently stuck at `QUEUED` forever - the original code was
  fire-and-forget with no DB write on failure at all, so it never
  reached `FAILED` and never appeared on the library dashboard's
  "processing failures" list. Fixed as part of the retry work above.

### Verified

- `npm run build`/`typecheck`/`lint`/`test` all clean; 107 tests
  passing (up from 90: +16 document-service pytest, +8
  documentProcessing.service unit, +7 internal-callback
  HTTP-integration, +1 reprocess-endpoint RBAC).
- `apps/document-service`: 16/16 pytest passing, `ruff check` clean.
- 18/18 RLS/RBAC scenarios and 8/8 Playwright e2e still passing.

## [Unreleased] - Search and discovery: real filters, relevance ranking, realistic-volume perf (Loop 08)

### Added

- `search_examination_papers()`: a SECURITY INVOKER Postgres RPC for
  `sort=relevance` - `ts_rank` against `websearch_to_tsquery` isn't
  something PostgREST's plain filter/order interface can express.
  Every other sort mode still uses the existing embedded-select query.
  RLS still governs visibility (not SECURITY DEFINER) - verified with
  2 new `rls_rbac_assertions.sql` scenarios.
- `idx_papers_created_at`, `idx_papers_download_count`,
  `idx_papers_programme`: the default `recent`/`popular` browse sorts
  and the `programmeId` filter had no supporting index at all.
- Real filter UI on `PapersBrowse.tsx`: course/examination-type/
  academic-year/semester dropdowns, a "Best match" (relevance) sort
  chip a keyword search now defaults to automatically, a result count,
  and a "Clear filters" action - previously only a keyword box and
  three sort buttons existed, even though the API already supported
  every one of these filters.
- 5 new HTTP-integration tests for the search route's filter/sort
  wiring, and 2 new realistic-data-volume RLS/RBAC scenarios.

### Fixed

- `courseCode` was accepted by the search query schema but never
  actually applied as a filter - silently ignored, returning the full
  unfiltered list. Now resolves to a course id first (case-
  insensitive); an unmatched code returns zero results, not everything.
- `sort=relevance` was a selectable option that did nothing - the
  `switch` statement had no case for it, silently falling back to
  `recent`. Now genuinely ranks by match quality via the new RPC.
- **Major performance regression, found via a realistic-volume test**:
  seeded 50,000 synthetic papers and ran `EXPLAIN ANALYZE` as an
  authenticated STUDENT (not superuser). A keyword search took ~940ms
  via a full sequential scan, never touching the GIN index on
  `search_vector` - confirmed as superuser the identical query used
  the index and ran in ~7ms, isolating RLS as the cause. Root cause:
  `examination_papers`'s four permissive SELECT policies call
  `auth.uid()`/`auth_has_role()`/`auth_is_admin()` unwrapped, so
  Postgres re-evaluates them per row instead of once, making the
  combined OR'd qual too expensive/opaque for the planner to consider
  the GIN index worth using, for any role. Fixed by wrapping each call
  in `(select ...)` - Postgres/Supabase's own documented RLS
  performance pattern. Measured: ~940ms → ~29-110ms (8-30x), with
  *zero* authorization behavior change (all 30 RLS/RBAC assertions
  pass identically before and after).

### Verified

- `npm run build`/`typecheck`/`lint`/`test` all clean; 112 tests
  passing (up from 107: +5 search-filter/sort HTTP-integration).
- 20/20 RLS/RBAC scenarios (30 individual assertions) and 8/8
  Playwright e2e still passing.
- Realistic-volume performance test (50k rows, not part of the
  automated CI suite) recorded in TASK.md "Findings from Loop 08".
