# Task Tracker — Njala Past Papers & Exam Practice Platform

Living checklist produced by a full repository audit (source files read
directly, not inferred). Every `[COMPLETE]` item below has a
corresponding automated test or a manual run recorded in this session's
history (see TESTING.md); nothing here is marked complete on the basis
of "the code looks right."

Legend: `[COMPLETE]` `[PARTIAL]` `[MISSING]` `[BROKEN]` `[SECURITY ISSUE]`

## Audit findings fixed in this pass (Loop 01)

These were found by reading the actual source, not assumed from prior
summaries, and are now fixed and verified (typecheck/lint/test/build
all pass — see "Verification" at the bottom):

1. **`[SECURITY ISSUE]` → fixed: "account activation" was not actually
   wired up.** `profiles.status` supports `PENDING`, and
   `authenticate()` middleware already rejected `PENDING` accounts on
   every API call — but `signupStudent()` set new accounts to `ACTIVE`
   immediately, so the activation gate was unreachable dead code and
   self-registration had no verification step at all (anyone could
   claim any unclaimed Student ID string and get a fully active
   account). Fixed: signup now creates `PENDING` accounts;
   `loginStudent()` explicitly rejects `PENDING` with a clear message
   (previously it let a `PENDING` account "log in" and only failed on
   the *next* API call); the frontend now branches on the returned
   profile status (`/account-pending` instead of `/app`) and
   `ProtectedRoute` redirects any non-`ACTIVE` user there as a second
   layer; `AdminUsers.tsx` now shows a correct "Activate" action (was
   mislabeled "Reactivate" for a never-yet-active account) and a status
   badge. Regression-tested in `apps/api/src/services/auth.service.test.ts`.
2. **`[technical debt]` → fixed: test files leaked into every
   production build output.** All three Node `tsconfig.json`s used a
   bare `"include": ["src"]`, so `npm run build` compiled `*.test.ts`
   alongside real source into `dist/` (confirmed by inspecting
   `apps/api/dist` and `packages/shared/dist` after a clean build).
   Fixed with a `tsconfig.build.json` (extends the base config, excludes
   `**/*.test.ts`) in `apps/api` and `packages/shared`, wired into each
   package's `build` script; `typecheck` still uses the full config so
   type errors in test files are still caught (this is exactly how the
   fix below was caught in the first place).
3. **`[duplicate implementation]` → fixed:** `apps/web/src/pages/public/Login.tsx`
   declared its own `studentSchema`/`staffSchema`, duplicating (and
   subtly diverging from - no Student ID format/normalization) the
   `studentLoginSchema`/`staffLoginSchema` already in `packages/shared`.
   Now imports the shared ones, so frontend validation can never drift
   from what the API actually accepts.
4. **`[dead scaffold]` → removed:** an empty `tests/{unit,integration,rls,e2e}`
   directory tree at the repo root, left over from initial scaffolding
   and never used (real tests live under each app's `src/`,
   `apps/web/e2e/`, and `supabase/tests/`). Never tracked by git (empty
   dirs aren't), so no commit needed for the removal itself.

## Findings from Loop 03 (auth/RBAC hardening via direct API attack tests)

Writing `app.rbac.test.ts` - the first thing in this project's history
to actually call `buildApp()` and send it real HTTP requests via
`app.inject()`, rather than unit-testing middleware functions against
hand-built fake `request` objects - immediately surfaced two real bugs
that no prior test (50 passing unit tests at the time) had caught:

1. **`[BROKEN]` → fixed: the app could not start at all.**
   `@fastify/helmet@12.0.1` (which `npm install` resolved for the
   `^12.0.1` range in `package.json`) requires Fastify 5.x; this
   project runs Fastify 4.29.1. Registering it threw
   `FastifyError: fastify-plugin: @fastify/helmet - expected '5.x'
   fastify version, '4.29.1' is installed` on every single boot. Fixed
   by pinning to `^11.1.1` (the last Fastify-4-compatible major; every
   other `@fastify/*` plugin in this project is already on a
   Fastify-4-compatible version). This would have failed in `npm run
   dev`, in the Docker container, and in every CI job that runs the
   API - it simply hadn't been exercised yet.
2. **`[SECURITY ISSUE]`/`[BROKEN]` → fixed: the centralized error
   handler silently turned legitimate 4xx responses from Fastify/its
   plugins into masked 500s.** `app.ts`'s `setErrorHandler` only
   special-cased `AppError` instances and Zod validation errors;
   anything else - including `@fastify/rate-limit`'s own `429` error -
   fell through to a generic `reply.status(500)`. Concretely: the new
   stricter rate limit on `/api/auth/login` (see below) was
   *correctly* tripping (confirmed via `x-ratelimit-remaining`
   headers), but the client received `500 Internal Server Error`
   instead of `429 Too Many Requests` - indistinguishable from a real
   server bug, and not retriable the way a well-behaved client would
   handle a real `429`. Fixed: the handler now passes through any
   error whose `statusCode` is in the `4xx` range with its real status
   and message (a `5xx` from an unrecognized source still gets the
   generic masked message, since a `5xx` might be leaking internal
   state a `4xx` wouldn't). Caught and verified by
   `auth.rate-limit.test.ts`, which drives a route past its limit and
   asserts the real `429` comes through.
3. **`[MISSING]` → added: a stricter, dedicated rate limit on the
   auth-brute-force-sensitive endpoints** (`/api/auth/login`,
   `/staff-login`: 10/min; `/signup`, `/password-reset/request`:
   5/min), layered under the existing API-wide limit, per-route via
   `@fastify/rate-limit`'s `config.rateLimit` option.
4. **`[MISSING]` → added: 15 HTTP-level RBAC integration tests**
   (`app.rbac.test.ts`) covering every scenario named in the brief:
   student → admin endpoint, student → another user's data, lecturer →
   unauthorized course modification (create *and* update), library
   staff → admin-only settings and admin-only account provisioning,
   role escalation via `POST /admin/staff` and via
   `POST/DELETE /admin/users/:id/roles` (manipulated request
   parameters - `role: 'SUPER_ADMIN'` in the body), a request with no
   token, and a forged/unrecognized token. Also asserts the inverse: a
   genuine SUPER_ADMIN passes the exact check a plain ADMIN was
   rejected by, proving the check is role-specific rather than an
   accidental blanket lockout.

## Findings from Loop 04 (Node API audit)

Re-verified every claim in the Backend table below against the actual
source rather than trusting the earlier audit:

- **No orphan/fake route modules.** `ls apps/api/src/routes/` lists 11
  files; `app.ts` imports and registers all 11, no more, no fewer.
  Every implemented API module really is wired into the running app.
- **Extended HTTP-level RBAC integration coverage to the paper
  workflow, question bank, and practice modules** - the core domain
  objects, and the ones with the most state-dependent authorization.
  New `papers.rbac.test.ts` (12 scenarios): student/lecturer blocked
  from approve/reject/archive/delete on a paper, student/lecturer
  blocked from verifying a question, student blocked from manually
  marking a practice answer, and unauthenticated requests to
  `POST /api/practice/sessions` and `GET /api/papers` both rejected
  (401) - this deployment requires a session even to browse, by
  design (see PRD.md).
- **Refactored the fake-Supabase test boundary into a shared helper**
  (`apps/api/src/test/fakeSupabase.ts`) instead of duplicating the same
  ~50-line mock a third time across `app.rbac.test.ts` and the new
  `papers.rbac.test.ts` - the exact kind of duplication CODING_RULES.md
  says not to leave in. Also added `src/test/**` to
  `tsconfig.build.json`'s exclude list so this new test-only helper
  doesn't end up in the production build output either.

## Findings from Loop 05 (frontend audit)

- **`[UI BUG]` → fixed: the public-page header overflowed horizontally
  on mobile.** A manual responsive audit - real Playwright screenshots
  at 375px/768px/1440px viewports, not just trusting the Tailwind
  classes - found that `Landing.tsx`'s header had zero responsive
  treatment: "About Help Contact Sign in Create student account" all
  sat in one flex row with `gap-4`, which at 375px forced the row (and
  therefore the whole page) wider than the viewport, wrapping the logo
  onto three lines and leaving a horizontal-scroll/empty-margin
  artifact on every page sharing that header (landing, about, help,
  contact all use it via `StaticPage`/`Landing`). Fixed: the secondary
  links (About/Help/Contact) are hidden below `sm:`, and the primary
  CTA switches to a shorter "Sign up" label. Verified by a before/after
  screenshot comparison and a new regression test,
  `e2e/responsive-layout.spec.ts`, which asserts
  `document.documentElement.scrollWidth <= window.innerWidth` at both
  a mobile and a desktop viewport.
- **`[MISSING]` → added: the Analytics page.** `GET /api/analytics`
  has existed since the initial build, but nothing in the frontend
  ever called it - `recharts` was an unused dependency. Added
  `/app/analytics` (ADMIN/SUPER_ADMIN/LIBRARY_STAFF, matching the
  API's own permission) rendering real bar charts of the most-viewed
  and most-downloaded papers. Code-split via `React.lazy` +
  `Suspense`, since pulling in Recharts had pushed the main JS bundle
  from ~630KB to over 1MB - it's now split into its own ~375KB chunk
  loaded only when a privileged user actually visits the page.
- **No placeholder buttons or fake functionality found.** Grepped for
  "Coming soon", "not yet implemented", disabled-with-no-explanation
  buttons, and TODO markers across `apps/web/src` - none.
- Deliberately **not** manually re-verified: the authenticated app
  shell (student/lecturer/library/admin dashboards and every page
  behind `ProtectedRoute`) at mobile/tablet viewports, since that needs
  a live Supabase project to sign in against, which this environment
  doesn't have. The app shell's own mobile nav (a hamburger-collapsed
  drawer, distinct from and already more careful than the public
  header that had the bug above) wasn't touched in this pass.

## Findings from Loop 06 (past-paper lifecycle: versioning, validation, real-file/IDOR testing)

- **`[MISSING]` → implemented: paper versioning.** `paper_versions` and
  its RLS policies (`paper_versions_select`/`paper_versions_insert`)
  existed since the initial schema build but had zero API surface -
  nothing ever wrote to the table. Added `GET /api/papers/:id/versions`
  (superseded-file history, RLS-scoped visibility) and
  `POST /api/papers/:id/versions` (multipart replace: validates the new
  file, rejects an identical-content re-upload, updates
  `examination_papers` to the new file *before* archiving the old one
  into `paper_versions` - deliberately ordered so a rejected update
  never leaves a stale history row behind for a replacement that didn't
  actually happen - re-queues OCR, records an audit event). Orphaned
  storage objects are cleaned up on any failure path via the
  previously-dead-code `deletePaperFile`.
- **`[BUG]` → fixed: the original upload handler's own comment was
  aspirational, not real.** It claimed to "roll back the orphaned file
  if the metadata row failed" but never actually called
  `deletePaperFile` - a failed insert (most commonly the
  `uidx_papers_dedupe` unique-constraint hit) left the file sitting in
  Storage forever with nothing pointing at it, and surfaced to the
  caller as a masked generic `500` rather than a `409`. Fixed: real
  cleanup + a `23505` → `ConflictError` (409, clear message) mapping,
  applied to both the original upload path and the new version-replace
  path.
- **`[BUG]` → fixed: an RLS-rejected version replace fell through to a
  masked `500` instead of `403`.** `POST /:id/versions` is gated to
  LECTURER/LIBRARY_STAFF/ADMIN/SUPER_ADMIN at the route level, but
  authorization for *this specific paper* is RLS's job
  (`papers_update_own_draft` / `papers_update_staff`) - e.g. a lecturer
  who can see a course's papers via `papers_select_course_lecturer` but
  didn't upload a given one. A 0-row RLS-rejected UPDATE surfaces from
  Supabase as a `PGRST116` Postgrest error with no numeric
  `statusCode`, which the central error handler was falling through to
  a generic masked `500` for - found by tracing exactly this path while
  writing the adversarial IDOR tests below, before it ever hit a real
  request. Fixed to match the established pattern already used in
  `transitionPaperStatus`: a non-unique-violation update failure is now
  a proper `ForbiddenError` (403).
- **`[MISSING]` → added: filename-extension validation as a third,
  independent check.** `validatePaperUpload` previously checked only
  the declared MIME type and the file's magic bytes; a filename never
  factored in at all. Added `ALLOWED_PAPER_EXTENSIONS` (`packages/shared`)
  and a case-insensitive suffix check, so `paper.pdf.exe` (disguised
  double extension) or `paper.docx` (wrong extension, even with a
  correct MIME type and valid PDF bytes) are both rejected. All three
  checks are independent - a file can fail any one of them regardless
  of what the other two say.
- **Tested the entire workflow against real files, not synthesized
  buffers.** Generated genuine PDFs via PyMuPDF (the same library
  `apps/document-service` uses for real extraction) into
  `apps/api/test-fixtures/`, and added
  `storage.service.real-files.test.ts`: loads them from disk and drives
  them through the real `validatePaperUpload`, including a checksum
  computed by Node's `createHash('sha256')` cross-verified against the
  independent OS `sha256sum` tool for the exact same bytes. The
  `supabase/tests/rls_rbac_assertions.sql` duplicate-detection scenario
  (below) reuses that same real, independently-verified checksum rather
  than a synthetic value.
- **Explicit adversarial pass: unauthorized access via manually
  modified paper IDs and storage paths.** Extended
  `rls_rbac_assertions.sql` from 14 to 18 scenarios: (15) the
  `uidx_papers_dedupe` unique constraint actually blocks a
  duplicate-content insert for the same course/examination-type/
  academic-year, using the real fixture checksum from above; (16)
  `paper_versions` visibility mirrors the paper it belongs to - owner
  and staff can read it, a student manually supplying another user's
  `paper_id` sees zero rows; (17) `paper_versions` insert authority - an
  unrelated lecturer cannot insert a version row against a `paper_id`
  they neither own nor administer, even by directly setting
  `uploaded_by` to themselves; (18) a manually-guessed/known superseded
  version's exact `storage.objects` path is still invisible to a
  student, mirroring the existing published-vs-draft storage test but
  specifically for version history. Also added an HTTP-level RBAC test
  (`papers.rbac.test.ts`) proving a STUDENT is rejected at the
  preHandler role gate before ever reaching `POST /:id/versions`'s
  multipart parsing.
- **Not done this pass**: a true browser-driven, authenticated
  end-to-end upload flow (Playwright hitting a live API + Supabase
  Storage) - this environment has no live Supabase project to sign in
  against or store real objects in, same limitation noted in Loop 05.
  The "actual files" requirement is instead met at the layer that's
  actually reachable here: real PDF bytes driven through the real
  validation/checksum code, and a real Postgres instance for the
  RLS/constraint-level checks.

## Findings from Loop 07 (Python document-processing service: async pipeline, retries, real files)

- **`[BUG]` → fixed: `PROCESSING` was a dead enum value.** The
  `processing_job_status`/`ocr_status` enums have had `QUEUED`,
  `PROCESSING`, `COMPLETED`, `FAILED` since the original schema, but
  nothing ever set a job to `PROCESSING` - the Python service went
  straight from accepting a job to reporting `COMPLETED`/`FAILED`, so a
  paper mid-extraction looked identical (from the DB's point of view)
  to one still sitting untouched in the queue. Fixed: `apps/document-
  service`'s background task now sends a `PROCESSING` callback the
  instant it actually starts work, and `apps/api`'s callback handler
  writes `started_at` and flips both the job and the paper's
  `ocr_status` to it.
- **`[BUG]` → fixed: `extract_document` (PyMuPDF + Tesseract, both
  synchronous/CPU-bound) ran inline inside the async background task,
  blocking the Python service's own event loop for the full duration of
  every extraction/OCR run** - a second job, or even a health check,
  had to wait behind whatever the first one was doing. Fixed: it now
  runs via `asyncio.to_thread`, freeing the event loop, which also made
  a real timeout enforceable (see below) - a plain blocking call can't
  be cancelled by `asyncio.wait_for` on its own. Verified with a
  regression test that deterministically proves the loop stayed
  responsive during a blocking extraction, not just a timing-race
  assertion.
- **`[MISSING]` → implemented: retry handling for recoverable
  failures**, explicitly called for in this loop and previously absent
  entirely:
  - `apps/document-service` now classifies every failure as
    `recoverable` (couldn't download the file, timed out, an
    unexpected/unclassified error) or not (a corrupt/unreadable PDF, an
    oversized file - retrying the identical bytes changes nothing).
  - `apps/api`'s dispatch step (`POST /jobs` to the Python service)
    retries up to 3 times with backoff before giving up.
  - `apps/api`'s callback handler automatically re-queues and
    re-dispatches a `recoverable` `FAILED` report, up to
    `MAX_AUTO_REPROCESS_ATTEMPTS = 2` additional attempts (tracked in
    `document_processing_jobs.attempts`, a column that existed since
    the original schema but was never incremented by anything).
  - **`[BUG]` → fixed: a dispatch failure left the job silently stuck
    at `QUEUED` forever.** The original code was `fetch(...).catch(err
    => logger.error(...))` - fire-and-forget with no DB write on
    failure at all, so the job never reached `FAILED` and therefore
    never appeared on the library dashboard's "processing failures"
    list (which filters on `status = FAILED`). A paper could sit
    invisibly broken indefinitely. Fixed as part of the retry work
    above.
  - **`[MISSING]` → added: a manual retry action.** The library
    dashboard's "processing failures" list showed the error but had no
    remediation - literally a dead end for library staff. Added `POST
    /api/papers/:id/reprocess` (LIBRARY_STAFF/ADMIN) and wired a
    "Retry" button to it, plus surfaced the paper's actual title
    (previously a raw UUID) and retry count on that list.
- **`[BUG]` → fixed: one bad page could sink the whole OCR job.** A
  single page whose rendered image made Tesseract throw (a malformed
  embedded image, an OCR-engine crash) previously failed extraction for
  every other page in the document too. Now each page's OCR call is
  individually caught; a failing page contributes an empty string and
  every other page still completes normally.
- **`[MISSING]` → added: a hard processing timeout.** Nothing
  previously bounded how long extraction/OCR could run - a
  pathological PDF (huge page count, an image that pins Tesseract)
  could tie up a worker indefinitely. Added
  `processing_timeout_seconds` (120s default), enforced via
  `asyncio.wait_for` around the thread-offloaded extraction; a timeout
  is reported as a recoverable failure and auto-retried like any other.
- **Tested against real files, not synthesized buffers**: built
  genuinely scanned/image-only PDFs (PIL-rendered text burned into a
  raster image with no text layer at all, then embedded into a PDF
  page - not a text-based PDF that merely has few characters) to
  exercise the actual Tesseract OCR path end-to-end, including a
  multi-page document and a per-page-failure-resilience test. Also
  tested a genuinely corrupt PDF (valid `%PDF-` header, garbage body)
  and an oversized file, both asserted non-recoverable.
- **Node-side unit/integration tests added** (previously zero coverage
  for this module on the Node side): `documentProcessing.service.test.ts`
  exercises the real DB-write logic (not just permission checks)
  against a small in-memory fake of the two tables it touches, proving
  the dispatch-retry-then-give-up-cleanly behavior and the
  reprocess/auto-retry paths actually work; `internal.callback.test.ts`
  drives the real Fastify app end-to-end through `app.inject()` for
  the same scenarios at the HTTP layer, including the automatic-retry-
  then-eventually-permanent-FAILED sequence.
- **Not done this pass**: a real message queue (SQS/BullMQ/Cloud
  Tasks) - the hand-rolled retry logic above closes the two failure
  modes the brief calls out (dispatch failures, recoverable processing
  failures) but a failed *callback* itself (the Python service
  finished, but the POST back to Node failed) still has no automatic
  recovery path - see `docs/architecture/document-processing.md`'s
  failure-mode table for the honest accounting of what remains.

## Findings from Loop 08 (search and discovery: filters, relevance ranking, realistic-volume perf)

- **`[BUG]` → fixed: `courseCode` was accepted but silently ignored.**
  `paperSearchQuerySchema` declared it as a valid query parameter, but
  `GET /api/papers`'s handler never referenced it at all - a caller
  filtering by course code got the full unfiltered list back, no error,
  nothing. Fixed: resolves to a `course_id` via a case-insensitive
  `courses.code` lookup before filtering; a code that matches nothing
  now returns zero results (a sentinel value that can never equal a
  real uuid), not the unfiltered list.
- **`[BUG]` → fixed: `sort=relevance` was a selectable option that did
  nothing.** The `switch` statement handling `sort` had no `case
  'relevance'` - it fell through to the `default` (`recent`), so a
  keyword search never actually ranked by match quality, only by
  upload recency. Fixed: added `search_examination_papers()`, a
  SECURITY INVOKER Postgres function (`ts_rank` against
  `websearch_to_tsquery`, RLS-transparent since it isn't SECURITY
  DEFINER) - PostgREST's plain filter/order interface can't express a
  computed-rank ORDER BY, so this is the one search path that
  genuinely needs a real function; every other sort mode still uses
  the existing embedded-select query.
- **Real full-text search already worked structurally** (`search_vector`
  weights title over OCR-extracted text, maintained by a trigger that
  already fires on `extracted_text` updates - i.e. Loop 07's OCR
  pipeline landing a paper's text automatically makes it searchable) -
  confirmed, not re-implemented.
- **`[MAJOR PERFORMANCE BUG]` → found and fixed via a realistic-volume
  test.** Seeded 50,000 synthetic `examination_papers` rows and ran
  `EXPLAIN ANALYZE` on the actual search/browse queries as an
  authenticated STUDENT (not superuser - RLS matters for the plan). A
  keyword search took **~940ms via a full sequential scan**, never
  touching `idx_papers_search_vector` (the GIN index) - confirmed as
  superuser (RLS bypassed) the exact same query used the index and ran
  in ~7ms, isolating RLS as the cause. Root cause:
  `examination_papers` has four permissive SELECT policies, which
  Postgres combines with OR into one qual evaluated per candidate row;
  with `auth.uid()`/`auth_has_role()`/`auth_is_admin()` called
  unwrapped inside those policies, the combined qual was expensive and
  opaque enough that the planner never considered the GIN index worth
  using, for *any* role, not just the one whose policy branch contains
  the correlated `course_lecturers` subquery. Fixed by wrapping each
  call in `(select ...)` - Postgres/Supabase's own documented RLS
  performance pattern, which forces a once-evaluated InitPlan instead
  of a per-row function call. Measured result on the identical query:
  **~940ms → ~29-110ms** (8-30x, depending on path), with *zero*
  behavior change - all 30 `rls_rbac_assertions.sql` scenarios pass
  identically before and after. Scoped to `examination_papers`'s
  SELECT policies only (directly measured, directly in scope for
  search); the same pattern likely benefits other RLS-protected tables
  too, flagged in ROADMAP.md rather than applied speculatively
  everywhere without a matching measurement.
- **`[MISSING]` → added: indexes for the two unfiltered default
  browse sorts.** Neither `created_at` (the `recent` sort/default) nor
  `download_count` (`popular`) had a supporting index - an unfiltered
  site-wide browse forced a full-table sort. Added
  `idx_papers_created_at`/`idx_papers_download_count`; confirmed via
  `EXPLAIN` at 50k rows that both now resolve via a plain `Index Scan`
  in ~1ms instead of a sort over the whole table. Also added
  `idx_papers_programme` (a declared filter with no supporting index
  at all).
- **`[MISSING]` → added: a real filter UI.** `PapersBrowse.tsx`
  previously exposed only a keyword box and three sort buttons -
  faculty/department/programme/course/academic-year/semester/
  examination-type filtering, all supported by the API since the
  original build, had no way to be triggered from the actual page.
  Added course/examination-type/academic-year/semester dropdowns (data
  from the existing academic-structure endpoints), a "Best match"
  (relevance) sort chip that a keyword search now defaults to
  automatically (still overridable), a result count, and a "Clear
  filters" action. Faculty/department/programme filters are still
  missing from the UI (the API supports them) - noted in ROADMAP.md
  rather than added speculatively, since course is the filter students
  actually search by in practice and this pass was already substantial.
- **Verified: search cannot leak unpublished/unauthorized papers,
  including through the new RPC.** Two new `rls_rbac_assertions.sql`
  scenarios: a student explicitly requesting `p_status := 'DRAFT'`
  through `search_examination_papers()` still gets zero rows (RLS,
  not SECURITY DEFINER, governs the function regardless of what the
  caller asks for), while the paper's own uploader still sees it via
  the same call - proving the RPC doesn't accidentally widen access
  relative to the plain query path.

## Findings from Loop 09 (exam practice engine: authoritative scoring, session lifecycle)

- **`[CRITICAL BUG]` → fixed: a student could self-assign their own
  practice score.** `practice_answers_owner` (RLS, owner-scoped `for
  all`) has no column-level restriction, and the auto-marking trigger
  only fired on `INSERT/UPDATE OF selected_option_id, numerical_answer,
  answer_text`. A raw `UPDATE` touching only `marks_awarded`/
  `is_correct`/`marked_by` - the exact vector a real client hitting
  Supabase's PostgREST API directly (not through this repo's own Node
  route, which never does this) would use - never triggered grading at
  all, and the client's self-assigned value simply stuck. Reproduced
  with a real adversarial probe against Postgres before fixing: a
  student flipped their own wrong MC answer to `marks_awarded=10,
  is_correct=true` and it worked, pre-fix. Fixed by widening the
  trigger to also watch the grading columns and distinguish "a genuine
  staff manual mark" (submitted *content* unchanged, caller holds a
  marking role) from everything else (always recompute/reset) -
  deliberately not a bare role check, since a LECTURER/LIBRARY_STAFF
  account can also take practice sessions themselves; verified that
  case specifically doesn't regress.
- **`[CRITICAL BUG]` → fixed: a student could inflate their score by
  answering a question outside their session's snapshot.**
  `practice_answers_owner`'s `WITH CHECK` verified the *session*
  belonged to the caller but never verified the *question* was
  actually part of that session's `practice_session_questions`
  snapshot. A student could `INSERT` an answer for any verified
  question in the whole bank and have it counted -
  `practice_submit_session()`'s `obtained_marks` summed every
  `practice_answers` row for the session with no such scoping. In the
  reproduction (a 50-mark question injected into a 5-mark, 1-question
  session), this didn't just inflate the score quietly - it overflowed
  the `percentage` column outright on submit (`numeric field
  overflow`), a real crash, not just a wrong number. Fixed at both
  layers: RLS now refuses the `INSERT`, and `practice_submit_session()`
  additionally scopes its marks sum through `practice_session_questions`
  as defense in depth.
- **`[CRITICAL BUG]` → fixed: manual marking of subjective answers had
  never actually worked, since the original build.** Not something
  this loop's other two fixes introduced - reproduced identically
  against the schema exactly as it originally shipped, before touching
  anything. `practice_answers_mark_staff` grants `LECTURER`/
  `LIBRARY_STAFF`/`ADMIN` UPDATE authority on any row, but
  `practice_answers` had **no SELECT policy for staff at all**
  (`practice_answers_owner` is owner-scoped only) - and Postgres
  requires a row be visible under an applicable SELECT policy before an
  UPDATE/DELETE policy's own `USING` is even considered. Every staff
  UPDATE against another user's answer silently affected 0 rows; a
  plain `select * from practice_answers` as library staff returned
  nothing at all. `POST /api/practice/answers/:answerId/mark` (which
  uses the RLS-scoped client, not the service role) would have failed
  on every real call. Fixed with a genuine
  `practice_answers_select_staff` policy.
- **`[MISSING]` → implemented: `time_spent_seconds` actually gets
  computed.** The column has existed since the original schema and
  `apps/web`'s `PracticeResults.tsx` already fetched it into its type,
  but nothing ever wrote to it (stayed at its default `0` forever) and
  the frontend didn't even render it once fetched - "see time spent" is
  an explicit item in the brief. Implemented via two new RPCs
  (`practice_pause_session`/`practice_resume_session`) that accumulate
  the active segment's elapsed time on pause and reset the segment
  start on resume (so multiple pause/resume cycles sum correctly, not
  just the first segment or double-counted paused time);
  `practice_submit_session()` adds the final active segment before
  closing out. Wired the previously-dead pause route into the actual
  UI (`PracticeSession.tsx`'s new "Save & exit" button; a session
  reopened while `PAUSED` auto-resumes so the next segment starts
  cleanly) and rendered the total on `PracticeResults.tsx`.
- **Verified, not re-implemented**: full-text-search-independent
  session-lifecycle behaviors the brief calls out were already correct
  once actually tested against real Postgres - duplicate submission
  (`practice_submit_session` is idempotent, returns the identical
  result rather than erroring or re-scoring), unauthorized session
  access (RLS blocks it, already covered by the original suite's
  scenario 3), and browser-refresh/network-failure resilience (every
  answer is saved individually via `upsert` the instant it changes, not
  batched at submit - a refresh or dropped connection loses at most the
  one most-recent unsaved keystroke, not the whole session).
- All four bugs found by writing and running the actual attack/
  reproduction against a real Postgres instance first, then formalizing
  into `rls_rbac_assertions.sql` (14 → 25 scenarios) once confirmed -
  not discovered by reading the policy comments (which, for the
  mark-tampering case, explicitly asserted a guarantee - "so a student
  can never set their own marks_awarded/is_correct by hand" - the
  schema didn't actually enforce).

## Findings from Loop 10 (dashboards and analytics: real data, no placeholders)

- **`[MISSING]` → implemented: the admin dashboard never reported
  active users, total views, total downloads, or total practice
  attempts** - all four are explicitly called out in the brief, and the
  route only ever returned `totalUsers`/`totalPapers`/`totalCourses`/
  `pendingApprovals`. `SUM(view_count)`/`SUM(download_count)` across
  the whole catalogue and a `COUNT` of `SUBMITTED` practice sessions
  can't be expressed through PostgREST's plain filter/select interface
  any more than `ts_rank()` could in Loop 08 - fixed the same way, with
  a dedicated `admin_dashboard_stats()` SQL function
  (`20260101000019_admin_dashboard_stats.sql`, SECURITY INVOKER so RLS
  still governs what a non-admin caller could see if they somehow
  reached it - the route itself is ADMIN/SUPER_ADMIN-gated). `active_users`
  filters on `status = 'ACTIVE'`, not a bare `count(*)` over `profiles`
  - verified with a regression test (`rls_rbac_assertions.sql` scenario
  26) that inserting a `SUSPENDED` account does not move the number.
- **`[MISSING]` → implemented: the student dashboard had no
  performance/progress summary or recommendations**, both explicit
  brief items. `performance` is a genuine average over *all* the
  student's `SUBMITTED` sessions (not just the 5 shown in "recent
  attempts" - averaging only the recent slice would silently under- or
  over-represent a student with more than 5 attempts).
  `recommendations` is deliberately simple and honestly derived (recent
  published papers in the student's own department, excluding papers
  already bookmarked) rather than a fake/hardcoded list - returns `[]`
  when the student's `department_id` is null instead of guessing or
  erroring (regression-tested).
- **`[MISSING]` → implemented: the lecturer dashboard had no practice
  statistics or pending-actions summary.** `practiceStatistics` averages
  `SUBMITTED` sessions across the lecturer's own courses;
  `pendingActions` surfaces `unverifiedQuestions` and a new
  `draftPapers` count. A lecturer with zero assigned courses must not
  reach `practice_sessions` with an empty `.in()` filter (undefined
  behavior to rely on) - guarded with an explicit `courseIds.length > 0`
  check and regression-tested that `practice_sessions` is never queried
  in that case.
- **`[MISSING]` → implemented: the library dashboard had no catalogue
  statistics** (`totalPapers`/`totalPublished`/`totalCourses`, all via
  cheap `{ count: 'exact', head: true }` queries - no row data
  transferred).
- **`[BUG]` → fixed: `/api/analytics`'s upload count was the length of
  a capped 500-row fetch, not a real count.** Selected up to 500 full
  `created_at` values from `examination_papers` just to read
  `.length` off the array - wasteful (transfers real row data purely to
  discard it) and silently wrong once the catalogue exceeds 500 papers
  (further growth invisible, and the field was misleadingly labelled a
  "sample" in the UI to paper over it). Replaced with two genuine
  `{ count: 'exact', head: true }` queries - `totalUploads` (all-time)
  and `uploadsLast30Days` - which return an exact count without
  transferring any rows, so the numbers stay correct at any scale.
- All new/changed dashboard fields wired into their pages
  (`StudentDashboard.tsx`, `LecturerDashboard.tsx`,
  `LibraryDashboard.tsx`, `AdminDashboard.tsx`, `Analytics.tsx`) -
  nothing added to the API response was left unrendered.
- Role gating reviewed for every new field: `admin_dashboard_stats()`
  and `recentActivity` (an `audit_logs` join) are reachable only via
  `GET /api/admin/dashboard` (ADMIN/SUPER_ADMIN); student `performance`/
  `recommendations` only ever read the calling student's own rows
  (`eq('user_id', userId)`/session-derived); no new field exposes
  another user's private data.
- New regression coverage: `dashboard.routes.test.ts` (5 HTTP-level
  tests - the empty-course-list branch, a real averaged-score
  computation, the null-department recommendations branch, an
  `admin_dashboard_stats()` RPC error surfacing as a real 500 rather
  than defaulting stats to zero, and the analytics count-vs-sample
  fix) and `rls_rbac_assertions.sql` scenario 26 (`admin_dashboard_stats()`
  reflects real aggregate data and correctly excludes a `SUSPENDED`
  account from `active_users`).

## Project structure — `[COMPLETE]`

npm-workspaces monorepo (`packages/shared`, `apps/api`, `apps/web`) plus
a standalone `apps/document-service` (Python). Matches the brief's
requested layout. Verified: `npm install` + `npm run build` succeed
from a clean checkout.

## Frontend — `apps/web`

| Area | Status | Notes |
|---|---|---|
| Public pages (landing, login, signup, about, help, contact, 404, 403) | `[COMPLETE]` | |
| Account-pending page | `[COMPLETE]` | Added this pass |
| Student: dashboard/browse/search/detail/PDF preview/download/bookmark/practice/results/attempts/notifications/profile | `[COMPLETE]` | PDF preview is an iframe against a signed URL (native browser rendering), not a custom PDF.js canvas viewer - see ROADMAP.md. Browse/search gained real course/examination-type/academic-year/semester filters and a working relevance sort this pass (Loop 08) - previously only a keyword box and recent/popular/title sort buttons existed |
| Lecturer: dashboard/my papers/upload/question bank | `[COMPLETE]` | |
| Library: dashboard/review queue/upload | `[COMPLETE]` | |
| Admin: dashboard/users/academic structure/audit logs | `[COMPLETE]` | Admin dashboard now renders `activeUsers`/`totalViews`/`totalDownloads`/`totalPracticeAttempts`/`recentActivity` (Loop 10), not just the original four counters |
| Role-based route protection | `[COMPLETE]` | UX layer only, by design - see SECURITY.md |
| Loading/empty/error states | `[COMPLETE]` | `Spinner`/`PageSpinner`/`EmptyState` used consistently; every mutation surfaces `ApiError.message` |
| Responsive layout | `[COMPLETE]` | Manually verified with real screenshots at 375px/768px/1440px (see Loop 05) - found and fixed a real bug: the public-page header had no responsive treatment and overflowed horizontally on mobile |
| Charts (Recharts) | `[COMPLETE]` | New `/app/analytics` page (ADMIN/SUPER_ADMIN/LIBRARY_STAFF) renders real bar charts from `/api/analytics`'s most-viewed/most-downloaded paper data, code-split via `React.lazy` so the heavy Recharts dependency doesn't bloat the main bundle. Upload count now a real `totalUploads`/`uploadsLast30Days` pair from an exact-count query, not a capped-sample length (Loop 10) |
| Paper version replace-file UI | `[MISSING]` | API now supports it (`GET`/`POST /api/papers/:id/versions`, Loop 06) - no frontend screen yet |
| Paper category tagging UI | `[MISSING]` | `paper_categories`/`paper_category_links` tables exist, no UI |
| Bundle size | `[technical debt]` | Main chunk is ~630KB (Analytics/Recharts is now split out at ~375KB, loaded only when visited); the remaining main chunk still exceeds Vite's 500KB warning and would benefit from further route-splitting (e.g. the PDF viewer route, admin routes) |

## Backend — `apps/api`

| Area | Status | Notes |
|---|---|---|
| Auth (student ID + staff email, signup, login, logout, /me, password-reset request) | `[COMPLETE]` | Account activation now genuinely enforced (see above) |
| RBAC middleware (`requireRole`/`requirePermission`) | `[COMPLETE]` | Unit-tested; every route audited this pass has an explicit `preHandler` or plugin-scoped `addHook` - no unprotected mutation found |
| Academic structure CRUD (faculties/departments/programmes/courses/academic-years/semesters) | `[COMPLETE]` | |
| Paper workflow (upload/submit/review/approve/publish/reject/archive/delete/download/bookmark/version-replace) | `[COMPLETE]` | State machine enforced in code + RLS; unit-tested. Versioning added Loop 06: `GET`/`POST /:id/versions`, three-independent-check upload validation (MIME/extension/magic-bytes), orphaned-storage-object cleanup, duplicate-content 409s |
| Question bank (create/read/update/verify/delete) | `[COMPLETE]` | Answer/`is_correct` stripped for non-staff at the route layer (defense in depth on top of RLS) |
| Practice (sessions/answers/pause/resume/submit/manual marking) | `[COMPLETE]` | Deterministic, server-only auto-marking verified at the DB layer; Loop 09 found and fixed three real integrity bugs (score self-assignment, out-of-snapshot answers, manual marking never working) and implemented real `time_spent_seconds` tracking - see "Findings from Loop 09" |
| Dashboards (student/lecturer/library/admin) + analytics | `[COMPLETE]` | Loop 10 added real performance/recommendations (student), practice statistics/pending-actions (lecturer), catalogue stats (library), and active-users/views/downloads/practice-attempts/recent-activity (admin), backed by a new `admin_dashboard_stats()` RPC - see "Findings from Loop 10". Analytics is still basic (counts, top lists) - no time-series/export |
| Notifications (list/mark-read/mark-all-read) | `[COMPLETE]` | Creation is system-only (no client insert), by design |
| Admin (users/staff provisioning/status/roles/audit logs/system settings) | `[COMPLETE]` | |
| Internal processing callback | `[COMPLETE]` | Shared-secret guarded, not a Fastify-auth route by design. Handles `QUEUED`→`PROCESSING`→`COMPLETED`/`FAILED` (Loop 07); automatically re-queues a bounded number of recoverable failures |
| Paper search/discovery (`GET /api/papers`) | `[COMPLETE]` | Filter by course/course-code/faculty/department/programme/academic-year/semester/examination-type/status; keyword full-text search (title + OCR text); `sort=relevance`/`recent`/`popular`/`title`. Loop 08 fixed two real bugs (`courseCode` silently ignored; `relevance` sort did nothing) and a major RLS-vs-GIN-index performance issue found via a 50k-row realistic-volume test - see "Findings from Loop 08" |
| Document processing pipeline (`apps/document-service`) | `[COMPLETE]` | Async, non-blocking dispatch; genuine `PROCESSING` state; extraction offloaded to a worker thread with a hard timeout; per-page OCR resilience; recoverable-vs-not failure classification driving automatic retry; manual `POST /:id/reprocess` for staff. See "Findings from Loop 07" |
| OpenAPI/Swagger | `[COMPLETE]` | Served at `/api/docs`, generated from route schemas |
| Rate limiting | `[COMPLETE]` | Global limiter plus a stricter per-route budget on `/api/auth/login`\|`/staff-login` (10/min), `/signup` and `/password-reset/request` (5/min); verified with a test that actually exceeds the budget and asserts a real `429` |
| Structured logging, security headers, CORS allow-list | `[COMPLETE]` | |
| HTTP-level integration tests (hitting the real Fastify app, not just unit-testing middleware functions) | `[COMPLETE]` | `app.rbac.test.ts` boots the real app via `buildApp()` and hits it with `app.inject()`; this is what caught two real bugs (see below) that every prior unit test missed because nothing had ever actually constructed the app before |

## Database & Supabase — `supabase/`

| Area | Status | Notes |
|---|---|---|
| Schema (23 tables across 8 migrations) | `[COMPLETE]` | Verified applying cleanly to a real Postgres instance this session |
| RLS on every table | `[COMPLETE]` | Verified via `pg_policies`/`relrowsecurity` and the 15-scenario assertion suite |
| No overly-broad policies | `[COMPLETE]` | Audited every `for all`/`is not null`-only policy this pass - none grant unscoped write access; read-all policies are restricted to genuinely public reference data |
| Storage bucket + policy | `[COMPLETE]` | Private bucket, signed URLs, a defense-in-depth SELECT policy on `storage.objects` |
| Storage-level RLS *test* (as opposed to the bucket policy existing) | `[COMPLETE]` | Added this pass: direct `storage.objects` SELECT under a student role, plus proof that no role (including LIBRARY_STAFF) can write to it directly |
| Auto-marking trigger, `practice_submit_session` RPC | `[COMPLETE]` | Verified against a real Postgres instance with real inserts (not mocked). Loop 09: closed a self-scoring hole (trigger widened to also watch grading columns) and an out-of-snapshot-answer score-inflation hole (RLS + the RPC's marks sum both scoped to the session's real snapshot) |
| `practice_answers` staff visibility | `[COMPLETE]` | Loop 09: fixed a pre-existing bug (not this loop's other fixes - reproduced against the untouched schema) that made manual marking of subjective answers completely non-functional - no SELECT policy for staff existed at all |
| Practice time tracking (`time_spent_seconds`) | `[COMPLETE]` | Loop 09: implemented via `practice_pause_session`/`practice_resume_session` RPCs; previously declared in the schema and fetched by the frontend but never computed or displayed |
| Seed data | `[COMPLETE]` | Clearly dev/demo-only, never applied to production |
| Migrations run clean from empty DB | `[COMPLETE]` | `scripts/db-test-setup.sh`, re-verified this session |
| Privilege-escalation-specific RLS tests | `[COMPLETE]` | Student→ADMIN and ADMIN→SUPER_ADMIN self-grant both proven blocked (`42501`) |
| RLS policy performance | `[PARTIAL]` | `examination_papers`'s SELECT policies fixed this pass (Loop 08) after a real ~8-30x regression was found via a 50k-row `EXPLAIN ANALYZE`; the same `(select ...)`-wrapping pattern is very likely worth applying to the rest of the schema's RLS policies too, not yet done - see ROADMAP.md |
| Realistic-data-volume testing | `[COMPLETE]` | 50,000-row seed + `EXPLAIN ANALYZE` as an authenticated role (not superuser) for the default browse sorts and keyword search (Loop 08) - this is what surfaced the RLS/GIN-index issue above; not part of the automated CI suite (seeding 50k rows on every run would be wasteful), the script and results are recorded in "Findings from Loop 08" |

## Deployment & environment

| Area | Status | Notes |
|---|---|---|
| Dockerfiles (api/web/document-service) | `[COMPLETE]` | |
| docker-compose | `[COMPLETE]` | |
| CI (GitHub Actions: node/e2e/document-service/database jobs) | `[COMPLETE]` | |
| vercel.json / render.yaml | `[COMPLETE]` | |
| Live deployment to real Supabase/Render/Vercel | `[MISSING]` | Requires operator accounts/secrets this environment doesn't have - see docs/deployment/README.md |
| Environment variables | `[COMPLETE]` | Documented + Zod-validated (`apps/api/src/config/env.ts`); `.env.example` at root and per-app |

## Tests

| Suite | Status | Count |
|---|---|---|
| `packages/shared` unit | `[COMPLETE]` | 19 |
| `apps/api` unit + integration | `[COMPLETE]` | 94 (27 original + 2 activation-gate + 15 admin/academic RBAC HTTP-integration + 1 rate-limit + 12 paper/question/practice RBAC HTTP-integration + 6 extension-validation unit + 6 real-PDF-fixture integration (Loop 06) + 1 versioning-endpoint RBAC (Loop 06) + 8 document-processing service unit (Loop 07) + 7 internal-callback HTTP-integration (Loop 07) + 1 reprocess-endpoint RBAC (Loop 07) + 5 search-filter/relevance-sort HTTP-integration (Loop 08) + 3 practice-session RPC-wiring HTTP-integration (Loop 09)) |
| `apps/web` unit | `[PARTIAL]` | 2 - only `StatusBadge`; no coverage of hooks/pages yet |
| `apps/web` e2e (Playwright) | `[PARTIAL]` | 8, public-routes-only (incl. 2 responsive-layout regression tests added in Loop 05); no authenticated-flow e2e (needs a seeded Supabase test project) |
| `apps/document-service` (pytest) | `[COMPLETE]` | 16 (4 original + 6 real-scanned-PDF/OCR-resilience + 6 job-pipeline (PROCESSING callback, recoverable/non-recoverable classification, timeout, non-blocking-extraction) - all Loop 07) |
| DB RLS/RBAC (`supabase/tests/`) | `[COMPLETE]` | 25 scenarios (42 individual PASS assertions): the original 14 plus Loop 06's 4 (duplicate-detection, `paper_versions` authorization, guessed-storage-path) plus Loop 08's 2 (search-relevance-ranking-correctness, search-RPC-cannot-bypass-RLS) plus Loop 09's 5 (mark-tampering blocked, out-of-snapshot-answer blocked, staff manual marking actually works, time tracking accumulates, duplicate submission is a safe no-op) |

## Prioritized implementation checklist (highest priority first)

1. ~~Fix the account-activation gap (security-relevant, small, safe)~~ **done this pass**
2. ~~Fix build output hygiene (test files in dist)~~ **done this pass**
3. ~~Remove duplicate login validation schemas~~ **done this pass**
4. ~~Loop 02: add a direct `storage.objects` RLS test; add course-lecturer-ownership and manipulated-parameter scenarios to the assertion suite.~~ **done**
5. ~~Loop 03: add `app.inject()`-based HTTP integration tests proving the exact attack scenarios listed in the brief; add a stricter rate limit on `/api/auth/*`.~~ **done - also found and fixed two real bugs (app couldn't boot; 429s were masked as 500s) that only surfaced once something finally booted the real app**
6. ~~Loop 04: confirm every module is real; no orphan routes.~~ **done - confirmed, and extended RBAC HTTP-integration coverage to the paper/question/practice modules (12 more tests)**
7. ~~Loop 05: manual responsive check at 3 breakpoints; wire Recharts into the admin analytics view; code-split the resulting bundle.~~ **done - found and fixed a real mobile header overflow bug along the way**
8. ~~Loop 06: implement paper versioning, filename-extension validation, real-file testing, and an explicit paper-ID/storage-path IDOR adversarial pass.~~ **done - found and fixed two real bugs (a fake rollback comment with no actual rollback behind it; an RLS-rejected version replace masked as a 500 instead of 403) along the way**
9. ~~Loop 07: audit/harden the Python document-processing pipeline - genuine `PROCESSING` state, non-blocking extraction with a hard timeout, retry handling for recoverable failures, real-scanned-PDF OCR testing.~~ **done - found and fixed three real bugs (`PROCESSING` was a dead enum value; extraction blocked the Python service's own event loop; a dispatch failure left a job silently stuck at `QUEUED` forever with no way to notice or recover) along the way**
10. ~~Loop 08: search/discovery - real filters, working relevance ranking, realistic-volume performance testing.~~ **done - found and fixed two real bugs (`courseCode` silently ignored; `sort=relevance` did nothing) and a major RLS-vs-GIN-index performance regression (~940ms → ~29-110ms) that a realistic 50k-row test surfaced and a small-fixture test never could have**
11. ~~Loop 09: exam practice engine - authoritative server-side scoring, session lifecycle (pause/resume/submit/duplicate-submission), time tracking.~~ **done - found and fixed three critical, previously-undiscovered practice-integrity bugs (a student could self-assign their own score via a raw UPDATE; a student could inflate their score answering a question outside their session's snapshot, badly enough to overflow a column and crash submit; manual marking of subjective answers had never actually worked since the original build) and implemented real `time_spent_seconds` tracking that previously stayed at 0 forever**
12. Backlog (not this pass): paper-version replace-file UI, category tagging UI, real transactional email provider, authenticated e2e against a seeded test project, live deployment, a real message queue for document processing (a failed *callback* itself still has no automatic recovery - see docs/architecture/document-processing.md), the `(select ...)` RLS-performance pattern applied beyond `examination_papers`'s SELECT policies, faculty/department/programme filters in the browse UI.

## Verification (this pass)

```
npm run build            # shared → api → web, all clean, test files excluded from all three dist/ outputs
npm run typecheck        # shared, api, web - clean
npm run lint              # api, web - clean
npm run test               # shared 19, api 94, web 2 - all passing (115 total)
bash scripts/db-test-setup.sh && bash scripts/db-test-assertions.sh   # 25/25 RLS/RBAC scenarios passing, fresh DB
npx playwright test        # 8/8 e2e passing
cd apps/document-service && python -m pytest tests/ && ruff check .   # 16/16 tests passing, lint clean
```
