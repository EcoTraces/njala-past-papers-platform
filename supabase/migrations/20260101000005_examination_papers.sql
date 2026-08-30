-- =====================================================================
-- Examination papers: the core document workflow.
-- DRAFT -> SUBMITTED -> UNDER_REVIEW -> APPROVED -> PUBLISHED -> ARCHIVED
--                                                 \-> REJECTED
-- =====================================================================

create table examination_papers (
  id uuid primary key default gen_random_uuid(),

  title text not null,
  course_id uuid not null references courses(id) on delete restrict,
  faculty_id uuid not null references faculties(id) on delete restrict,
  department_id uuid not null references departments(id) on delete restrict,
  programme_id uuid references programmes(id) on delete set null,
  academic_year_id uuid not null references academic_years(id) on delete restrict,
  semester_id uuid not null references semesters(id) on delete restrict,

  examination_type examination_type not null,
  paper_type paper_type not null default 'THEORY',
  examination_date date,
  duration_minutes smallint check (duration_minutes is null or duration_minutes > 0),

  status paper_status not null default 'DRAFT',
  rejection_reason text,

  uploaded_by uuid not null references profiles(id) on delete restrict,
  verified_by uuid references profiles(id) on delete set null,

  -- File metadata. storage_path is a generated object key, never the
  -- user-supplied filename (see apps/api upload service).
  storage_path text not null,
  original_filename text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  mime_type text not null,
  checksum_sha256 text not null,
  page_count smallint,

  extracted_text text,
  search_vector tsvector,
  ocr_status ocr_status not null default 'NOT_REQUIRED',

  publication_date timestamptz,
  archive_date timestamptz,

  view_count integer not null default 0,
  download_count integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint examination_papers_checksum_len check (char_length(checksum_sha256) = 64)
);

create index idx_papers_course on examination_papers (course_id);
create index idx_papers_faculty on examination_papers (faculty_id);
create index idx_papers_department on examination_papers (department_id);
create index idx_papers_academic_year on examination_papers (academic_year_id);
create index idx_papers_semester on examination_papers (semester_id);
create index idx_papers_status on examination_papers (status);
create index idx_papers_uploaded_by on examination_papers (uploaded_by);
create index idx_papers_checksum on examination_papers (checksum_sha256);
create index idx_papers_search_vector on examination_papers using gin (search_vector);
-- Duplicate detection: same course + exam type + academic year + checksum.
create unique index uidx_papers_dedupe on examination_papers (course_id, examination_type, academic_year_id, checksum_sha256)
  where deleted_at is null;

create trigger trg_papers_updated_at
  before update on examination_papers for each row execute function set_updated_at();

create or replace function papers_search_vector_update()
returns trigger
language plpgsql
as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.extracted_text, '')), 'C');
  return new;
end;
$$;

create trigger trg_papers_search_vector
  before insert or update of title, extracted_text on examination_papers
  for each row execute function papers_search_vector_update();

-- ---------------------------------------------------------------------
-- Immutable history every time a paper's file is replaced.
-- ---------------------------------------------------------------------
create table paper_versions (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references examination_papers(id) on delete cascade,
  version_number smallint not null,
  storage_path text not null,
  file_size_bytes bigint not null,
  checksum_sha256 text not null,
  uploaded_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (paper_id, version_number)
);

create index idx_paper_versions_paper on paper_versions (paper_id);

-- ---------------------------------------------------------------------
-- Workflow transition history / review trail.
-- ---------------------------------------------------------------------
create table paper_reviews (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references examination_papers(id) on delete cascade,
  reviewer_id uuid not null references profiles(id),
  from_status paper_status not null,
  to_status paper_status not null,
  comment text,
  created_at timestamptz not null default now()
);

create index idx_paper_reviews_paper on paper_reviews (paper_id);

-- ---------------------------------------------------------------------
-- Free-form categorisation/tagging.
-- ---------------------------------------------------------------------
create table paper_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text
);

create table paper_category_links (
  paper_id uuid not null references examination_papers(id) on delete cascade,
  category_id uuid not null references paper_categories(id) on delete cascade,
  primary key (paper_id, category_id)
);

-- ---------------------------------------------------------------------
-- Engagement/analytics facts. Kept append-only and lightweight.
-- ---------------------------------------------------------------------
create table paper_downloads (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references examination_papers(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  downloaded_at timestamptz not null default now(),
  ip_address inet
);

create index idx_paper_downloads_paper on paper_downloads (paper_id);
create index idx_paper_downloads_user on paper_downloads (user_id);

create table paper_views (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references examination_papers(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  viewed_at timestamptz not null default now()
);

create index idx_paper_views_paper on paper_views (paper_id);
create index idx_paper_views_user on paper_views (user_id);
