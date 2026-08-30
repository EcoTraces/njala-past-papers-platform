-- =====================================================================
-- Loop 09: practice_sessions.time_spent_seconds existed since the
-- original schema and apps/web's PracticeResults.tsx already fetches
-- it into its type, but nothing ever computed it - it silently stayed
-- at its default 0 forever, and the frontend didn't even render it
-- once fetched. "See time spent" is an explicit item in the practice-
-- engine brief.
--
-- started_at is repurposed here as "start of the current active
-- segment" rather than strictly "original session creation time"
-- (created_at already covers that, immutably) - pause/resume/submit
-- all accumulate the elapsed active segment into time_spent_seconds
-- and reset started_at to now() for pause/resume, so multiple pause/
-- resume cycles sum correctly instead of only measuring the very
-- first segment or double-counting paused time.
-- =====================================================================

create or replace function practice_pause_session(p_session_id uuid)
returns practice_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session practice_sessions;
begin
  select * into v_session from practice_sessions where id = p_session_id;

  if v_session is null then
    raise exception 'Practice session not found';
  end if;
  if v_session.user_id <> auth.uid() then
    raise exception 'Not authorized to pause this session' using errcode = '42501';
  end if;
  if v_session.status <> 'IN_PROGRESS' then
    raise exception 'Only an in-progress session can be paused' using errcode = '22023';
  end if;

  update practice_sessions
    set status = 'PAUSED',
        paused_at = now(),
        time_spent_seconds = time_spent_seconds + greatest(0, extract(epoch from (now() - started_at))::int)
    where id = p_session_id
    returning * into v_session;

  return v_session;
end;
$$;

create or replace function practice_resume_session(p_session_id uuid)
returns practice_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session practice_sessions;
begin
  select * into v_session from practice_sessions where id = p_session_id;

  if v_session is null then
    raise exception 'Practice session not found';
  end if;
  if v_session.user_id <> auth.uid() then
    raise exception 'Not authorized to resume this session' using errcode = '42501';
  end if;
  if v_session.status <> 'PAUSED' then
    raise exception 'Only a paused session can be resumed' using errcode = '22023';
  end if;

  update practice_sessions
    set status = 'IN_PROGRESS',
        paused_at = null,
        started_at = now() -- start of the new active segment
    where id = p_session_id
    returning * into v_session;

  return v_session;
end;
$$;

grant execute on function practice_pause_session(uuid) to authenticated;
grant execute on function practice_resume_session(uuid) to authenticated;

-- practice_submit_session: add the final active segment (from the
-- start of the current segment to submission) before closing out,
-- exactly like pause does, so a session submitted directly from
-- IN_PROGRESS (the common case - most students don't pause at all)
-- still gets a real total instead of staying at whatever pause-only
-- accumulation happened to produce (0, if they never paused).
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
  v_final_time_spent integer;
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
    join practice_session_questions psq on psq.session_id = pa.session_id and psq.question_id = pa.question_id
    where pa.session_id = p_session_id and pa.marks_awarded is not null;

  -- If currently PAUSED, the paused segment contributes no additional
  -- time (already folded into time_spent_seconds by the pause above);
  -- if IN_PROGRESS, add the final active segment now.
  v_final_time_spent := v_session.time_spent_seconds
    + case when v_session.status = 'IN_PROGRESS' then greatest(0, extract(epoch from (now() - v_session.started_at))::int) else 0 end;

  update practice_sessions
    set status = 'SUBMITTED',
        submitted_at = now(),
        total_marks = v_total_marks,
        obtained_marks = v_obtained_marks,
        percentage = case when v_total_marks > 0 then round((v_obtained_marks / v_total_marks) * 100, 2) else 0 end,
        time_spent_seconds = v_final_time_spent
    where id = p_session_id
    returning * into v_session;

  return v_session;
end;
$$;
