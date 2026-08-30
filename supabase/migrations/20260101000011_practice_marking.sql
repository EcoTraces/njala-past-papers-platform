-- =====================================================================
-- Deterministic auto-marking for objective question types.
--
-- Students never get SELECT access to answer_keys (see RLS policy
-- answer_keys_select_staff). This trigger runs as the function owner
-- (a role that is not subject to RLS on these tables, same posture as
-- the auth_has_role() family), so it can look up the correct answer
-- and grade the submission without ever exposing it to the client.
-- Only the *result* (is_correct / marks_awarded) becomes readable to
-- the student, through the normal practice_answers RLS policy.
-- =====================================================================

create or replace function mark_practice_answer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  q_type question_type;
  q_marks numeric(5, 2);
  q_tolerance numeric(10, 4);
  correct_option_id uuid;
  key_answer_text text;
begin
  select question_type, marks, numerical_tolerance
    into q_type, q_marks, q_tolerance
    from questions
    where id = new.question_id;

  if q_type in ('MULTIPLE_CHOICE', 'TRUE_FALSE') then
    select id into correct_option_id
      from question_options
      where question_id = new.question_id and is_correct = true
      limit 1;

    new.is_correct := (new.selected_option_id is not null and new.selected_option_id = correct_option_id);
    new.marks_awarded := case when new.is_correct then q_marks else 0 end;
    new.auto_marked := true;
    new.marked_at := now();

  elsif q_type = 'NUMERICAL' then
    select correct_answer_text into key_answer_text
      from answer_keys where question_id = new.question_id;

    if new.numerical_answer is not null and key_answer_text is not null
       and key_answer_text ~ '^-?[0-9]+(\.[0-9]+)?$' then
      new.is_correct := abs(new.numerical_answer - key_answer_text::numeric) <= coalesce(q_tolerance, 0);
      new.marks_awarded := case when new.is_correct then q_marks else 0 end;
      new.auto_marked := true;
      new.marked_at := now();
    else
      -- No parseable numeric key yet - leave for manual marking.
      new.is_correct := null;
      new.marks_awarded := null;
      new.auto_marked := false;
    end if;

  else
    -- SHORT_ANSWER / ESSAY / MIXED require human judgement.
    new.is_correct := null;
    new.marks_awarded := null;
    new.auto_marked := false;
  end if;

  return new;
end;
$$;

create trigger trg_mark_practice_answer
  before insert or update of selected_option_id, numerical_answer, answer_text
  on practice_answers
  for each row execute function mark_practice_answer();

-- ---------------------------------------------------------------------
-- Session submission: recomputes aggregate marks from graded answers
-- and closes the session. Callable by the owning student via RPC.
-- ---------------------------------------------------------------------
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

  select coalesce(sum(pa.marks_awarded), 0) into v_obtained_marks
    from practice_answers pa
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

grant execute on function practice_submit_session(uuid) to authenticated;
