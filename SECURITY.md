# Security

## Authentication

- **Students** log in with a Student ID + password. Supabase Auth
  requires an email-shaped identifier, so `apps/api` synthesizes
  `<normalized-student-id>@<STUDENT_AUTH_IDENTIFIER_DOMAIN>` server-side
  (see ARCHITECTURE.md). This value never reaches the client and is
  never used to send real mail.
- **Staff** log in with a real email + password; their Supabase Auth
  identifier *is* that email, so Supabase's own password-reset flow
  works unmodified.
- **Session tokens** (Supabase access/refresh tokens) are handed to the
  frontend once, then managed by `supabase-js` (`persistSession: true`,
  `autoRefreshToken: true`) in `localStorage`. This is the standard
  Supabase SPA pattern; it trades some XSS exposure surface for a
  working refresh-token flow without a backend session store. The API
  sets standard security headers (`@fastify/helmet`) and a locked-down
  CSP, and never renders unsanitized user content as HTML, which is the
  primary mitigation for the XSS class that would matter here. A
  cookie-based session (httpOnly, SameSite) is a reasonable hardening
  step for a future iteration; it wasn't adopted here to avoid also
  needing CSRF protection for a token that's otherwise sent as a bearer
  header on every request.
- **Account activation**: self-registration cannot verify a Student ID
  against a real institutional roster, so `signupStudent()` creates the
  profile as `PENDING`, not `ACTIVE`. `loginStudent()` rejects a
  `PENDING` account outright with a clear message, and the
  `authenticate()` middleware rejects it on every subsequent API call
  regardless. A LIBRARY_STAFF/ADMIN activates the account via
  `PATCH /api/admin/users/:id/status`. The frontend enforces this too:
  `ProtectedRoute` redirects any signed-in user whose `status !==
  'ACTIVE'` to `/account-pending` rather than rendering the app shell
  (defense in depth - the API/RLS layers are what actually matter).
- **Failed-login lockout**: `profiles.failed_login_attempts` /
  `locked_until` are updated in `auth.service.ts`; 5 consecutive
  failures locks the account for 15 minutes. Error messages are
  deliberately generic ("Invalid Student ID or password") to avoid
  confirming which Student IDs exist.
- **Privileged accounts are never self-registered.** `/api/auth/signup`
  hardcodes the STUDENT role - there is no code path where a client
  request can create a LECTURER/LIBRARY_STAFF/ADMIN/SUPER_ADMIN account.
  Those are created only via `POST /api/admin/staff`, itself gated to
  ADMIN/SUPER_ADMIN, and only a SUPER_ADMIN may provision another
  SUPER_ADMIN (checked in application code *and* in the `user_roles`
  RLS `WITH CHECK` clause independently).

## Authorization (defense in depth)

Three independent layers, in order of how much you should trust them:

1. **Frontend route guard** (`ProtectedRoute.tsx`) - UX only, hides
   screens. Never treat as a security control.
2. **API RBAC middleware** (`requireRole`/`requirePermission` in
   `apps/api/src/middleware/authorize.ts`) - reads only
   `request.user.roles`, which `authenticate()` populated by verifying
   the bearer token against Supabase Auth and then reading the
   `profiles`/`user_roles` tables server-side. It never trusts a role
   claim supplied by the client. Unit-tested in `authorize.test.ts`.
3. **Postgres Row Level Security** - the same rules re-expressed as SQL
   policies (`supabase/migrations/*_rls_policies.sql`), evaluated
   against `auth.uid()` derived from the verified JWT PostgREST/Supabase
   itself validates. This is the layer that still protects the data if
   an API route's authorization check is ever missing or wrong.
   Directly exercised by `supabase/tests/rls_rbac_assertions.sql`
   against a real Postgres instance (see TESTING.md) - 15 scenarios
   including IDOR, IDOR-adjacent (another student's practice session),
   IDOR on the paper workflow (an unrelated lecturer, a lecturer trying
   to approve their own paper), IDOR-and-privilege-escalation (an ADMIN
   granting SUPER_ADMIN, a lecturer self-assigning course ownership),
   mass-assignment-via-UPDATE (a lecturer reassigning a paper's
   `uploaded_by`), direct unauthorized storage access (bypassing the
   signed-URL flow to read `storage.objects` directly), and anonymous
   access boundaries.

`apps/api` additionally uses a **per-request, token-scoped Supabase
client** (`request.db`) for ordinary reads/writes instead of the
service-role client, so RLS applies to almost everything the API does -
the service-role client (`supabaseAdmin`) is reserved for the narrow
set of operations that must legitimately bypass RLS: creating an auth
user at signup, admin user management via the Supabase Admin API,
writing `audit_logs`/`notifications` (which have no client INSERT
policy by design), and Storage writes.

The default Supabase client assigned to every incoming request *before*
`authenticate()` runs is the **anon-key client**, not the service-role
client - a route that forgets to add the `authenticate` preHandler gets
essentially no data access (RLS as the anonymous Postgres role) instead
of silently inheriting full service-role privileges. See the comment on
`supabaseAnon` in `apps/api/src/lib/supabase.ts`.

## File upload security

- **MIME + magic-byte validation**: `validatePaperUpload()`
  (`apps/api/src/services/storage.service.ts`) checks the declared MIME
  type *and* sniffs the first 5 bytes for the real `%PDF-` signature -
  a renamed non-PDF is rejected even if declared as `application/pdf`.
  Unit-tested.
- **Size limit**: 25MB, enforced both by Fastify's multipart plugin and
  again in `validatePaperUpload()`.
- **Generated object keys**: the Storage path is
  `<sanitized-course-code>/<date>/<random-uuid>.pdf` - the user's
  original filename is stored only as a display field
  (`original_filename`), never used to build a path (so it can't be
  used for path traversal or to overwrite another object).
- **Checksums**: SHA-256 of the file content is stored and used both
  for duplicate detection (a DB unique index) and, incidentally, file
  integrity.
- **Private storage, signed URLs**: the `examination-papers` bucket is
  not public; every view/download goes through a signed URL minted
  server-side with a short expiry (`SIGNED_URL_EXPIRY_SECONDS`,
  default 300s), scoped to a paper the caller is already authorized
  (by RLS) to see.

## Answer key confidentiality

`answer_keys` and `question_options.is_correct` are never selectable by
a STUDENT-role client, at the RLS layer (verified by the test suite)
*and* stripped again defensively in the API's questions route before
serialization, even though the underlying `request.db` query for a
non-staff caller can't select `is_correct` in the first place. Grading
happens inside a SECURITY DEFINER Postgres trigger
(`mark_practice_answer`), which can read the answer without ever
returning it - only the computed `is_correct`/`marks_awarded` result
is exposed.

## Rate limiting, headers, logging

- `@fastify/rate-limit`: configurable max requests per window
  (`RATE_LIMIT_MAX`/`RATE_LIMIT_WINDOW_MS`), applied globally including
  the internal callback endpoint.
- `@fastify/helmet` with a restrictive CSP (`default-src 'self'`) and
  `crossOriginResourcePolicy: same-site`.
- CORS is allow-listed (`CORS_ALLOWED_ORIGINS`), not wildcarded.
- Structured JSON logging (pino) with `Authorization` headers and any
  `password`/`token` fields redacted (`apps/api/src/lib/logger.ts`).
- **Audit logging**: `recordAuditEvent()` writes actor, action, entity,
  IP, user agent, and metadata for every security-relevant action
  (login success/failure, paper upload/submit/approve/reject/archive/
  delete/download, question create/verify/reject, practice submit/
  manual-mark, user status change/role grant/revoke, staff account
  creation, system settings changes). Read access is
  LIBRARY_STAFF/ADMIN/SUPER_ADMIN only; there is no client INSERT
  policy on `audit_logs` at all - only the service-role client writes
  it.

## Internal service-to-service trust

`apps/document-service` is never reachable from a browser in the
intended deployment (it should sit on a private network / not be
publicly routable in production, or at minimum only accept the shared
secret). Both directions of the handoff
(`apps/api → POST /jobs`, `document-service → POST
/api/internal/processing-callback`) require a shared secret header
(`X-Internal-Secret`, compared with `hmac.compare_digest`/a direct
equality check) configured via `DOCUMENT_SERVICE_CALLBACK_SECRET` /
`DOCUMENT_SERVICE_SHARED_SECRET`, which must match between the two
services and must be a real secret in production (`change-me-in-
production` is a placeholder, not a default meant to survive
deployment).

## Things this build does NOT claim

- **No live penetration test was performed.** The RLS/RBAC assertions
  and the storage-upload unit tests are real, automated, and passing,
  but they are not a substitute for a professional security review
  before handling real student data.
- **Password reset delivery** uses a pluggable `EmailProvider`
  interface; the default (`ConsoleEmailProvider`) logs instead of
  sending real mail. A production deployment must configure a real
  provider - this is a documented integration point, not a silent gap
  (see PRD.md "Out of scope").
- **No WAF/DDoS layer** is configured here; that's expected to come
  from the hosting platform (Vercel/Render both offer this) rather than
  application code.
