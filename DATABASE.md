# Database

PostgreSQL via Supabase. Schema lives entirely in
`supabase/migrations/*.sql`, applied in filename order (timestamp
prefix). Seed data for local development is in `supabase/seed/seed.sql`.

## Migration files

| File | Contents |
|---|---|
| `..._extensions_and_enums.sql` | Extensions (`uuid-ossp`, `pgcrypto`, `pg_trgm`, `unaccent`), every enum type, `set_updated_at()` trigger function |
| `..._roles_permissions.sql` | `roles`, `permissions`, `role_permissions`, seeded with the 5 roles and their permission grants |
| `..._profiles.sql` | `profiles` (extends `auth.users`), `user_roles`, and the `auth_has_role()`/`auth_is_staff()`/`auth_is_admin()`/`auth_role_names()` SECURITY DEFINER helpers RLS policies build on |
| `..._academic_structure.sql` | `faculties`, `departments`, `programmes`, `courses`, `course_lecturers`, `academic_years`, `semesters` |
| `..._examination_papers.sql` | `examination_papers` (the workflow table), `paper_versions`, `paper_reviews`, `paper_categories`/`paper_category_links`, `paper_downloads`, `paper_views` |
| `..._questions_and_answers.sql` | `questions`, `question_options`, `answer_keys` |
| `..._practice.sql` | `practice_sessions`, `practice_session_questions`, `practice_answers` |
| `..._engagement_and_ops.sql` | `bookmarks`, `notifications`, `audit_logs`, `document_processing_jobs`, `system_settings` |
| `..._rls_policies.sql` | Enables RLS on every table and defines every policy |
| `..._storage.sql` | Creates the private `examination-papers` bucket and its `storage.objects` SELECT policy |
| `..._practice_marking.sql` | `mark_practice_answer()` trigger (deterministic auto-marking) and `practice_submit_session()` RPC |
| `..._counters.sql` | `increment_paper_view_count()` / `increment_paper_download_count()` SECURITY DEFINER RPCs |
| `..._paper_search.sql` | `search_examination_papers()` - SECURITY INVOKER (not DEFINER) relevance-ranked full-text search RPC, `idx_papers_programme`/`idx_papers_created_at`/`idx_papers_download_count` |
| `..._papers_rls_perf.sql` | Rewrites `examination_papers`'s `papers_select_own`/`papers_select_course_lecturer`/`papers_select_staff` policies to wrap `auth.uid()`/`auth_has_role()`/`auth_is_admin()` in `(select ...)` - a real, measured performance fix (see "Findings from Loop 08" in TASK.md), not a behavior change |

## Design choices

- **UUID primary keys** (`gen_random_uuid()`) everywhere.
- **Soft deletion** (`deleted_at timestamptz`) on tables where a
  historical reference must keep resolving (faculties, departments,
  programmes, courses, examination_papers, questions). `academic_years`
  and `semesters` are hard-deletable (an admin-only, rarely-used
  action) since nothing else in the domain has a strong reason to keep
  a reference to a deleted one beyond FK RESTRICT already provided by
  papers pointing at them.
- **Duplicate detection**: a unique index on
  `(course_id, examination_type, academic_year_id, checksum_sha256)`
  where `deleted_at is null` stops the same file being published twice
  for the same exam.
- **Full-text search**: `examination_papers.search_vector` (GIN index,
  weighted title > OCR text) maintained by a trigger; `courses` has its
  own `tsvector` GIN index over code+title. Relevance-ranked search
  (`sort=relevance`) goes through `search_examination_papers()`, a
  SECURITY INVOKER SQL function - PostgREST's plain filter/order
  interface can't express `ts_rank`, but a plain query builder call
  can't either, so this is the one search path that needs a real
  Postgres function; every other sort mode still uses the ordinary
  embedded-select query. SECURITY INVOKER (not DEFINER, unlike the
  counters/marking RPCs) means RLS still governs which rows a caller
  can see, verified directly in `rls_rbac_assertions.sql`.
- **Practice snapshotting**: `practice_session_questions` freezes which
  questions (and their order) belong to an attempt, so later edits to
  the question bank never retroactively change a submitted attempt.
- **Audit logs are append-only** from the application's point of view:
  no UPDATE/DELETE RLS policy exists for any role, and INSERT happens
  only via the service-role client (`recordAuditEvent` in
  `apps/api/src/services/audit.service.ts`).
- **Answer keys are never exposed to students** at the RLS layer (see
  SECURITY.md) - grading happens inside a SECURITY DEFINER trigger that
  can see them without ever returning them to the client.

## Row Level Security

Every table in `public` has RLS enabled - verified in CI (`database`
job) by asserting `pg_class.relrowsecurity = true` implicitly (the
harness applies the migrations and the assertions rely on RLS actually
filtering rows; see `supabase/tests/rls_rbac_assertions.sql`). Full
policy design and worked examples are in SECURITY.md and
ARCHITECTURE.md; the short version:

- Reference/catalogue tables (faculties, departments, programmes,
  courses, academic_years, semesters, roles, permissions): readable by
  any authenticated user, writable only by ADMIN/SUPER_ADMIN.
- `examination_papers`: visible if `PUBLISHED`, or if you uploaded it,
  or if you're a LECTURER assigned to its course, or if you're
  LIBRARY_STAFF/ADMIN/SUPER_ADMIN. Writable per the workflow role
  rules described in ARCHITECTURE.md.
- `practice_sessions`/`practice_session_questions`/`practice_answers`:
  owner-only, plus a narrow staff-only UPDATE policy on
  `practice_answers` for manual marking (never SELECT of others'
  sessions, never a student setting their own `marks_awarded`).
- `answer_keys`: staff or the question's own author only - never a
  plain STUDENT role.
- `audit_logs`: SELECT restricted to LIBRARY_STAFF/ADMIN/SUPER_ADMIN;
  no client INSERT policy at all.
- `user_roles`: a user reads their own row; ADMIN/SUPER_ADMIN can grant
  any role *except* SUPER_ADMIN, which only a SUPER_ADMIN may grant -
  enforced in the `WITH CHECK` clause, not just in application code.

**RLS policy performance**: wrap a policy's `auth.uid()`/
`auth_has_role()`/`auth_is_admin()`/`auth_is_staff()` calls in
`(select ...)`. Found via Loop 08's realistic-data-volume search test:
`examination_papers` has four permissive SELECT policies that Postgres
combines with OR into one qual evaluated per candidate row; with the
functions called unwrapped, a 50k-row keyword search took ~940ms via a
full sequential scan (the planner wouldn't use the GIN index on
`search_vector` at all, regardless of role). Wrapping them as
`(select ...)` - Postgres's own documented RLS performance pattern,
which turns each call into a once-evaluated InitPlan instead of a
per-row one - cut the same query to ~29-110ms with *identical*
authorization behavior (all 30 `rls_rbac_assertions.sql` scenarios
still pass unchanged). Applied so far only to `examination_papers`'s
SELECT policies (`..._papers_rls_perf.sql`) - the same pattern likely
benefits its INSERT/UPDATE/DELETE policies and other RLS-protected
tables too; a broader pass is flagged in ROADMAP.md rather than done
speculatively here without the matching realistic-volume measurement
to justify each change.

## Storage

A single private bucket, `examination-papers` (25MB limit,
`application/pdf` only, configured in
`supabase/migrations/..._storage.sql`). Uploads/deletes happen only
through the service-role client in `apps/api` - there is no client-side
Storage write policy. A SELECT policy on `storage.objects` exists as
defense-in-depth (mirrors the same visibility rules as
`examination_papers`) in case something ever calls the Storage REST API
directly instead of using a signed URL.

## Running migrations

Against a Supabase project: `supabase link --project-ref <ref>` then
`supabase db push` (see docs/deployment/README.md). Locally, without a
full Supabase stack, `scripts/db-test-setup.sh` applies every migration
plus the seed data to a plain Postgres instance fitted with a minimal
stub of Supabase's `auth`/`storage` schemas - this is what CI uses to
prove the migrations and RLS policies are actually correct SQL, not
just plausible-looking SQL (see TESTING.md).
