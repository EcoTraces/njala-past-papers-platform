-- =====================================================================
-- Loop 11 (security hardening): two RLS policies exposed the actual
-- correct answer far more broadly than intended. Table-level GRANTs on
-- every public table are wide open to anon/authenticated (the normal
-- Supabase pattern - RLS is meant to be the real enforcement layer),
-- so these policies are directly reachable by anyone hitting
-- PostgREST/supabase-js with their own valid JWT, not just through
-- this repo's own Node API's (safer, but not the actual boundary)
-- query shapes.
--
-- 1. `question_options_select` had a `q.verification_status =
--    'VERIFIED'` branch with NO role check at all - since
--    `question_options` carries `is_correct` directly, this let ANY
--    authenticated caller, including a plain STUDENT, read the correct
--    answer for every verified MULTIPLE_CHOICE/TRUE_FALSE question in
--    the entire system, at any time - not just their own practice
--    session's questions, not gated by course, not gated by role. This
--    is more severe than simple lecturer-to-lecturer leakage: it lets
--    a student look up the answer key before (or during) any practice
--    attempt, defeating the entire point of `stripAnswers()` in
--    questions.routes.ts, which only strips the JSON response and
--    never touched the actual RLS boundary. Replaced with: staff
--    (LIBRARY_STAFF/ADMIN/SUPER_ADMIN) and the question's
--    author/course-lecturer keep full visibility (legitimate
--    authoring/review need), and a student taking a practice session
--    that actually includes the question keeps seeing the row (needed
--    for PracticeSession.tsx to render option text/labels - the Node
--    route itself never selects `is_correct` in that path). This
--    closes the systemic "any verified question, any time, any
--    caller" leak; a narrower residual (a student manually crafting a
--    raw PostgREST call against their own currently-active session's
--    question, explicitly requesting `is_correct`) remains and is
--    recorded in ROADMAP.md - Postgres RLS is row-level, not
--    column-level, and this app deliberately uses one shared
--    `authenticated` Postgres role for every app-level role, so fully
--    closing that gap needs a schema-level split (a safe view/RPC that
--    never returns `is_correct` to a non-privileged caller), not a
--    single-policy tweak.
--
-- 2. `answer_keys_select_staff` used `auth_is_staff()`, which is true
--    for LECTURER too - so ANY lecturer, regardless of which course
--    they teach, could read `correct_answer_text` for every NUMERICAL
--    question system-wide via a direct `select * from answer_keys`.
--    Unlike question_options, there is no legitimate student-facing
--    (or even any SELECT-shaped) use of this table anywhere in the API
--    - numerical auto-marking goes through the SECURITY DEFINER
--    `mark_practice_answer()` trigger, which needs no row-level grant
--    of its own. So this one has a clean fix with no residual: scoped
--    to LIBRARY_STAFF/ADMIN/SUPER_ADMIN plus the question's own
--    author/course-lecturer, exactly matching the established
--    `papers_select_course_lecturer` "own course" pattern.
-- =====================================================================

drop policy if exists question_options_select on question_options;
create policy question_options_select on question_options for select
  using (
    exists (
      select 1 from questions q
      where q.id = question_options.question_id
        and (
          q.author_id = auth.uid()
          or auth_has_role('LIBRARY_STAFF')
          or auth_is_admin()
          or exists (
            select 1 from course_lecturers cl
            where cl.course_id = q.course_id and cl.lecturer_id = auth.uid()
          )
        )
    )
    or exists (
      select 1
      from practice_session_questions psq
      join practice_sessions ps on ps.id = psq.session_id
      where psq.question_id = question_options.question_id
        and ps.user_id = auth.uid()
    )
  );

drop policy if exists answer_keys_select_staff on answer_keys;
create policy answer_keys_select_staff on answer_keys for select
  using (
    auth_has_role('LIBRARY_STAFF')
    or auth_is_admin()
    or exists (
      select 1 from questions q
      where q.id = answer_keys.question_id
        and (
          q.author_id = auth.uid()
          or exists (
            select 1 from course_lecturers cl
            where cl.course_id = q.course_id and cl.lecturer_id = auth.uid()
          )
        )
    )
  );

-- `answer_keys_write_staff` is a `for all` policy - its USING clause
-- governs SELECT too (Postgres RLS: multiple permissive policies for
-- the same command are OR'd together), and its blanket
-- `auth_has_role('LECTURER')` (no course/author scoping at all) was
-- silently re-opening the exact same hole the SELECT-only policy
-- above just closed - a lecturer blocked by answer_keys_select_staff
-- would still pass this policy's own USING clause and see the row
-- anyway. Scoped identically to the SELECT policy for LECTURER;
-- LIBRARY_STAFF/ADMIN keep full read/write access (the system-wide
-- review authority, matching every other staff-scoped policy in this
-- schema). WITH CHECK is unchanged (`created_by = auth.uid()` already
-- meant a lecturer could only ever insert an answer key as themselves).
drop policy if exists answer_keys_write_staff on answer_keys;
create policy answer_keys_write_staff on answer_keys for all
  using (
    auth_has_role('LIBRARY_STAFF')
    or auth_is_admin()
    or exists (
      select 1 from questions q
      where q.id = answer_keys.question_id
        and (
          q.author_id = auth.uid()
          or exists (
            select 1 from course_lecturers cl
            where cl.course_id = q.course_id and cl.lecturer_id = auth.uid()
          )
        )
    )
  )
  with check (created_by = auth.uid());
