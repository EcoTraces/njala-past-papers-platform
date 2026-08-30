-- =====================================================================
-- Question bank: reusable questions sourced from past papers or
-- authored directly by lecturers/library staff.
-- =====================================================================

create table questions (
  id uuid primary key default gen_random_uuid(),

  source_paper_id uuid references examination_papers(id) on delete set null,
  course_id uuid not null references courses(id) on delete restrict,

  section text,
  question_number text,
  question_text text not null,
  question_type question_type not null,
  marks numeric(5, 2) not null default 1 check (marks > 0),
  difficulty smallint check (difficulty between 1 and 5) default 3,

  -- For SHORT_ANSWER / NUMERICAL / ESSAY (indicative model answer, not
  -- auto-disclosed to students during an active attempt).
  expected_answer text,
  numerical_tolerance numeric(10, 4),
  explanation text,

  author_id uuid not null references profiles(id),
  verification_status question_verification_status not null default 'UNVERIFIED',
  verified_by uuid references profiles(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_questions_course on questions (course_id);
create index idx_questions_source_paper on questions (source_paper_id);
create index idx_questions_type on questions (question_type);
create index idx_questions_verification on questions (verification_status);
create index idx_questions_search on questions using gin (to_tsvector('english', question_text));

create trigger trg_questions_updated_at
  before update on questions for each row execute function set_updated_at();

-- MCQ / true-false options.
create table question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  option_label text not null, -- "A", "B", "True", "False"...
  option_text text not null,
  is_correct boolean not null default false,
  order_index smallint not null default 0,
  unique (question_id, option_label)
);

create index idx_question_options_question on question_options (question_id);

-- At most one canonical answer key per question (kept separate from
-- questions so authorship/verification of the key can differ from the
-- question itself, and so essay-marking rubrics can live here).
create table answer_keys (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null unique references questions(id) on delete cascade,
  correct_answer_text text,
  marking_rubric text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_answer_keys_updated_at
  before update on answer_keys for each row execute function set_updated_at();
