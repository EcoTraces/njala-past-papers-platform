# Testing

Every suite described here was run in this repository's own history and
passed - see the commit messages for exact counts at the time they were
added. Run them yourself with the commands below.

## Quick start: everything at once

```bash
npm install
npm run build:shared
npm run test          # packages/shared, apps/api, apps/web (unit)
```

## packages/shared - unit tests (Vitest)

```bash
npm run test --workspace packages/shared
```

Covers: `studentIdSchema` normalization/rejection rules, `passwordSchema`
strength rules, `PAPER_STATUS_TRANSITIONS` internal consistency (every
status has an entry, only points at real statuses, `ARCHIVED` is
terminal, no `DRAFT → PUBLISHED` skip), and `ROLE_PERMISSIONS` (no role
below LIBRARY_STAFF/ADMIN ever gets a review/approve/user-management
permission).

## apps/api - unit tests (Vitest)

```bash
npm run test --workspace apps/api
```

Requires no live Supabase project - `apps/api/vitest.config.ts` injects
placeholder `SUPABASE_URL`/keys so the module graph loads; nothing in
these tests makes a network call. Covers:

- `middleware/authorize.test.ts` - `requireRole`/`requirePermission`
  reject unauthenticated/wrong-role requests and never trust anything
  but `request.user`; `isStaffRole`/`isAdminRole` role classification.
- `services/papers.service.test.ts` - every edge of the paper workflow
  state machine (`assertValidTransition`), including that `ARCHIVED` is
  a dead end and `DRAFT → PUBLISHED` is rejected.
- `services/storage.service.test.ts` - PDF magic-byte sniffing (a
  renamed non-PDF is rejected even when declared as `application/pdf`),
  size limits, empty files, checksum stability (same content → same
  hash) and uniqueness (different content → different hash, which the
  duplicate-detection unique index depends on), and storage-key
  sanitization against path traversal (`../../etc/passwd` as a "course
  code" cannot escape its directory).
- `services/auth.service.test.ts` - the account-activation state
  machine: `signupStudent()` always creates a `PENDING` profile (never
  `ACTIVE`), and `loginStudent()` rejects a `PENDING` account with a
  clear message before ever attempting a Supabase sign-in. Mocks the
  Supabase boundary (`../lib/supabase.js`) with a small fake query
  builder rather than hitting a real project.
- `app.rbac.test.ts` - **HTTP-level integration tests**, the only tests
  in this project that call `buildApp()` and drive it with real
  `app.inject()` requests instead of unit-testing a middleware function
  against a hand-built fake `request`. 15 scenarios matching the brief
  exactly: a student hitting an admin endpoint, a student modifying
  another user's status, a lecturer creating/modifying a course they
  have no authority over, library staff hitting admin-only settings and
  admin-only staff provisioning, role escalation via `POST
  /admin/staff` and via manipulated `role` parameters in `POST`/`DELETE
  /admin/users/:id/roles`, a missing token, a forged token, and the
  positive control (a genuine SUPER_ADMIN passes the exact check a
  plain ADMIN was rejected by). Mocks only what `authenticate()` needs
  (`supabaseAdmin.auth.getUser` + the `profiles`/`user_roles` lookups);
  every scenario is rejected before the handler would ever touch
  `request.db`, and a Proxy-based stub throws loudly if that assumption
  is ever wrong, turning a silently-passing bad test into a hard
  failure instead. This file is what caught two real bugs the day it
  was written - see "Findings from Loop 03" in TASK.md: the app
  couldn't boot at all (`@fastify/helmet@12` requires Fastify 5, this
  project runs Fastify 4), and the centralized error handler was
  masking legitimate `4xx` errors from Fastify/its plugins as generic
  `500`s.
- `papers.rbac.test.ts` - the same HTTP-level pattern applied to the
  paper workflow/question bank/practice modules (12 scenarios): a
  student or a lecturer blocked from approving/rejecting/archiving/
  deleting a paper, a student or a lecturer blocked from verifying a
  question (verification is a library/admin action, not even the
  question's own author's), a student blocked from manually marking a
  practice answer, and unauthenticated requests to start a practice
  session or browse papers both rejected - this deployment requires a
  session even to browse, by design.
- `auth.rate-limit.test.ts` - drives `/api/auth/login` past its
  per-route budget (10/minute) and asserts a real `429` with a proper
  error body comes back, not a masked `500`.
- `test/fakeSupabase.ts` - not a test file itself, the shared fake
  Supabase boundary `app.rbac.test.ts` and `papers.rbac.test.ts` both
  use, so the ~50-line mock isn't duplicated a third time. Also
  excluded from the production build (`tsconfig.build.json`'s
  `src/test/**` exclusion).

Test files are excluded from the production build
(`tsconfig.build.json` in `apps/api` and `packages/shared`) but are
still typechecked by `npm run typecheck` (the full `tsconfig.json`) -
this is deliberate: it's what caught a type error in the
`auth.service.test.ts` mock during development, and losing that
coverage to make the build pass would have been a worse fix than
splitting the configs.

## apps/web - unit/component tests (Vitest + Testing Library)

```bash
npm run test --workspace apps/web
```

## apps/web - end-to-end tests (Playwright)

```bash
cd apps/web
npm run build            # or: npm run dev, and set E2E_BASE_URL
npx playwright install --with-deps chromium   # first run only
npm run test:e2e
```

`playwright.config.ts` supports `PLAYWRIGHT_CHROMIUM_PATH` for
environments with a pre-installed Chromium at a fixed path instead of
Playwright's managed download (used to verify these tests in this
project's own sandboxed dev environment without network access to
Playwright's CDN).

Current coverage is deliberately scoped to what needs **no backend**:
public navigation (landing → login tabs, sign-up client-side
validation, 404), the auth-guard redirect (`/app` and nested protected
routes → `/login` while signed out), and responsive layout
(`responsive-layout.spec.ts`: the landing page must not overflow
horizontally at a 375px mobile viewport, and must show the full
desktop nav at 1440px - a regression test for a real bug found during
a manual screenshot audit, see TASK.md "Findings from Loop 05"). Flows
that need a real account (login, upload, practice, review workflow)
need a seeded Supabase test project; wiring those up is a natural next
step once a dedicated test project exists (point `E2E_BASE_URL` at a
deployed preview and add spec files that sign in via the UI).

## apps/document-service - unit tests (pytest)

```bash
cd apps/document-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
ruff check app tests
pytest -v
```

Covers: health/readiness endpoints, the internal-secret guard on
`POST /jobs` (401 without it), native-text PDF extraction (build a real
PDF in-memory with PyMuPDF and confirm the extracted text round-trips),
and rejection of a non-PDF buffer. OCR itself (the Tesseract path) is
exercised implicitly by CI installing `tesseract-ocr` and importing
`pytesseract`, but there is no dedicated OCR-image test in this suite
yet - see ROADMAP.md.

## Database - RLS/RBAC assertions against a real Postgres instance

This is the suite that actually proves the authorization model works,
not just that the SQL parses. It does not require a Supabase project;
it builds a minimal stub of Supabase's `auth`/`storage` schemas
(`auth.uid()` reading a session GUC exactly like PostgREST/Supabase
populate it from a verified JWT, plus the `anon`/`authenticated` roles
and Supabase's own default table grants) on top of plain Postgres, then
applies every migration and the seed data, then runs a scripted set of
scenarios that switch Postgres role (`SET ROLE authenticated`/`anon`)
and simulate different logged-in users (`set_config('request.jwt.claim.sub', ...)`).

```bash
# requires a local Postgres (or point PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE at one)
createdb njala_test
bash scripts/db-test-setup.sh
bash scripts/db-test-assertions.sh
```

`supabase/tests/rls_rbac_assertions.sql` (run inside a transaction that
is rolled back at the end, so it's safe to re-run) asserts, among
others:

- A student sees exactly the published paper out of four test papers
  in every workflow state, and zero rows from `audit_logs`,
  `answer_keys`, or another student's `practice_sessions`.
- A student cannot `INSERT` a row granting themselves ADMIN (RLS
  raises `42501 insufficient_privilege`, not a silent no-op).
- A lecturer assigned to a course sees all of that course's papers
  regardless of status, but cannot flip a paper from `UNDER_REVIEW` to
  `APPROVED` (0 rows affected - that's a LIBRARY_STAFF/ADMIN action).
- A different lecturer, not assigned to the course, sees only the
  published paper.
- Library staff can advance `SUBMITTED → UNDER_REVIEW` and can read
  audit logs.
- An admin can grant an ordinary role, but cannot grant `SUPER_ADMIN`
  (same `42501` check as the student self-escalation case) - privilege
  escalation is blocked by the database, not just by application code.
- Anonymous (no session) sees only published papers.
- **Unauthorized storage access**: reading `storage.objects` directly
  (bypassing the API's signed-URL flow entirely) mirrors
  `examination_papers` visibility exactly - a student can read the
  published paper's object row but not the draft's. No role - not a
  student, not even LIBRARY_STAFF - can `INSERT`/`UPDATE`/`DELETE`
  `storage.objects` directly at all; uploads only ever happen through
  the API's service-role client (there is no client-facing write
  policy for anyone, by design - see SECURITY.md).
- **Lecturer ownership cannot be self-granted**: a lecturer cannot
  `INSERT` their own `course_lecturers` row to assign themselves to a
  course (blocked - that table is admin-write only).
- **Manipulated request parameters**: a lecturer cannot `UPDATE` their
  own draft paper's `uploaded_by` to reassign it to someone else - a
  classic mass-assignment/IDOR-via-update vector, blocked by the
  `WITH CHECK` clause on the same policy that lets them edit their own
  draft.

15 scenarios in total. CI runs this against a real `postgres:16-alpine` service container on
every push/PR (`.github/workflows/ci.yml`, job `database`).

## CI

`.github/workflows/ci.yml` runs, on every push/PR to `main`:

- **node**: build `packages/shared`, its tests, typecheck + lint +
  test + build for both `apps/api` and `apps/web`.
- **e2e**: builds the web app and runs the Playwright suite against it.
- **document-service**: installs `tesseract-ocr`, `ruff check`, `pytest`.
- **database**: the RLS/RBAC suite above, against a real Postgres
  service container.

## What's not covered yet

See ROADMAP.md. In short: end-to-end tests that need a real account
(would need a dedicated Supabase test project wired into CI), a
dedicated OCR-image test for the document service, and load/performance
testing.
