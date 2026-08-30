# Architecture

## System overview

```
                     ┌──────────────────┐
                     │   apps/web        │  React + Vite (Vercel)
                     │   (browser)        │
                     └─────────┬────────┘
                               │ HTTPS (Bearer token = Supabase access token)
                               ▼
                     ┌──────────────────┐        service-role or            ┌──────────────┐
                     │   apps/api        │──────  RLS-scoped queries ──────▶│  Supabase     │
                     │   Fastify (Render)│                                   │  Postgres     │
                     └─────────┬────────┘◀──────────────────────────────────│  Auth/Storage │
                               │ internal HTTP (shared secret)               └──────────────┘
                               ▼
                     ┌──────────────────┐
                     │ document-service   │  FastAPI (Render)
                     │ (PyMuPDF/Tesseract)│
                     └──────────────────┘
```

- **apps/web** never talks to Supabase Auth's password grant directly.
  It calls the Node API's `/api/auth/*` endpoints, which validate
  credentials against Supabase Auth server-side and return a session;
  the frontend then hands that session to `supabase-js` via
  `setSession()` purely so it can auto-refresh tokens. All other reads
  can additionally happen through `supabase-js` if a future iteration
  wants a "thin API" model, but this build routes everything through
  the Node API for a single, auditable authorization point per
  endpoint.
- **apps/api** holds two Supabase clients per request: a service-role
  client (`supabaseAdmin`, used only for the handful of operations that
  legitimately need to bypass RLS: creating auth users at signup,
  admin user management, writing audit_logs/notifications, storage
  writes) and a per-request client scoped to the caller's own access
  token (`request.db`), so ordinary CRUD is *also* subject to Postgres
  RLS - not just the API's own RBAC middleware. See SECURITY.md for why
  both layers exist.
- **apps/document-service** is only ever called by apps/api (shared
  secret header both directions) - never by the browser. It receives a
  signed URL to the uploaded PDF, extracts text via PyMuPDF, falls back
  to Tesseract OCR when the page looks scanned, and reports the result
  back to `POST /api/internal/processing-callback`.

## Authentication: Student ID login on top of Supabase Auth

Supabase Auth requires an email-shaped identifier. Students log in with
a **Student ID**, not an email, so `apps/api/src/services/auth.service.ts`
synthesizes an internal identifier:

```
<normalized-student-id>@<STUDENT_AUTH_IDENTIFIER_DOMAIN>
```

- This identifier is **never** sent to the client, never used to
  deliver real mail, and the configured domain
  (`students.njala.auth.internal` by default) is intentionally
  non-routable.
- `profiles.contact_email` is a separate, optional, real address a
  student may provide, used only for password-reset delivery.
- Staff accounts (LECTURER/LIBRARY_STAFF/ADMIN/SUPER_ADMIN) use their
  real email as the Supabase Auth identifier directly, since they log
  in with email + password - Supabase's own password-reset flow works
  unmodified for them.
- Login failure tracking (`profiles.failed_login_attempts`,
  `locked_until`) is enforced in `auth.service.ts` before/after each
  Supabase sign-in attempt, independent of Supabase's own behavior.

## Role-based access control (defense in depth)

1. **Frontend** (`apps/web/src/routes/ProtectedRoute.tsx`): hides
   screens a user's role can't use. UX only.
2. **API** (`apps/api/src/middleware/authorize.ts`): `requireRole(...)`
   / `requirePermission(...)` preHandlers read only `request.user`,
   which `authenticate()` populated from the database after verifying
   the bearer token against Supabase Auth - never from anything the
   client sent in the body/query/headers.
3. **Postgres RLS** (`supabase/migrations/*_rls_policies.sql`): the
   same rules, re-expressed as SQL policies using `auth.uid()` and the
   `auth_has_role()`/`auth_is_staff()`/`auth_is_admin()` SECURITY
   DEFINER helpers, so a request that reaches the database through
   `request.db` (the RLS-scoped client) is independently correct even
   if the API layer had a bug.

Layers (2) and (3) are proven independently: apps/api has unit tests
for the RBAC middleware, and `supabase/tests/rls_rbac_assertions.sql`
exercises the RLS policies directly against a real Postgres instance
(see TESTING.md).

## Paper workflow state machine

```
DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED → PUBLISHED → ARCHIVED
                  \→ REJECTED → DRAFT (resubmission)
```

Enforced twice: `PAPER_STATUS_TRANSITIONS` in `packages/shared` (used
by `assertValidTransition` in `apps/api/src/services/papers.service.ts`
to reject illegal transitions with a clear error) and by RLS (a
LECTURER's UPDATE policy only ever matches their own DRAFT rows;
LIBRARY_STAFF/ADMIN's UPDATE policy matches any status, but the API
still enforces the legal-transition graph before issuing the update).

## Practice mode and deterministic auto-marking

`practice_sessions` / `practice_session_questions` / `practice_answers`
snapshot which questions belong to an attempt at creation time, so
editing the question bank later never changes a past attempt's
content. A Postgres trigger (`mark_practice_answer`, SECURITY DEFINER)
grades MULTIPLE_CHOICE/TRUE_FALSE against `question_options.is_correct`
and NUMERICAL against `answer_keys` + a tolerance, the instant an
answer is saved - students never get SELECT access to `answer_keys` or
`question_options.is_correct` (verified by the RLS test suite), yet
still get an immediate, correct result. ESSAY/SHORT_ANSWER/MIXED
answers are left ungraded (`marks_awarded IS NULL`) until a
LECTURER/LIBRARY_STAFF/ADMIN grades them via
`POST /api/practice/answers/:id/mark`; `practice_submit_session()`
recomputes the session total from whatever is graded at submit time.

## Document processing pipeline

1. `apps/api` uploads the validated PDF to Supabase Storage
   (service-role client; the object key is a random UUID under
   `<COURSE_CODE>/<date>/`, never the user's filename) and inserts a
   `document_processing_jobs` row with status `QUEUED`.
2. It mints a short-lived signed URL for the file and calls
   `POST /jobs` on apps/document-service (fire-and-forget - the
   upload response does not wait on this).
3. apps/document-service downloads the file, extracts text with
   PyMuPDF, and - if the average characters-per-page falls below a
   threshold (a heuristic for "this is a scan, not a text PDF") - also
   runs Tesseract OCR and merges the result.
4. It reports back to `POST /api/internal/processing-callback`
   (shared-secret header), which updates the job row and the paper's
   `ocr_status`/`extracted_text`/`page_count`. `extracted_text` feeds a
   `tsvector` column used for full-text search.

## Search

`examination_papers.search_vector` (weighted: title > extracted text)
and `courses`'s own `tsvector` index back `websearch_to_tsquery`-style
search via `.textSearch()` in `papers.routes.ts`. Filtering by course/
faculty/department/programme/academic year/semester/examination type
composes with the text query; sorting supports recency, download
count, and title.

## Why a Node API in front of Supabase, instead of a "thin" frontend?

The brief calls for a documented REST API (OpenAPI/Swagger), centralized
audit logging, rate limiting, structured logging, and an internal
document-processing handoff that a browser should never be able to
reach directly. Routing every mutation through Fastify gives one place
to enforce all of that consistently, while RLS still backstops every
query in case a route's authorization check is ever wrong or missing.
