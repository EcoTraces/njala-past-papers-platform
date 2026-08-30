-- =====================================================================
-- Development/demo seed data. Safe to run repeatedly against a local
-- Supabase instance (supabase db reset runs this automatically).
-- Do NOT run against production.
-- =====================================================================

insert into faculties (id, name, code, description) values
  ('11111111-1111-1111-1111-111111111101', 'Faculty of Pure and Applied Sciences', 'FPAS', 'Sciences and technology'),
  ('11111111-1111-1111-1111-111111111102', 'Faculty of Social Sciences and Law', 'FSSL', 'Social sciences, law and public administration'),
  ('11111111-1111-1111-1111-111111111103', 'Faculty of Agriculture', 'FOA', 'Agriculture and food sciences')
on conflict (code) do nothing;

insert into departments (id, faculty_id, name, code) values
  ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111101', 'Department of Computer Science', 'CS'),
  ('22222222-2222-2222-2222-222222222202', '11111111-1111-1111-1111-111111111101', 'Department of Mathematics and Statistics', 'MATH'),
  ('22222222-2222-2222-2222-222222222203', '11111111-1111-1111-1111-111111111102', 'Department of Economics', 'ECON')
on conflict (faculty_id, code) do nothing;

insert into programmes (id, department_id, name, code, level, duration_years) values
  ('33333333-3333-3333-3333-333333333301', '22222222-2222-2222-2222-222222222201', 'BSc Computer Science', 'BSC-CS', 'UNDERGRADUATE', 4),
  ('33333333-3333-3333-3333-333333333302', '22222222-2222-2222-2222-222222222203', 'BSc Economics', 'BSC-ECON', 'UNDERGRADUATE', 4)
on conflict (department_id, code) do nothing;

insert into courses (id, department_id, programme_id, code, title, year_level, credit_units) values
  ('44444444-4444-4444-4444-444444444401', '22222222-2222-2222-2222-222222222201', '33333333-3333-3333-3333-333333333301', 'CSC101', 'Introduction to Computer Science', 1, 3),
  ('44444444-4444-4444-4444-444444444402', '22222222-2222-2222-2222-222222222201', '33333333-3333-3333-3333-333333333301', 'CSC201', 'Data Structures and Algorithms', 2, 4),
  ('44444444-4444-4444-4444-444444444403', '22222222-2222-2222-2222-222222222202', null, 'MTH101', 'Calculus I', 1, 3),
  ('44444444-4444-4444-4444-444444444404', '22222222-2222-2222-2222-222222222203', '33333333-3333-3333-3333-333333333302', 'ECN101', 'Principles of Microeconomics', 1, 3)
on conflict (code) do nothing;

insert into academic_years (id, name, start_date, end_date, is_current) values
  ('55555555-5555-5555-5555-555555555501', '2023/2024', '2023-10-01', '2024-07-31', false),
  ('55555555-5555-5555-5555-555555555502', '2024/2025', '2024-10-01', '2025-07-31', true)
on conflict (name) do nothing;

insert into semesters (id, academic_year_id, name, start_date, end_date, is_current) values
  ('66666666-6666-6666-6666-666666666601', '55555555-5555-5555-5555-555555555502', 'First', '2024-10-01', '2025-02-15', false),
  ('66666666-6666-6666-6666-666666666602', '55555555-5555-5555-5555-555555555502', 'Second', '2025-02-16', '2025-07-31', true)
on conflict (academic_year_id, name) do nothing;

insert into paper_categories (id, name, description) values
  ('77777777-7777-7777-7777-777777777701', 'Frequently Examined', 'Topics that recur across multiple academic years'),
  ('77777777-7777-7777-7777-777777777702', 'Revised Syllabus', 'Papers reflecting the current syllabus version')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- Bootstrapping the first SUPER_ADMIN account is intentionally NOT
-- automated here: self-registration can only ever create STUDENT
-- accounts (enforced by the API), and no privileged account should be
-- created by a script that ships in version control. See
-- docs/deployment/bootstrap-admin.md for the one-time manual step.
-- ---------------------------------------------------------------------
