-- =====================================================================
-- Roles, permissions and role-permission mapping
-- Role membership itself lives on user_roles (many-to-many) so a user
-- can, in principle, hold more than one role; the API and RLS helpers
-- treat the highest-privilege assigned role as authoritative for
-- coarse-grained checks and consult role_permissions for fine-grained
-- ones.
-- =====================================================================

create table roles (
  id uuid primary key default gen_random_uuid(),
  name app_role not null unique,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- profiles.id references auth.users(id); declared after profiles exists,
-- so user_roles is created in the profiles migration instead to avoid a
-- forward reference. This file only seeds the role/permission catalogue.

insert into roles (name, description) values
  ('STUDENT', 'University student who can search, view and practice with approved papers'),
  ('LECTURER', 'Academic staff who can upload and manage papers/questions for their courses'),
  ('LIBRARY_STAFF', 'Library staff who verify, approve and catalogue examination papers'),
  ('ADMIN', 'Institutional administrator managing users, academic structure and content'),
  ('SUPER_ADMIN', 'Unrestricted platform administrator');

insert into permissions (code, description) values
  ('papers.read.published', 'View published/approved papers'),
  ('papers.read.any', 'View papers in any workflow state'),
  ('papers.upload', 'Upload new examination papers'),
  ('papers.submit', 'Submit a draft paper for review'),
  ('papers.review', 'Move papers through the review workflow'),
  ('papers.approve', 'Approve a paper for publication'),
  ('papers.reject', 'Reject a submitted paper'),
  ('papers.archive', 'Archive a published paper'),
  ('papers.delete', 'Permanently remove a paper'),
  ('papers.manage.own_courses', 'Manage papers tied to courses the user is authorized on'),
  ('questions.read', 'View question bank entries'),
  ('questions.create', 'Create new question bank entries'),
  ('questions.verify', 'Verify or reject submitted questions'),
  ('practice.attempt', 'Start and submit practice sessions'),
  ('users.manage', 'Create, update, suspend and assign roles to users'),
  ('academic_structure.manage', 'Manage faculties, departments, programmes, courses'),
  ('academic_calendar.manage', 'Manage academic years and semesters'),
  ('audit_logs.read', 'Read audit log records'),
  ('analytics.read', 'Read system-wide analytics'),
  ('system_settings.manage', 'Change system configuration');

-- Wire permissions to roles.
with rp as (
  select r.id as role_id, p.id as permission_id, r.name as role_name, p.code as perm_code
  from roles r cross join permissions p
)
insert into role_permissions (role_id, permission_id)
select role_id, permission_id from rp where
  (role_name = 'STUDENT' and perm_code in ('papers.read.published', 'practice.attempt', 'questions.read'))
  or (role_name = 'LECTURER' and perm_code in (
    'papers.read.published', 'papers.read.any', 'papers.upload', 'papers.submit',
    'papers.manage.own_courses', 'questions.read', 'questions.create', 'practice.attempt'
  ))
  or (role_name = 'LIBRARY_STAFF' and perm_code in (
    'papers.read.published', 'papers.read.any', 'papers.upload', 'papers.submit',
    'papers.review', 'papers.approve', 'papers.reject', 'papers.archive',
    'questions.read', 'questions.verify', 'audit_logs.read'
  ))
  or (role_name = 'ADMIN' and perm_code in (
    'papers.read.published', 'papers.read.any', 'papers.upload', 'papers.submit',
    'papers.review', 'papers.approve', 'papers.reject', 'papers.archive', 'papers.delete',
    'questions.read', 'questions.create', 'questions.verify',
    'users.manage', 'academic_structure.manage', 'academic_calendar.manage',
    'audit_logs.read', 'analytics.read', 'system_settings.manage'
  ))
  or (role_name = 'SUPER_ADMIN');

-- SUPER_ADMIN gets every permission explicitly (unrestricted).
insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r cross join permissions p
where r.name = 'SUPER_ADMIN'
on conflict do nothing;
