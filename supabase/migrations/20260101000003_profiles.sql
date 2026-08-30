-- =====================================================================
-- Profiles: one row per Supabase Auth user, plus role assignment.
--
-- Students authenticate with a Student ID + password. Supabase Auth
-- requires an email-shaped identifier internally, so we synthesize one
-- server-side (see apps/api/src/services/auth.service.ts) of the form
-- "<normalized-student-id>@<STUDENT_AUTH_IDENTIFIER_DOMAIN>" and store
-- it only in auth.users, never expose it to the client, and never send
-- real mail to it. profiles.contact_email is a separate, optional,
-- real address used purely for notifications/password-reset and is
-- never used as a login identifier.
-- =====================================================================

create extension if not exists citext;

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,

  -- Identity
  student_id text unique,           -- normalized, e.g. "NJ2021CS0142"
  staff_id text unique,              -- for lecturer/library_staff/admin accounts
  full_name text not null,
  contact_email citext,
  phone text,
  avatar_url text,

  -- Academic context (nullable: staff/admin accounts won't set these)
  programme_id uuid,                 -- FK added after programmes exists
  department_id uuid,                -- FK added after departments exists
  entry_year smallint,

  status account_status not null default 'PENDING',
  failed_login_attempts smallint not null default 0,
  locked_until timestamptz,
  last_login_at timestamptz,

  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,

  constraint profiles_student_or_staff_id check (
    student_id is not null or staff_id is not null
  )
);

create index idx_profiles_student_id on profiles (student_id) where deleted_at is null;
create index idx_profiles_staff_id on profiles (staff_id) where deleted_at is null;
create index idx_profiles_status on profiles (status);

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- user_roles: many-to-many between profiles and roles.
-- Self-service sign-up only ever creates a STUDENT row here (enforced
-- in the API layer + a check trigger below). Privileged roles must be
-- granted by an ADMIN/SUPER_ADMIN through the admin API.
-- ---------------------------------------------------------------------

create table user_roles (
  user_id uuid not null references profiles(id) on delete cascade,
  role_id uuid not null references roles(id) on delete restrict,
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role_id)
);

create index idx_user_roles_user on user_roles (user_id);

-- Helper: does the currently authenticated user hold a given role?
-- SECURITY DEFINER so it can read user_roles even under a caller whose
-- own RLS policy on user_roles is restrictive; it never reads/returns
-- other users' rows, only checks the caller's own membership.
create or replace function auth_has_role(check_role app_role)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from user_roles ur
    join roles r on r.id = ur.role_id
    where ur.user_id = auth.uid() and r.name = check_role
  );
$$;

create or replace function auth_is_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from user_roles ur
    join roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.name in ('LECTURER', 'LIBRARY_STAFF', 'ADMIN', 'SUPER_ADMIN')
  );
$$;

create or replace function auth_is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from user_roles ur
    join roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and r.name in ('ADMIN', 'SUPER_ADMIN')
  );
$$;

-- Returns the caller's role names as a set, used by the API for JWT
-- claim enrichment and by policies that need to branch on more than
-- one role.
create or replace function auth_role_names()
returns setof app_role
language sql
security definer
set search_path = public
stable
as $$
  select r.name
  from user_roles ur
  join roles r on r.id = ur.role_id
  where ur.user_id = auth.uid();
$$;
