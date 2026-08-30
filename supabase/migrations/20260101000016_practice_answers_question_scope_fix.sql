-- =====================================================================
-- Loop 09: closes a second real practice-scoring hole, found the same
-- way as the mark-tampering one in the previous migration - by
-- actually attacking practice_answers, not just reading the policy.
--
-- practice_answers_owner's WITH CHECK only verified the *session*
-- belonged to the caller - it never verified the *question* being
-- answered was actually part of that session's snapshot
-- (practice_session_questions, written once at session-creation time
-- in POST /api/practice/sessions). A student could INSERT an answer
-- row for ANY verified question in the whole question bank, not just
-- the ones actually presented to them, as long as they owned the
-- session_id. practice_submit_session()'s obtained_marks summed every
-- practice_answers row for the session with no such scoping either, so
-- a single well-chosen extra answer (an easy, high-mark question
-- outside the snapshot) could inflate a student's own score past what
-- their actual session even allows - in the reproduction that caught
-- this, badly enough to overflow the percentage column outright
-- (numeric field overflow on submit, not just a wrong-but-quiet
-- number).
--
-- Fixed at both layers: RLS now refuses to let an answer even be
-- inserted for a question outside the session's snapshot, and
-- practice_submit_session() additionally scopes its marks sum through
-- practice_session_questions as defense in depth, in case a row ever
-- gets in some other way (e.g. a future direct service-role write).
-- =====================================================================

drop policy practice_answers_owner on practice_answers;
create policy practice_answers_owner on practice_answers for all
  using (exists (select 1 from practice_sessions s where s.id = session_id and s.user_id = auth.uid()))
  with check (
    exists (select 1 from practice_sessions s where s.id = session_id and s.user_id = auth.uid())
    and exists (
      select 1 from practice_session_questions psq
      where psq.session_id = practice_answers.session_id and psq.question_id = practice_answers.question_id
    )
  );

create or replace function practice_submit_session(p_session_id uuid)
returns practice_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session practice_sessions;
  v_total_marks numeric(6, 2);
  v_obtained_marks numeric(6, 2);
begin
  select * into v_session from practice_sessions where id = p_session_id;

  if v_session is null then
    raise exception 'Practice session not found';
  end if;

  if v_session.user_id <> auth.uid() then
    raise exception 'Not authorized to submit this session' using errcode = '42501';
  end if;

  if v_session.status = 'SUBMITTED' then
    return v_session;
  end if;

  select coalesce(sum(q.marks), 0) into v_total_marks
    from practice_session_questions psq
    join questions q on q.id = psq.question_id
    where psq.session_id = p_session_id;

  -- Scoped through practice_session_questions (not just
  -- practice_answers.session_id) so an answer for a question outside
  -- this session's actual snapshot can never count toward the score,
  -- regardless of how such a row got there.
  select coalesce(sum(pa.marks_awarded), 0) into v_obtained_marks
    from practice_answers pa
    join practice_session_questions psq on psq.session_id = pa.session_id and psq.question_id = pa.question_id
    where pa.session_id = p_session_id and pa.marks_awarded is not null;

  update practice_sessions
    set status = 'SUBMITTED',
        submitted_at = now(),
        total_marks = v_total_marks,
        obtained_marks = v_obtained_marks,
        percentage = case when v_total_marks > 0 then round((v_obtained_marks / v_total_marks) * 100, 2) else 0 end
    where id = p_session_id
    returning * into v_session;

  return v_session;
end;
$$;
