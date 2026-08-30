-- =====================================================================
-- Practice mode: sessions, the question set snapshot for each session,
-- and student answers with deterministic auto-marking for objective
-- question types.
-- =====================================================================

create table practice_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  course_id uuid references courses(id) on delete set null,
  source_paper_id uuid references examination_papers(id) on delete set null,

  title text not null default 'Practice session',
  status practice_session_status not null default 'IN_PROGRESS',

  total_questions smallint not null default 0,
  total_marks numeric(6, 2) not null default 0,
  obtained_marks numeric(6, 2),
  percentage numeric(5, 2),

  started_at timestamptz not null default now(),
  paused_at timestamptz,
  submitted_at timestamptz,
  time_spent_seconds integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_practice_sessions_user on practice_sessions (user_id);
create index idx_practice_sessions_course on practice_sessions (course_id);
create index idx_practice_sessions_status on practice_sessions (status);

create trigger trg_practice_sessions_updated_at
  before update on practice_sessions for each row execute function set_updated_at();

-- Snapshot of which questions belong to a session, in what order, so
-- editing the question bank later never changes a past attempt.
create table practice_session_questions (
  session_id uuid not null references practice_sessions(id) on delete cascade,
  question_id uuid not null references questions(id) on delete restrict,
  order_index smallint not null,
  primary key (session_id, question_id)
);

create index idx_psq_session on practice_session_questions (session_id);

create table practice_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references practice_sessions(id) on delete cascade,
  question_id uuid not null references questions(id) on delete restrict,

  selected_option_id uuid references question_options(id),
  answer_text text,
  numerical_answer numeric(14, 4),

  is_correct boolean,             -- null until marked
  marks_awarded numeric(5, 2),
  auto_marked boolean not null default false,
  marked_by uuid references profiles(id), -- set for manual marking of essays
  marked_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, question_id)
);

create index idx_practice_answers_session on practice_answers (session_id);
create index idx_practice_answers_question on practice_answers (question_id);

create trigger trg_practice_answers_updated_at
  before update on practice_answers for each row execute function set_updated_at();
