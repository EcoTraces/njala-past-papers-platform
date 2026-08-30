-- =====================================================================
-- Academic structure: faculties, departments, programmes, courses,
-- academic years and semesters. Soft-deletable so historical papers
-- keep valid references even after a restructure.
-- =====================================================================

create table faculties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (code)
);

create trigger trg_faculties_updated_at
  before update on faculties for each row execute function set_updated_at();

create table departments (
  id uuid primary key default gen_random_uuid(),
  faculty_id uuid not null references faculties(id) on delete restrict,
  name text not null,
  code text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (faculty_id, code)
);

create index idx_departments_faculty on departments (faculty_id);
create trigger trg_departments_updated_at
  before update on departments for each row execute function set_updated_at();

create table programmes (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments(id) on delete restrict,
  name text not null,
  code text not null,
  level programme_level not null default 'UNDERGRADUATE',
  duration_years smallint not null default 4,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (department_id, code)
);

create index idx_programmes_department on programmes (department_id);
create trigger trg_programmes_updated_at
  before update on programmes for each row execute function set_updated_at();

create table courses (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments(id) on delete restrict,
  programme_id uuid references programmes(id) on delete set null,
  code text not null,
  title text not null,
  description text,
  year_level smallint check (year_level between 1 and 8),
  credit_units smallint check (credit_units > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (code)
);

create index idx_courses_department on courses (department_id);
create index idx_courses_programme on courses (programme_id);
create index idx_courses_search on courses using gin (
  to_tsvector('english', coalesce(code, '') || ' ' || coalesce(title, ''))
);
create trigger trg_courses_updated_at
  before update on courses for each row execute function set_updated_at();

-- Lecturers authorized to manage a given course. A lecturer may only
-- upload/manage papers for courses where a row exists here.
create table course_lecturers (
  course_id uuid not null references courses(id) on delete cascade,
  lecturer_id uuid not null references profiles(id) on delete cascade,
  assigned_by uuid references auth.users(id),
  assigned_at timestamptz not null default now(),
  primary key (course_id, lecturer_id)
);

create index idx_course_lecturers_lecturer on course_lecturers (lecturer_id);

create table academic_years (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, -- e.g. "2024/2025"
  start_date date not null,
  end_date date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  constraint academic_years_valid_range check (end_date > start_date)
);

-- Only one academic year may be "current" at a time.
create unique index uidx_academic_years_current on academic_years (is_current) where is_current;

create table semesters (
  id uuid primary key default gen_random_uuid(),
  academic_year_id uuid not null references academic_years(id) on delete cascade,
  name text not null, -- "First", "Second", "Summer"
  start_date date not null,
  end_date date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  unique (academic_year_id, name),
  constraint semesters_valid_range check (end_date > start_date)
);

create index idx_semesters_year on semesters (academic_year_id);

-- Now that programmes/departments exist, wire the deferred FKs on profiles.
alter table profiles
  add constraint profiles_programme_fk foreign key (programme_id) references programmes(id) on delete set null,
  add constraint profiles_department_fk foreign key (department_id) references departments(id) on delete set null;
