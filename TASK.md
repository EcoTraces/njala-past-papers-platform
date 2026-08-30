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
| Student: dashboard/browse/search/detail/PDF preview/download/bookmark/practice/results/attempts/notifications/profile | `[COMPLETE]` | PDF preview is an iframe against a signed URL (native browser rendering), not a custom PDF.js canvas viewer - see ROADMAP.md |
| Lecturer: dashboard/my papers/upload/question bank | `[COMPLETE]` | |
| Library: dashboard/review queue/upload | `[COMPLETE]` | |
| Admin: dashboard/users/academic structure/audit logs | `[COMPLETE]` | |
| Role-based route protection | `[COMPLETE]` | UX layer only, by design - see SECURITY.md |
| Loading/empty/error states | `[COMPLETE]` | `Spinner`/`PageSpinner`/`EmptyState` used consistently; every mutation surfaces `ApiError.message` |
| Responsive layout | `[COMPLETE]` | Manually verified with real screenshots at 375px/768px/1440px (see Loop 05) - found and fixed a real bug: the public-page header had no responsive treatment and overflowed horizontally on mobile |
| Charts (Recharts) | `[COMPLETE]` | New `/app/analytics` page (ADMIN/SUPER_ADMIN/LIBRARY_STAFF) renders real bar charts from `/api/analytics`'s most-viewed/most-downloaded paper data, code-split via `React.lazy` so the heavy Recharts dependency doesn't bloat the main bundle |
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
| Practice (sessions/answers/submit/manual marking) | `[COMPLETE]` | Deterministic auto-marking verified at the DB layer |
| Dashboards (student/lecturer/library/admin) + analytics | `[COMPLETE]` | Analytics is basic (counts, top lists) - no time-series/export |
| Notifications (list/mark-read/mark-all-read) | `[COMPLETE]` | Creation is system-only (no client insert), by design |
| Admin (users/staff provisioning/status/roles/audit logs/system settings) | `[COMPLETE]` | |
| Internal processing callback | `[COMPLETE]` | Shared-secret guarded, not a Fastify-auth route by design |
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
| Auto-marking trigger, `practice_submit_session` RPC | `[COMPLETE]` | Verified against a real Postgres instance with real inserts (not mocked) |
| Seed data | `[COMPLETE]` | Clearly dev/demo-only, never applied to production |
| Migrations run clean from empty DB | `[COMPLETE]` | `scripts/db-test-setup.sh`, re-verified this session |
| Privilege-escalation-specific RLS tests | `[COMPLETE]` | Student→ADMIN and ADMIN→SUPER_ADMIN self-grant both proven blocked (`42501`) |

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
| `apps/api` unit + integration | `[COMPLETE]` | 69 (27 original + 2 activation-gate + 15 admin/academic RBAC HTTP-integration + 1 rate-limit + 12 paper/question/practice RBAC HTTP-integration + 6 extension-validation unit + 6 real-PDF-fixture integration (Loop 06) + 1 versioning-endpoint RBAC (Loop 06)) |
| `apps/web` unit | `[PARTIAL]` | 2 - only `StatusBadge`; no coverage of hooks/pages yet |
| `apps/web` e2e (Playwright) | `[PARTIAL]` | 8, public-routes-only (incl. 2 responsive-layout regression tests added in Loop 05); no authenticated-flow e2e (needs a seeded Supabase test project) |
| `apps/document-service` (pytest) | `[COMPLETE]` | 4 |
| DB RLS/RBAC (`supabase/tests/`) | `[COMPLETE]` | 18 scenarios: the original 14 plus duplicate-content-detection-at-the-DB-constraint-level (using a real fixture checksum), `paper_versions` select/insert authorization, and a manually-guessed superseded-version storage path (Loop 06) |

## Prioritized implementation checklist (highest priority first)

1. ~~Fix the account-activation gap (security-relevant, small, safe)~~ **done this pass**
2. ~~Fix build output hygiene (test files in dist)~~ **done this pass**
3. ~~Remove duplicate login validation schemas~~ **done this pass**
4. ~~Loop 02: add a direct `storage.objects` RLS test; add course-lecturer-ownership and manipulated-parameter scenarios to the assertion suite.~~ **done**
5. ~~Loop 03: add `app.inject()`-based HTTP integration tests proving the exact attack scenarios listed in the brief; add a stricter rate limit on `/api/auth/*`.~~ **done - also found and fixed two real bugs (app couldn't boot; 429s were masked as 500s) that only surfaced once something finally booted the real app**
6. ~~Loop 04: confirm every module is real; no orphan routes.~~ **done - confirmed, and extended RBAC HTTP-integration coverage to the paper/question/practice modules (12 more tests)**
7. ~~Loop 05: manual responsive check at 3 breakpoints; wire Recharts into the admin analytics view; code-split the resulting bundle.~~ **done - found and fixed a real mobile header overflow bug along the way**
8. ~~Loop 06: implement paper versioning, filename-extension validation, real-file testing, and an explicit paper-ID/storage-path IDOR adversarial pass.~~ **done - found and fixed two real bugs (a fake rollback comment with no actual rollback behind it; an RLS-rejected version replace masked as a 500 instead of 403) along the way**
9. Backlog (not this pass): paper-version replace-file UI, category tagging UI, real transactional email provider, authenticated e2e against a seeded test project, live deployment.

## Verification (this pass)

```
npm run build            # shared → api → web, all clean, test files excluded from all three dist/ outputs
npm run typecheck        # shared, api, web - clean
npm run lint              # api, web - clean
npm run test               # shared 19, api 69, web 2 - all passing (90 total)
bash scripts/db-test-setup.sh && bash scripts/db-test-assertions.sh   # 18/18 RLS/RBAC scenarios passing, fresh DB
npx playwright test        # 8/8 e2e passing
```
