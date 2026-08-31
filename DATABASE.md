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
| `..._practice_answers_mark_tampering_fix.sql` | Widens `mark_practice_answer()`'s trigger to also watch `marks_awarded`/`is_correct`/`auto_marked`, closing a self-scoring hole (see "practice_answers integrity" below) |
| `..._practice_answers_question_scope_fix.sql` | Tightens `practice_answers_owner`'s `WITH CHECK` to require the answered question be in the session's own snapshot; scopes `practice_submit_session()`'s marks sum through `practice_session_questions` as defense in depth |
| `..._practice_answers_staff_select_fix.sql` | Adds `practice_answers_select_staff` - fixes manual marking, which had never actually worked (see below) |
| `..._practice_time_tracking.sql` | `practice_pause_session()`/`practice_resume_session()` RPCs; `practice_submit_session()` updated to finalize `time_spent_seconds` - previously declared in the schema and fetched by the frontend but never actually computed by anything |
| `..._admin_dashboard_stats.sql` | `admin_dashboard_stats()` - SECURITY INVOKER, returns `active_users`/`total_views`/`total_downloads`/`total_practice_attempts` as real `SUM()`/`COUNT()` aggregates, which PostgREST's plain query builder can't express (same class of problem `search_examination_papers()` solved for `ts_rank()` in Loop 08). Every filter column it uses is indexed, but the `SUM(view_count)`/`SUM(download_count)` subqueries themselves are full scans of `examination_papers` (a `SUM` over most of a table gets little benefit from an index regardless) - cheap at today's catalogue size, will degrade linearly as it grows. Not materialized/counter-cached as of Loop 14's perf audit: there's no *measured* regression yet, only a reasoned prediction, and this project's own precedent (the Loop 08 RLS/index fix) is to fix performance issues once a realistic-volume measurement actually shows one, not speculatively. Revisit with a real measurement once the catalogue is large enough to matter. |
| `..._answer_key_leakage_fix.sql` | Re-scopes `question_options_select` and both `answer_keys_select_staff`/`answer_keys_write_staff` - previously any authenticated caller (question_options) or any lecturer regardless of course (answer_keys) could read the actual correct answer via a direct PostgREST call; see "Findings from Loop 11" in TASK.md |

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
  owner-only, plus a narrow staff-only SELECT+UPDATE pair on
  `practice_answers` for manual marking (never SELECT of others'
  *sessions*, never a student setting their own `marks_awarded`).
  `practice_answers_owner`'s `WITH CHECK` also requires the answered
  `question_id` to actually be in that session's own
  `practice_session_questions` snapshot - added in Loop 09 after a real
  attack found that without it, a student could answer (and have
  counted) a verified question that was never actually presented to
  them in that session.
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

**`practice_answers` integrity (Loop 09)**: three real bugs found by
actually attacking the practice-marking flow, not just reading the
policy comments:
1. `practice_answers_owner` (`for all`, owner-scoped) had no
   column-level restriction, and the auto-marking trigger only fired
   on `INSERT/UPDATE OF selected_option_id, numerical_answer,
   answer_text` - so a raw `UPDATE` touching only `marks_awarded`/
   `is_correct` bypassed grading entirely and the client's value stuck.
   Fixed by also watching those grading columns in the trigger, and
   having it distinguish "a genuine staff manual mark" (the submitted
   *content* is unchanged, and the caller holds a marking role) from
   everything else (always recompute/reset instead of trusting the
   client) - not a bare role check alone, since a LECTURER/
   LIBRARY_STAFF account can also take practice sessions themselves.
2. The `practice_answers_owner` `WITH CHECK` fix described above
   (question must be in the session's own snapshot) - a stray answer
   for an out-of-scope question previously inflated `obtained_marks`
   past what `total_marks` accounted for, badly enough in the
   reproduction to overflow the `percentage` column outright on submit.
3. `practice_answers` had **no SELECT policy for staff at all** -
   `practice_answers_mark_staff` only ever granted UPDATE. Postgres
   requires a row be visible under an applicable SELECT policy before
   an UPDATE/DELETE policy's own `USING` is even considered, so every
   staff manual-mark attempt on another user's answer silently affected
   0 rows - a pre-existing bug (reproduced identically against the
   schema exactly as it originally shipped, before this loop's other
   two fixes), not something these two introduced. Manual marking of
   subjective (ESSAY/SHORT_ANSWER) answers had never actually worked.
   Fixed with a genuine `practice_answers_select_staff` policy.

All three verified with real adversarial `EXPLAIN`/attack probes before
being formalized into `rls_rbac_assertions.sql`, and confirmed not to
regress the legitimate flows (a real staff manual mark, and a LECTURER
taking their own practice session still auto-grading normally).

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
