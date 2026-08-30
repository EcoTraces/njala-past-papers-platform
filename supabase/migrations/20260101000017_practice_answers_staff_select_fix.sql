-- =====================================================================
-- Loop 09: fixes a pre-existing bug (not introduced by this loop's
-- other two practice_answers migrations - reproduced identically
-- against the untouched original schema) that has silently made
-- manual marking of subjective (SHORT_ANSWER/ESSAY) practice answers
-- completely non-functional since the original build.
--
-- practice_answers_mark_staff (for update) grants LECTURER/
-- LIBRARY_STAFF/ADMIN the authority to UPDATE any answer row. But
-- Postgres requires a row be visible under an applicable SELECT policy
-- before an UPDATE/DELETE policy's own USING clause is even
-- considered - and practice_answers had no SELECT policy for staff at
-- all (practice_answers_owner is owner-scoped only). The result: any
-- staff UPDATE targeting another user's answer silently affected 0
-- rows - confirmed by EXPLAIN, and by a plain `select * from
-- practice_answers` returning nothing for a LIBRARY_STAFF caller, on
-- the schema exactly as it shipped. apps/api's
-- POST /api/practice/answers/:answerId/mark route (which uses the
-- RLS-scoped client, not the service role) would fail on every call.
--
-- Fixed with a genuine staff SELECT policy on practice_answers only -
-- practice_sessions/practice_session_questions deliberately stay
-- owner+admin-only (see DATABASE.md: "never SELECT of others'
-- sessions" is intentional privacy design), so this grants staff
-- visibility into individual answers worth marking without letting
-- them browse a student's full session history.
-- =====================================================================

create policy practice_answers_select_staff on practice_answers for select
  using (auth_has_role('LECTURER') or auth_has_role('LIBRARY_STAFF') or auth_is_admin());
