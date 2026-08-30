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
| Responsive layout | `[PARTIAL]` | Tailwind responsive utilities used throughout (`sm:`/`lg:` breakpoints on grids/nav); not manually verified at tablet/mobile viewport in a real browser this session - see Loop 05 |
| Charts (Recharts) | `[MISSING]` | Dependency installed, not wired to any screen - `/api/analytics` data is rendered as plain lists today |
| Paper version replace-file UI | `[MISSING]` | `paper_versions` table + nothing on top of it in the API/UI |
| Paper category tagging UI | `[MISSING]` | `paper_categories`/`paper_category_links` tables exist, no UI |
| Bundle size | `[technical debt]` | Single ~630KB JS chunk, no route-based code-splitting yet |

## Backend — `apps/api`

| Area | Status | Notes |
|---|---|---|
| Auth (student ID + staff email, signup, login, logout, /me, password-reset request) | `[COMPLETE]` | Account activation now genuinely enforced (see above) |
| RBAC middleware (`requireRole`/`requirePermission`) | `[COMPLETE]` | Unit-tested; every route audited this pass has an explicit `preHandler` or plugin-scoped `addHook` - no unprotected mutation found |
| Academic structure CRUD (faculties/departments/programmes/courses/academic-years/semesters) | `[COMPLETE]` | |
| Paper workflow (upload/submit/review/approve/publish/reject/archive/delete/download/bookmark) | `[COMPLETE]` | State machine enforced in code + RLS; unit-tested |
| Question bank (create/read/update/verify/delete) | `[COMPLETE]` | Answer/`is_correct` stripped for non-staff at the route layer (defense in depth on top of RLS) |
| Practice (sessions/answers/submit/manual marking) | `[COMPLETE]` | Deterministic auto-marking verified at the DB layer |
| Dashboards (student/lecturer/library/admin) + analytics | `[COMPLETE]` | Analytics is basic (counts, top lists) - no time-series/export |
| Notifications (list/mark-read/mark-all-read) | `[COMPLETE]` | Creation is system-only (no client insert), by design |
| Admin (users/staff provisioning/status/roles/audit logs/system settings) | `[COMPLETE]` | |
| Internal processing callback | `[COMPLETE]` | Shared-secret guarded, not a Fastify-auth route by design |
| OpenAPI/Swagger | `[COMPLETE]` | Served at `/api/docs`, generated from route schemas |
| Rate limiting | `[PARTIAL]` | Global limiter only (`RATE_LIMIT_MAX`/`WINDOW`); no *stricter* dedicated limit on `/api/auth/login`/`/staff-login`/`/signup` - see Loop 03 |
| Structured logging, security headers, CORS allow-list | `[COMPLETE]` | |
| HTTP-level integration tests (hitting the real Fastify app, not just unit-testing middleware functions) | `[MISSING]` | Existing tests are pure unit tests with hand-built fake `request` objects; nothing uses `app.inject()` against the real route pipeline yet - see Loop 03 |

## Database & Supabase — `supabase/`

| Area | Status | Notes |
|---|---|---|
| Schema (23 tables across 8 migrations) | `[COMPLETE]` | Verified applying cleanly to a real Postgres instance this session |
| RLS on every table | `[COMPLETE]` | Verified via `pg_policies`/`relrowsecurity` and the 11-scenario assertion suite |
| No overly-broad policies | `[COMPLETE]` | Audited every `for all`/`is not null`-only policy this pass - none grant unscoped write access; read-all policies are restricted to genuinely public reference data |
| Storage bucket + policy | `[COMPLETE]` | Private bucket, signed URLs, a defense-in-depth SELECT policy on `storage.objects` |
| Storage-level RLS *test* (as opposed to the bucket policy existing) | `[MISSING]` | The assertion suite tests `examination_papers` row visibility, not a direct `storage.objects` SELECT under different roles - see Loop 02 |
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
| `apps/api` unit | `[COMPLETE]` | 29 (was 27; +2 from the activation-gate regression test) |
| `apps/web` unit | `[PARTIAL]` | 2 - only `StatusBadge`; no coverage of hooks/pages yet |
| `apps/web` e2e (Playwright) | `[PARTIAL]` | 6, public-routes-only; no authenticated-flow e2e (needs a seeded Supabase test project) |
| `apps/document-service` (pytest) | `[COMPLETE]` | 4 |
| DB RLS/RBAC (`supabase/tests/`) | `[PARTIAL]` | 11 scenarios covering the core RBAC matrix; missing a direct storage.objects test and a few of the specific attack scenarios Loop 03 calls for (manipulated request parameters, lecturer modifying an unauthorized *course's* metadata as opposed to its papers) |

## Prioritized implementation checklist (highest priority first)

1. ~~Fix the account-activation gap (security-relevant, small, safe)~~ **done this pass**
2. ~~Fix build output hygiene (test files in dist)~~ **done this pass**
3. ~~Remove duplicate login validation schemas~~ **done this pass**
4. Loop 02: add a direct `storage.objects` RLS test; add course-lecturer-ownership and manipulated-parameter scenarios to the assertion suite.
5. Loop 03: add `app.inject()`-based HTTP integration tests proving the exact attack scenarios listed in the brief; add a stricter rate limit on `/api/auth/*`.
6. Loop 04: confirm (already largely true per the table above) every module is real; no action expected beyond documentation touch-ups.
7. Loop 05: manual responsive check at 3 breakpoints; wire Recharts into the admin analytics view; consider route-based code splitting for the JS bundle.
8. Backlog (not this pass): paper-version replace-file UI, category tagging UI, real transactional email provider, authenticated e2e against a seeded test project, live deployment.

## Verification (this pass)

```
npm run build            # shared → api → web, all clean, test files excluded from all three dist/ outputs
npm run typecheck        # shared, api, web - clean
npm run lint              # api, web - clean
npm run test               # shared 19, api 29, web 2 - all passing
bash scripts/db-test-setup.sh && bash scripts/db-test-assertions.sh   # 11/11 RLS/RBAC scenarios passing, fresh DB
npx playwright test        # 6/6 e2e passing
```
