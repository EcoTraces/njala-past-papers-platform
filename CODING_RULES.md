# Coding Rules

Concrete, enforced-by-review rules for this codebase, not general
advice. If you're changing something covered here, the rule is the
default - deviate only with a good, stated reason.

## Authorization

- **Never trust a role/permission claim from the client.** RBAC checks
  read only `request.user`, which `authenticate()` populated from the
  database after verifying the bearer token. See
  `apps/api/src/middleware/authorize.ts`.
- **Every mutation needs an explicit `preHandler` chain** -
  `authenticate` plus `requireRole`/`requirePermission` as appropriate.
  Do not rely on RLS alone to reject an unauthorized API request; the
  two layers are meant to fail independently and correctly.
- **`supabaseAdmin` (service-role client) is reserved** for the
  documented narrow cases (signup's initial auth-user creation, admin
  user management, writing `audit_logs`/`notifications`, Storage
  writes). Anywhere else, use `request.db`.
- **Any new privilege-escalation surface** (a table/column another role
  could use to grant itself something) needs a `WITH CHECK` clause
  preventing it, and a test in `supabase/tests/rls_rbac_assertions.sql`
  proving the block.

## Database

- **RLS is mandatory on every table.** No table ships without RLS
  enabled and explicit policies. `authenticated users can do
  everything` is never an acceptable policy.
- **Never edit an already-committed migration.** Add a new one.
- **Soft-delete tables that other rows reference** (`deleted_at`); hard
  `DELETE` only where nothing meaningful depends on history.

## API

- **Zod-validate every input**, shared between API and frontend via
  `packages/shared` where the same shape is used on both sides.
- **Centralized error handling**: throw an `AppError` subclass
  (`apps/api/src/lib/errors.ts`); don't hand-roll `reply.status(...)`
  error bodies in route handlers.
- **Structured logging** (pino) - no `console.log` in `apps/api/src`.
- **Audit security-relevant actions** via `recordAuditEvent()`.

## Frontend

- **`ProtectedRoute` is UX, not security.** Every screen it gates must
  also be independently protected by the API/RLS - never add a screen
  that's *only* protected by the frontend guard.
- **No direct Supabase password-grant calls from the browser.** Auth
  goes through the API's `/api/auth/*` endpoints (see
  ARCHITECTURE.md); `supabase-js` in the frontend is used only for
  session/token refresh after the API hands it a session.

## General

- **No fabricated data.** No hardcoded "demo" records pretending to be
  real, no mock authentication left in as the final implementation, no
  fake analytics. Seed data (`supabase/seed/seed.sql`) is clearly
  labeled as development/demo-only and is never applied against
  production.
- **No silently-broken integrations.** If something is a genuine,
  documented integration point that isn't wired to a live provider yet
  (e.g. `ConsoleEmailProvider` for transactional email - see
  SECURITY.md), it must behave correctly end-to-end at every call site
  and say so loudly (logged), never fail silently or pretend to have
  sent something it didn't.
- **Strong typing.** Avoid `any`; `eslint` is configured to warn on it.
  Where an external library's types are genuinely wrong/missing, isolate
  the cast to one place with a comment explaining why.
- **Don't claim a feature works without testing it.** If you can't run
  it (no live Supabase project, no deployed environment), say so
  explicitly rather than asserting it works. See TESTING.md for what
  has actually been run and verified in this repository's history.
