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

## [Unreleased] - Exam practice engine: authoritative scoring, session lifecycle (Loop 09)

### Fixed

- **Critical**: a student could self-assign their own practice score.
  `practice_answers_owner` (RLS) had no column-level restriction, and
  the auto-marking trigger only watched
  `selected_option_id`/`numerical_answer`/`answer_text` - a raw
  `UPDATE` touching only `marks_awarded`/`is_correct`/`marked_by`
  bypassed grading entirely and the client's value stuck. Reproduced
  with a real adversarial probe before fixing. Fixed by widening the
  trigger to also watch the grading columns and distinguish a genuine
  staff manual mark (submitted content unchanged, caller holds a
  marking role) from everything else, which is always recomputed -
  deliberately not a bare role check, since a LECTURER/LIBRARY_STAFF
  account can also take practice sessions themselves.
- **Critical**: a student could inflate their score by answering a
  question outside their session's own snapshot -
  `practice_answers_owner`'s `WITH CHECK` never verified the question
  was actually part of `practice_session_questions`. In the
  reproduction (a 50-mark question injected into a 5-mark session) this
  overflowed the `percentage` column outright on submit, a real crash.
  Fixed at both the RLS layer (the `INSERT` is now refused) and in
  `practice_submit_session()` (marks sum scoped through the snapshot as
  defense in depth).
- **Critical**: manual marking of subjective (ESSAY/SHORT_ANSWER)
  practice answers had never actually worked, since the original
  build - not something this loop's other fixes introduced. Postgres
  requires SELECT-visibility before an UPDATE/DELETE policy is even
  considered, and `practice_answers` had no SELECT policy for staff at
  all. Every staff manual-mark call silently affected 0 rows. Fixed
  with a genuine `practice_answers_select_staff` policy.

### Added

- Real `time_spent_seconds` tracking: `practice_pause_session()`/
  `practice_resume_session()` RPCs accumulate the active segment's
  elapsed time on pause and reset the segment start on resume (correct
  across multiple pause/resume cycles); `practice_submit_session()`
  adds the final segment before closing out. Previously declared in the
  schema and fetched by the frontend but never computed by anything,
  and not rendered even once fetched. Wired the previously-dead pause
  route into the UI (`PracticeSession.tsx`'s new "Save & exit" button;
  a reopened `PAUSED` session auto-resumes) and rendered the total on
  `PracticeResults.tsx`.
- 5 new `rls_rbac_assertions.sql` scenarios covering all of the above
  plus duplicate-submission safety (resubmitting an already-`SUBMITTED`
  session is a no-op, not an error or a re-score), and
  `practice.session.test.ts` (3 tests) proving the Node routes call the
  real RPCs.

### Verified

- `npm run build`/`typecheck`/`lint`/`test` all clean; 115 tests
  passing (up from 112: +3 practice-session RPC-wiring
  HTTP-integration).
- 25/25 RLS/RBAC scenarios (42 individual assertions, up from 20/30)
  and 8/8 Playwright e2e still passing.
- Every fix verified against a real adversarial reproduction against
  Postgres before being formalized into the permanent suite, and
  confirmed not to regress the legitimate flows (a real staff manual
  mark; a LECTURER taking their own practice session still auto-grading
  normally).

## [Unreleased] - Dashboards and analytics: real data, no placeholders (Loop 10)

### Added

- `admin_dashboard_stats()` SQL function (SECURITY INVOKER) reporting
  `active_users` (excludes non-`ACTIVE` accounts), `total_views`,
  `total_downloads`, and `total_practice_attempts` - none of these
  existed before, despite being explicit brief items, because
  `SUM()`/`COUNT()` aggregates like these can't be expressed through
  PostgREST's plain query builder (same class of problem as Loop 08's
  `ts_rank()` ranking, same fix: a real Postgres function).
- Student dashboard: a genuine `performance` summary (average
  percentage across *all* `SUBMITTED` attempts, not just the 5 most
  recent) and `recommendations` (recent published papers in the
  student's own department, excluding already-bookmarked papers -
  returns `[]`, not an error, when the student has no department set).
- Lecturer dashboard: `practiceStatistics` (average score across
  `SUBMITTED` sessions in the lecturer's own courses) and
  `pendingActions` (`unverifiedQuestions`, new `draftPapers` count).
- Library dashboard: `catalogueStats` (`totalPapers`/`totalPublished`/
  `totalCourses`) via cheap exact-count queries.
- Admin dashboard: `activeUsers`/`totalViews`/`totalDownloads`/
  `totalPracticeAttempts` (from the new RPC) and `recentActivity` (last
  15 `audit_logs` entries with the actor's name).
- All new fields rendered on their respective dashboard pages and the
  `/app/analytics` page - nothing added to an API response was left
  unrendered.
- `dashboard.routes.test.ts` (5 new HTTP-level tests).
- `rls_rbac_assertions.sql` scenario 26: proves `admin_dashboard_stats()`
  reflects real aggregate data and specifically excludes a `SUSPENDED`
  account from `active_users`.

### Fixed

- `/api/analytics`'s upload count was the `.length` of up to 500 fetched
  `created_at` rows, not a real count - wasteful (transfers real row
  data just to discard it) and silently wrong once the catalogue passed
  500 papers, papered over in the UI by labelling it a "sample".
  Replaced with two exact-count, zero-row-transfer queries:
  `totalUploads` (all-time) and `uploadsLast30Days`.
- Lecturer dashboard: a lecturer with zero assigned courses previously
  risked an empty `.in('course_id', [])` filter (undefined/unreliable
  behavior to rely on) - now short-circuits to a zeroed
  `practiceStatistics` and never queries `practice_sessions` at all in
  that case (regression-tested).

### Verified

- `npm run build`/`typecheck`/`lint`/`test` all clean; 120 Node tests
  passing (up from 115: +5 dashboard-routes HTTP-integration).
- 26/26 RLS/RBAC scenarios, 8/8 Playwright e2e, and 16/16 Python tests
  (`ruff check` clean) all still passing.
- Role gating reviewed for every new field: `admin_dashboard_stats()`
  and `recentActivity` are reachable only via the ADMIN/SUPER_ADMIN
  admin-dashboard route; student `performance`/`recommendations` only
  ever read the calling student's own rows.

## [Unreleased] - Full security audit and hardening (Loop 11)

### Fixed

- **Critical**: `question_options.is_correct` (the MCQ/TRUE_FALSE
  answer key) was readable by ANY authenticated caller, including a
  plain STUDENT, for ANY verified question system-wide - RLS had a
  bare `verification_status = 'VERIFIED'` branch with no role/session
  check, and table-level GRANTs are wide open (RLS is the real
  boundary), so this was reachable via a raw PostgREST/supabase-js
  call using just the caller's own JWT, bypassing the Node API's
  JSON-level answer-stripping entirely. Scoped to staff/the question's
  author/its course's lecturer/a caller with a legitimate practice-
  session link to that exact question.
- **Critical**: `answer_keys` (the NUMERICAL-question answer key) was
  readable by ANY lecturer regardless of which course they teach - the
  "LECTURER → answer-key leakage" scenario named in this loop's brief.
  Two overlapping RLS policies both granted this (a `for all` policy's
  `USING` clause governs SELECT too), so both had to be scoped
  together. Scoped to staff/the question's author/its course's
  lecturer - this table has no legitimate SELECT path anywhere in the
  API at all, so no residual risk remains.
- Staff/admin accounts (LECTURER/LIBRARY_STAFF/ADMIN/SUPER_ADMIN) had
  no per-account brute-force lockout - only student accounts did.
  Extended the same `failed_login_attempts`/`locked_until` mechanism to
  `loginStaff()`.
- The internal document-processing callback's shared-secret check used
  a non-constant-time `!==` comparison. Replaced with a
  SHA-256-then-`timingSafeEqual` comparison.
- `trustProxy: true` trusted an unbounded number of proxy hops,
  letting a client-supplied `X-Forwarded-For` header spoof a fresh
  `request.ip` on every request and defeat every per-IP rate limit.
  Changed to `trustProxy: 1`, matching the single reverse-proxy hop
  this app is actually deployed behind (Render).

### Verified

- Reviewed and found already correct: CORS allowlist, CSP/security
  headers, password-reset user-enumeration resistance, cross-course
  question modification (RLS-blocked), unpublished-paper access via
  signed download URLs (RLS-scoped), LIBRARY_STAFF reaching admin-only
  routes (router-level role gate excludes it), self-role-escalation to
  ADMIN/SUPER_ADMIN.
- `rls_rbac_assertions.sql` scenario 27 (5 new assertions) and 2 new
  `auth.service.test.ts` tests for the staff lockout fix.
- 122 Node tests (up from 120), 27/27 RLS/RBAC scenarios (up from 26),
  8/8 Playwright e2e, 16/16 Python tests + `ruff check` clean.

## [Unreleased] - Complete QA and testing (Loop 12)

### Added

- `questions.routes.test.ts` (5 tests): `stripAnswers()` actually
  strips `question_options.is_correct` from both `GET /` and
  `GET /:id` for a STUDENT and leaves it intact for a LECTURER;
  `POST /:id/verify` sets `VERIFIED`/`verified_by` correctly and
  rejects a request missing the required boolean `approve` field with a
  real 4xx (leaving the row untouched) rather than silently doing
  nothing or a masked 500. Previously zero coverage on this route file,
  despite it carrying the app-layer half of the answer-key-leakage
  defense Loop 11 found real RLS-layer bugs in.
- `notifications.routes.test.ts` (4 tests): list/mark-read/mark-all-
  read, including an IDOR check that `PATCH /:id/read` on another
  user's notification id can never succeed and leaves their row
  untouched. Previously zero coverage on this route file.
- `login-validation.spec.ts` (3 Playwright tests): empty student/staff
  login submissions show a validation error and never navigate away
  from `/login`; a malformed staff email is rejected before any
  submission. Entirely client-side (`zodResolver` blocks the network
  call), so no backend is required - mirrors the existing signup-form
  validation test.

### Investigated

- Full authenticated role-journey e2e coverage (login→search→practice→
  submit→result and the equivalent for LECTURER/LIBRARY/ADMIN) remains
  out of reach in this environment: `loginStudent()`/`loginStaff()`
  call Supabase Auth's hosted GoTrue service over HTTPS, which the
  local Postgres-only test harness has no stand-in for, and the e2e
  `webServer` config only starts a static frontend build with no API
  process. Documented, not faked - see TASK.md/ROADMAP.md.

### Verified

- 131 Node tests (up from 122), 27/27 RLS/RBAC scenarios (unchanged),
  11/11 Playwright e2e (up from 8), 16/16 Python tests + `ruff check`
  clean, production build clean.
