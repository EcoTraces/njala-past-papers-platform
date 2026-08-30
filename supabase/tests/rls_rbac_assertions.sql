-- =====================================================================
-- RLS/RBAC assertions run against the stub Supabase-shaped database
-- built by scripts/db-test-setup.sh. Executed as the postgres
-- superuser; each scenario switches to the `authenticated` or `anon`
-- role via SET ROLE and simulates a specific logged-in user via the
-- request.jwt.claim.sub GUC, exactly mirroring how PostgREST/Supabase
-- populates that claim from a verified JWT. A failed assertion RAISEs
-- and aborts the script (psql runs with ON_ERROR_STOP=1), which fails
-- the CI job.
--
-- This directly exercises the scenarios called out in the project
-- brief: a student cannot reach admin-only data or escalate their own
-- role; a lecturer cannot approve papers outside their authority;
-- library staff can drive the review workflow; an admin can manage
-- users but not silently mint another SUPER_ADMIN; a student only ever
-- sees published papers, never another student's practice attempts or
-- any answer key.
-- =====================================================================

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------
-- Fixtures (as postgres superuser - RLS does not apply)
-- ---------------------------------------------------------------------
insert into auth.users (id) values
  ('10000000-0000-0000-0000-000000000001'), -- student1
  ('10000000-0000-0000-0000-000000000002'), -- student2 (IDOR victim)
  ('20000000-0000-0000-0000-000000000001'), -- lecturer1 (assigned to CSC101)
  ('20000000-0000-0000-0000-000000000002'), -- lecturer2 (NOT assigned to CSC101)
  ('30000000-0000-0000-0000-000000000001'), -- library1
  ('40000000-0000-0000-0000-000000000001'); -- admin1

insert into profiles (id, student_id, full_name, status) values
  ('10000000-0000-0000-0000-000000000001', 'NJTEST0001', 'Test Student One', 'ACTIVE'),
  ('10000000-0000-0000-0000-000000000002', 'NJTEST0002', 'Test Student Two', 'ACTIVE');
insert into profiles (id, staff_id, full_name, status) values
  ('20000000-0000-0000-0000-000000000001', 'STF0001', 'Test Lecturer One', 'ACTIVE'),
  ('20000000-0000-0000-0000-000000000002', 'STF0002', 'Test Lecturer Two', 'ACTIVE'),
  ('30000000-0000-0000-0000-000000000001', 'STF0003', 'Test Library Staff', 'ACTIVE'),
  ('40000000-0000-0000-0000-000000000001', 'STF0004', 'Test Admin', 'ACTIVE');

insert into user_roles (user_id, role_id)
select u.id, r.id from (values
  ('10000000-0000-0000-0000-000000000001'::uuid, 'STUDENT'),
  ('10000000-0000-0000-0000-000000000002'::uuid, 'STUDENT'),
  ('20000000-0000-0000-0000-000000000001'::uuid, 'LECTURER'),
  ('20000000-0000-0000-0000-000000000002'::uuid, 'LECTURER'),
  ('30000000-0000-0000-0000-000000000001'::uuid, 'LIBRARY_STAFF'),
  ('40000000-0000-0000-0000-000000000001'::uuid, 'ADMIN')
) as u(id, role_name)
join roles r on r.name = u.role_name::app_role;

-- Only lecturer1 is authorized on CSC101 (44444444-4444-4444-4444-444444444401).
insert into course_lecturers (course_id, lecturer_id) values
  ('44444444-4444-4444-4444-444444444401', '20000000-0000-0000-0000-000000000001');

insert into examination_papers (
  id, title, course_id, faculty_id, department_id, academic_year_id, semester_id,
  examination_type, status, uploaded_by, storage_path, original_filename,
  file_size_bytes, mime_type, checksum_sha256
) values
  ('a1000000-0000-0000-0000-000000000001', 'Draft paper', '44444444-4444-4444-4444-444444444401',
   '11111111-1111-1111-1111-111111111101', '22222222-2222-2222-2222-222222222201',
   '55555555-5555-5555-5555-555555555502', '66666666-6666-6666-6666-666666666601',
   'END_OF_SEMESTER', 'DRAFT', '20000000-0000-0000-0000-000000000001',
   'CSC101/test/draft.pdf', 'draft.pdf', 1000, 'application/pdf', repeat('a', 64)),
  ('a1000000-0000-0000-0000-000000000002', 'Published paper', '44444444-4444-4444-4444-444444444401',
   '11111111-1111-1111-1111-111111111101', '22222222-2222-2222-2222-222222222201',
   '55555555-5555-5555-5555-555555555502', '66666666-6666-6666-6666-666666666601',
   'END_OF_SEMESTER', 'PUBLISHED', '20000000-0000-0000-0000-000000000001',
   'CSC101/test/published.pdf', 'published.pdf', 1000, 'application/pdf', repeat('b', 64)),
  ('a1000000-0000-0000-0000-000000000003', 'Submitted paper', '44444444-4444-4444-4444-444444444401',
   '11111111-1111-1111-1111-111111111101', '22222222-2222-2222-2222-222222222201',
   '55555555-5555-5555-5555-555555555502', '66666666-6666-6666-6666-666666666601',
   'END_OF_SEMESTER', 'SUBMITTED', '20000000-0000-0000-0000-000000000001',
   'CSC101/test/submitted.pdf', 'submitted.pdf', 1000, 'application/pdf', repeat('c', 64)),
  ('a1000000-0000-0000-0000-000000000004', 'Under review paper', '44444444-4444-4444-4444-444444444401',
   '11111111-1111-1111-1111-111111111101', '22222222-2222-2222-2222-222222222201',
   '55555555-5555-5555-5555-555555555502', '66666666-6666-6666-6666-666666666601',
   'END_OF_SEMESTER', 'UNDER_REVIEW', '20000000-0000-0000-0000-000000000001',
   'CSC101/test/review.pdf', 'review.pdf', 1000, 'application/pdf', repeat('d', 64));

insert into questions (id, course_id, question_text, question_type, marks, author_id, verification_status) values
  ('b1000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444401', 'Compute 6 * 7', 'NUMERICAL', 5,
   '20000000-0000-0000-0000-000000000001', 'VERIFIED');
insert into answer_keys (question_id, correct_answer_text, created_by) values
  ('b1000000-0000-0000-0000-000000000001', '42', '20000000-0000-0000-0000-000000000001');

insert into practice_sessions (id, user_id, course_id, total_questions, total_marks) values
  ('c1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444401', 0, 0),
  ('c1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444401', 0, 0);

insert into audit_logs (actor_id, action, entity_type) values
  ('40000000-0000-0000-0000-000000000001', 'test.fixture', 'examination_papers');

-- ---------------------------------------------------------------------
-- Scenario 1: Student only ever sees PUBLISHED papers.
-- ---------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);

do $$
declare visible_count int;
begin
  select count(*) into visible_count from examination_papers
    where id in (
      'a1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002',
      'a1000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000004'
    );
  if visible_count <> 1 then
    raise exception 'FAIL: student should see exactly 1 (published) of 4 test papers, saw %', visible_count;
  end if;
  raise notice 'PASS: student sees only the published paper';
end;
$$;

-- ---------------------------------------------------------------------
-- Scenario 2: Student cannot read audit logs (admin-only surface).
-- ---------------------------------------------------------------------
do $$
declare visible_count int;
begin
  select count(*) into visible_count from audit_logs;
  if visible_count <> 0 then
    raise exception 'FAIL: student should not be able to read any audit_logs rows, saw %', visible_count;
  end if;
  raise notice 'PASS: student cannot read audit logs';
end;
$$;

-- ---------------------------------------------------------------------
-- Scenario 3: Student cannot read another student's practice session
-- (IDOR check).
-- ---------------------------------------------------------------------
do $$
declare visible_count int;
begin
  select count(*) into visible_count from practice_sessions where id = 'c1000000-0000-0000-0000-000000000002';
  if visible_count <> 0 then
    raise exception 'FAIL: student should not see another student''s practice session';
  end if;
  raise notice 'PASS: student cannot read another student''s practice session';
end;
$$;

-- ---------------------------------------------------------------------
-- Scenario 4: Student cannot read an answer key.
-- ---------------------------------------------------------------------
do $$
declare visible_count int;
begin
  select count(*) into visible_count from answer_keys where question_id = 'b1000000-0000-0000-0000-000000000001';
  if visible_count <> 0 then
    raise exception 'FAIL: student should never be able to read answer_keys';
  end if;
  raise notice 'PASS: student cannot read answer keys';
end;
$$;

-- ---------------------------------------------------------------------
-- Scenario 5: Student cannot escalate their own role to ADMIN.
-- ---------------------------------------------------------------------
do $$
begin
  begin
    insert into user_roles (user_id, role_id)
      values ('10000000-0000-0000-0000-000000000001', (select id from roles where name = 'ADMIN'));
    raise exception 'FAIL: student was able to grant themselves ADMIN';
  exception when insufficient_privilege then
    raise notice 'PASS: student cannot self-grant ADMIN (blocked by RLS)';
  end;
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- Scenario 6: Lecturer sees drafts/submissions for their own course,
-- including papers they did not personally upload as long as they are
-- assigned to the course.
-- ---------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', false);

do $$
declare visible_count int;
begin
  select count(*) into visible_count from examination_papers where course_id = '44444444-4444-4444-4444-444444444401';
  if visible_count <> 4 then
    raise exception 'FAIL: lecturer assigned to the course should see all 4 test papers, saw %', visible_count;
  end if;
  raise notice 'PASS: lecturer sees all papers for their own course';
end;
$$;

-- ---------------------------------------------------------------------
-- Scenario 7: Lecturer cannot approve/move a paper out of UNDER_REVIEW
-- (papers.approve is a LIBRARY_STAFF/ADMIN action).
-- ---------------------------------------------------------------------
do $$
declare affected int;
begin
  update examination_papers set status = 'APPROVED' where id = 'a1000000-0000-0000-0000-000000000004';
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'FAIL: a LECTURER was able to approve a paper (% rows updated)', affected;
  end if;
  raise notice 'PASS: lecturer cannot approve a paper under review';
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- Scenario 8: A different lecturer, NOT assigned to the course, only
-- sees the published paper - not the draft/submitted/under-review ones
-- they didn't upload either.
-- ---------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', false);

do $$
declare visible_count int;
begin
  select count(*) into visible_count from examination_papers where course_id = '44444444-4444-4444-4444-444444444401';
  if visible_count <> 1 then
    raise exception 'FAIL: an unrelated lecturer should see only the published paper, saw %', visible_count;
  end if;
  raise notice 'PASS: lecturer not on the course sees only the published paper';
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- Scenario 9: Library staff CAN move SUBMITTED -> UNDER_REVIEW
-- (papers.review authority).
-- ---------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', false);

do $$
declare affected int;
begin
  update examination_papers set status = 'UNDER_REVIEW' where id = 'a1000000-0000-0000-0000-000000000003';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'FAIL: library staff should be able to move a submitted paper into review, affected %', affected;
  end if;
  raise notice 'PASS: library staff can advance the review workflow';
end;
$$;

do $$
declare visible_count int;
begin
  select count(*) into visible_count from audit_logs;
  if visible_count < 1 then
    raise exception 'FAIL: library staff should be able to read audit logs';
  end if;
  raise notice 'PASS: library staff can read audit logs';
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- Scenario 10: Admin can grant an ordinary role (users.manage), but a
-- non-SUPER_ADMIN admin cannot mint another SUPER_ADMIN.
-- ---------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-0000-0000-000000000001', false);

do $$
declare affected int;
begin
  insert into user_roles (user_id, role_id)
    values ('10000000-0000-0000-0000-000000000002', (select id from roles where name = 'LIBRARY_STAFF'));
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'FAIL: admin should be able to grant an ordinary role';
  end if;
  raise notice 'PASS: admin can grant an ordinary role';
end;
$$;

do $$
begin
  begin
    insert into user_roles (user_id, role_id)
      values ('20000000-0000-0000-0000-000000000002', (select id from roles where name = 'SUPER_ADMIN'));
    raise exception 'FAIL: a plain ADMIN was able to grant SUPER_ADMIN';
  exception when insufficient_privilege then
    raise notice 'PASS: a plain ADMIN cannot grant SUPER_ADMIN (privilege escalation blocked)';
  end;
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- Scenario 11: Anonymous (no session at all) can see published papers
-- but nothing in draft/review.
-- ---------------------------------------------------------------------
set role anon;
select set_config('request.jwt.claim.sub', '', false);

do $$
declare published_count int;
declare draft_count int;
begin
  select count(*) into published_count from examination_papers where id = 'a1000000-0000-0000-0000-000000000002';
  select count(*) into draft_count from examination_papers where id = 'a1000000-0000-0000-0000-000000000001';
  if published_count <> 1 or draft_count <> 0 then
    raise exception 'FAIL: anonymous visibility incorrect (published=%, draft=%)', published_count, draft_count;
  end if;
  raise notice 'PASS: anonymous users see only published papers';
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- Scenario 12: unauthorized storage access. Direct storage.objects
-- visibility must mirror examination_papers visibility - a student
-- reading the Storage API directly (bypassing the API's signed-URL
-- flow) must still only ever see the published paper's object, never
-- the draft's, even though both objects live in the same bucket.
-- ---------------------------------------------------------------------
insert into storage.objects (bucket_id, name) values
  ('examination-papers', 'CSC101/test/draft.pdf'),
  ('examination-papers', 'CSC101/test/published.pdf');

set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);

do $$
declare published_count int;
declare draft_count int;
begin
  select count(*) into published_count from storage.objects where name = 'CSC101/test/published.pdf';
  select count(*) into draft_count from storage.objects where name = 'CSC101/test/draft.pdf';
  if published_count <> 1 or draft_count <> 0 then
    raise exception 'FAIL: student storage.objects visibility incorrect (published=%, draft=%)', published_count, draft_count;
  end if;
  raise notice 'PASS: student can read the published paper''s storage object but not the draft''s';
end;
$$;

-- No client role - not even staff - has an INSERT/UPDATE/DELETE
-- policy on storage.objects at all (uploads go through the API's
-- service-role client only, see SECURITY.md). Prove a STUDENT can't
-- write, then prove LIBRARY_STAFF can't either - the absence of a
-- policy should block everyone identically.
do $$
begin
  begin
    insert into storage.objects (bucket_id, name) values ('examination-papers', 'CSC101/test/student-uploaded.pdf');
    raise exception 'FAIL: a STUDENT was able to insert a storage.objects row directly';
  exception when insufficient_privilege then
    raise notice 'PASS: student cannot write to storage.objects directly';
  end;
end;
$$;

reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', false);

do $$
begin
  begin
    insert into storage.objects (bucket_id, name) values ('examination-papers', 'CSC101/test/staff-uploaded.pdf');
    raise exception 'FAIL: LIBRARY_STAFF was able to insert a storage.objects row directly (uploads must go through the service-role client only)';
  exception when insufficient_privilege then
    raise notice 'PASS: library staff cannot write to storage.objects directly either - uploads are API/service-role only';
  end;
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- Scenario 13: lecturer ownership cannot be self-granted. A lecturer
-- with no course_lecturers row for a course must not be able to
-- create one for themselves (which would otherwise let them upload/
-- manage papers for a course they were never assigned to).
-- ---------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', false);

do $$
begin
  begin
    insert into course_lecturers (course_id, lecturer_id)
      values ('44444444-4444-4444-4444-444444444401', '20000000-0000-0000-0000-000000000002');
    raise exception 'FAIL: a lecturer was able to self-assign ownership of a course';
  exception when insufficient_privilege then
    raise notice 'PASS: a lecturer cannot self-assign course ownership (course_lecturers is admin-write only)';
  end;
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- Scenario 14: manipulated request parameters - a lecturer cannot
-- reassign a paper's uploaded_by to someone else via UPDATE (a classic
-- mass-assignment/IDOR-via-update vector), even for their own draft.
-- ---------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', false);

do $$
begin
  begin
    update examination_papers
      set uploaded_by = '20000000-0000-0000-0000-000000000002'
      where id = 'a1000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: a lecturer was able to reassign a paper''s uploaded_by to another user';
  exception when insufficient_privilege then
    raise notice 'PASS: a lecturer cannot reassign uploaded_by on their own draft paper';
  end;
end;
$$;

reset role;

rollback;

\echo 'All RLS/RBAC assertions passed.'
