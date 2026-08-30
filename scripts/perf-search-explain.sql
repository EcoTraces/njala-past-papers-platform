-- =====================================================================
-- Ad-hoc realistic-data-volume performance check for paper search/
-- browse (Loop 08). Not part of the automated CI suite - seeding 50k
-- rows on every push would be wasteful - run manually against a
-- database built by scripts/db-test-setup.sh:
--
--   bash scripts/db-test-setup.sh
--   psql -f scripts/perf-search-explain.sql
--
-- Wrapped in a transaction that rolls back at the end (like
-- supabase/tests/rls_rbac_assertions.sql), so it's safe to re-run
-- without leaving 50,000 rows of test data behind. See TESTING.md
-- "Realistic-data-volume performance testing" for what this caught
-- and how to read the output, and TASK.md "Findings from Loop 08" for
-- the full writeup.
-- =====================================================================

\timing on

begin;

-- A synthetic staff uploader for the bulk-generated papers, plus a
-- synthetic student to run the RLS-scoped EXPLAIN queries as (the
-- seed data has no student/staff profiles at all).
insert into auth.users (id) values
  ('90000000-0000-0000-0000-000000000001'),
  ('90000000-0000-0000-0000-000000000002');
insert into profiles (id, staff_id, full_name, status) values
  ('90000000-0000-0000-0000-000000000001', 'PERFSEED01', 'Perf Seed Uploader', 'ACTIVE');
insert into profiles (id, student_id, full_name, status) values
  ('90000000-0000-0000-0000-000000000002', 'PERFSEEDSTU01', 'Perf Seed Student', 'ACTIVE');
insert into user_roles (user_id, role_id)
  select '90000000-0000-0000-0000-000000000002', id from roles where name = 'STUDENT';

-- 50,000 papers, cycling through the seeded courses/faculties/
-- departments/academic-years/semesters, ~75% PUBLISHED (realistic:
-- most of an archive's content is already through review) with the
-- rest spread across the other workflow states, randomized
-- created_at over the past 3 years and randomized download/view
-- counts so ORDER BY created_at/download_count isn't trivially
-- pre-sorted, and roughly 1 in 8 papers mentioning a common exam term
-- in extracted_text so full-text search has a realistic hit rate
-- rather than matching everything or nothing.
insert into examination_papers (
  title, course_id, faculty_id, department_id, academic_year_id, semester_id,
  examination_type, status, uploaded_by, storage_path, original_filename,
  file_size_bytes, mime_type, checksum_sha256, extracted_text,
  view_count, download_count, created_at, publication_date
)
select
  'Perf Test Paper ' || g,
  c.id,
  c.faculty_id,
  c.department_id,
  ay.id,
  sem.id,
  (array['END_OF_SEMESTER','MID_SEMESTER','SUPPLEMENTARY','MOCK'])[1 + (g % 4)]::examination_type,
  (array['PUBLISHED','PUBLISHED','PUBLISHED','PUBLISHED','PUBLISHED','PUBLISHED','SUBMITTED','DRAFT'])[1 + (g % 8)]::paper_status,
  '90000000-0000-0000-0000-000000000001',
  'PERF/test/paper-' || g || '.pdf',
  'paper-' || g || '.pdf',
  1000 + (g % 5000),
  'application/pdf',
  encode(sha256(('perf-seed-' || g)::bytea), 'hex'),
  case when g % 8 = 0 then 'This paper covers algebra, calculus, and linear systems in depth for the final examination.' else 'Standard examination content covering the syllabus for this course and semester.' end,
  (g * 37) % 5000,
  (g * 13) % 2000,
  now() - ((g % 1095) || ' days')::interval,
  case when (g % 8) < 6 then now() - ((g % 1095) || ' days')::interval else null end
from generate_series(1, 50000) as g
join lateral (
  select co.id, d.faculty_id, co.department_id
  from courses co join departments d on d.id = co.department_id
  order by co.id offset (g % 4) limit 1
) c on true
join lateral (select id from academic_years order by id offset (g % 2) limit 1) ay on true
join lateral (select id from semesters order by id offset (g % 2) limit 1) sem on true;

analyze examination_papers;

select status, count(*) from examination_papers group by status order by count(*) desc;

\echo '=== EXPLAIN: default recent browse, unfiltered (as a STUDENT, via RLS) ==='
set role authenticated;
select set_config('request.jwt.claim.sub', '90000000-0000-0000-0000-000000000002', false);
explain (analyze, buffers, format text)
select id from examination_papers order by created_at desc limit 20;

\echo '=== EXPLAIN: popular browse, unfiltered (as a STUDENT, via RLS) ==='
explain (analyze, buffers, format text)
select id from examination_papers order by download_count desc limit 20;

\echo '=== EXPLAIN: filtered browse by course (as a STUDENT, via RLS) ==='
explain (analyze, buffers, format text)
select id from examination_papers where course_id = (select id from courses limit 1) order by created_at desc limit 20;

\echo '=== EXPLAIN: keyword search via the RPC, relevance-ranked (as a STUDENT, via RLS) ==='
explain (analyze, buffers, format text)
select * from search_examination_papers(p_query := 'algebra', p_status := 'PUBLISHED', p_limit := 20, p_offset := 0);

reset role;

rollback;
