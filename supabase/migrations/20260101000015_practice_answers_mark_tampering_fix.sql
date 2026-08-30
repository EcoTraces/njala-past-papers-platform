-- =====================================================================
-- Loop 09: closes a real score-manipulation hole in practice_answers.
--
-- practice_answers_owner (see ..._rls_policies.sql) is `for all`,
-- scoped only by session ownership - it has no column-level
-- restriction. trg_mark_practice_answer only fired on
-- INSERT/UPDATE OF selected_option_id, numerical_answer, answer_text,
-- so a student could send a raw PostgREST UPDATE against their own
-- practice_answers row touching ONLY marks_awarded/is_correct (never
-- the content columns) and the trigger would never even run - their
-- self-assigned score would be written and stick, completely
-- bypassing grading. The Node API's own route never does this (see
-- apps/api/src/routes/practice.routes.ts's /sessions/:id/answers
-- handler, which only ever writes the content columns), but RLS - not
-- the Node route - is this schema's documented last line of defense
-- (see SECURITY.md), and the original migration's own comment
-- ("deliberately separate... so a student can never set their own
-- marks_awarded/is_correct by hand") asserted a guarantee the schema
-- didn't actually enforce.
--
-- Fix: widen the trigger to also watch marks_awarded/is_correct/
-- auto_marked, and distinguish "a genuine staff manual mark" from "an
-- attempted self-mark" by whether the submitted answer's *content*
-- actually changed in this operation, not by a bare role check alone
-- (a LECTURER/LIBRARY_STAFF account can also take practice sessions
-- themselves, so "caller has a marking role" isn't sufficient on its
-- own - "marking someone else's already-submitted subjective answer"
-- is a content-unchanged update; "submitting my own answer" isn't).
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
  content_unchanged boolean;
  caller_can_mark boolean;
begin
  content_unchanged := TG_OP = 'UPDATE'
    and new.selected_option_id is not distinct from old.selected_option_id
    and new.numerical_answer is not distinct from old.numerical_answer
    and new.answer_text is not distinct from old.answer_text;
  caller_can_mark := auth_has_role('LECTURER') or auth_has_role('LIBRARY_STAFF') or auth_is_admin();

  if content_unchanged and caller_can_mark then
    -- A genuine staff manual mark (practice_answers_mark_staff): the
    -- submitted answer itself isn't changing, only its grade - trust
    -- marks_awarded/is_correct/auto_marked/marked_by/marked_at exactly
    -- as the caller set them.
    return new;
  end if;

  -- Anything else - an ordinary answer submission/resubmission, or an
  -- attempted direct write to the grading columns by the answer's own
  -- owner - is never trusted for marks_awarded/is_correct/auto_marked/
  -- marked_by/marked_at. Always recomputed below instead: a raw
  -- attempt to set them directly on an otherwise-unchanged
  -- MULTIPLE_CHOICE/TRUE_FALSE/NUMERICAL answer is silently overwritten
  -- with the objectively correct grade; on a SHORT_ANSWER/ESSAY/MIXED
  -- answer it's reset to ungraded, exactly as a real content edit
  -- already did before this fix.
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
    new.marked_by := null;

  elsif q_type = 'NUMERICAL' then
    select correct_answer_text into key_answer_text
      from answer_keys where question_id = new.question_id;

    if new.numerical_answer is not null and key_answer_text is not null
       and key_answer_text ~ '^-?[0-9]+(\.[0-9]+)?$' then
      new.is_correct := abs(new.numerical_answer - key_answer_text::numeric) <= coalesce(q_tolerance, 0);
      new.marks_awarded := case when new.is_correct then q_marks else 0 end;
      new.auto_marked := true;
      new.marked_at := now();
      new.marked_by := null;
    else
      -- No parseable numeric key yet - leave for manual marking.
      new.is_correct := null;
      new.marks_awarded := null;
      new.auto_marked := false;
      new.marked_by := null;
      new.marked_at := null;
    end if;

  else
    -- SHORT_ANSWER / ESSAY / MIXED require human judgement. A content
    -- resubmission always resets grading state - staff re-marks it via
    -- a separate call once the new content is in.
    new.is_correct := null;
    new.marks_awarded := null;
    new.auto_marked := false;
    new.marked_by := null;
    new.marked_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_mark_practice_answer on practice_answers;
create trigger trg_mark_practice_answer
  before insert or update of selected_option_id, numerical_answer, answer_text, marks_awarded, is_correct, auto_marked
  on practice_answers
  for each row execute function mark_practice_answer();
