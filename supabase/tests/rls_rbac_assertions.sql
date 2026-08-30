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
   '20000000-0000-0000-0000-000000000001', 'VERIFIED'),
  ('b1000000-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444401', 'Which is prime?', 'MULTIPLE_CHOICE', 5,
   '20000000-0000-0000-0000-000000000001', 'VERIFIED'),
  ('b1000000-0000-0000-0000-000000000003', '44444444-4444-4444-4444-444444444401', 'Explain recursion.', 'ESSAY', 20,
   '20000000-0000-0000-0000-000000000001', 'VERIFIED'),
  -- Deliberately NOT part of any practice_session_questions snapshot
  -- below - used by scenario 22 to prove a student can't answer a
  -- question outside their session's snapshot and have it count.
  ('b1000000-0000-0000-0000-000000000004', '44444444-4444-4444-4444-444444444401', 'Outside the snapshot', 'MULTIPLE_CHOICE', 50,
   '20000000-0000-0000-0000-000000000001', 'VERIFIED');
insert into answer_keys (question_id, correct_answer_text, created_by) values
  ('b1000000-0000-0000-0000-000000000001', '42', '20000000-0000-0000-0000-000000000001');
insert into question_options (id, question_id, option_label, option_text, is_correct, order_index) values
  ('b2000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'A', '4', false, 0),
  ('b2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000002', 'B', '7', true, 1),
  ('b2000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000004', 'A', 'right', true, 0);

insert into practice_sessions (id, user_id, course_id, total_questions, total_marks) values
  ('c1000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444401', 3, 30),
  ('c1000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444401', 0, 0);
-- Student1's session snapshot: the NUMERICAL, MULTIPLE_CHOICE, and
-- ESSAY questions above - deliberately NOT the "outside the snapshot"
-- one.
insert into practice_session_questions (session_id, question_id, order_index) values
  ('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 0),
  ('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 1),
  ('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 2);

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

-- ---------------------------------------------------------------------
-- Scenario 15: duplicate-content detection is a database constraint,
-- not just application logic - inserting a second paper for the same
-- course + examination type + academic year with an IDENTICAL checksum
-- must fail with a unique_violation, even for a role (library staff)
-- that otherwise has full insert authority. Uses the real SHA-256 of
-- apps/api/test-fixtures/sample-exam-paper.pdf (computed by both
-- Node's createHash('sha256') and the OS sha256sum tool - see
-- storage.service.real-files.test.ts) rather than a synthetic value,
-- so this proves the exact hash a real re-upload would produce is what
-- the constraint actually keys on.
-- ---------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', false);

do $$
declare affected int;
begin
  insert into examination_papers (
    title, course_id, faculty_id, department_id, academic_year_id, semester_id,
    examination_type, status, uploaded_by, storage_path, original_filename,
    file_size_bytes, mime_type, checksum_sha256
  ) values (
    'Genuinely new content (real PDF checksum)', '44444444-4444-4444-4444-444444444401',
    '11111111-1111-1111-1111-111111111101', '22222222-2222-2222-2222-222222222201',
    '55555555-5555-5555-5555-555555555502', '66666666-6666-6666-6666-666666666601',
    'END_OF_SEMESTER', 'DRAFT', '30000000-0000-0000-0000-000000000001',
    'CSC101/test/genuine.pdf', 'genuine.pdf', 1204, 'application/pdf',
    'e8b3fc0917e8de47e3181e121f3d2c70ee24ceeea11508e9ca015631b746129b'
  );
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'FAIL: control insert with a fresh, real-file checksum should have succeeded';
  end if;
  raise notice 'PASS: control insert with a fresh checksum did not collide (sanity check for the collision test below)';
end;
$$;

-- Now actually collide: same course/type/year, but the same checksum
-- as an already-inserted paper (repeat('a', 64), paper a1...001 above).
do $$
begin
  begin
    insert into examination_papers (
      title, course_id, faculty_id, department_id, academic_year_id, semester_id,
      examination_type, status, uploaded_by, storage_path, original_filename,
      file_size_bytes, mime_type, checksum_sha256
    ) values (
      'Re-upload of the draft paper''s exact content', '44444444-4444-4444-4444-444444444401',
      '11111111-1111-1111-1111-111111111101', '22222222-2222-2222-2222-222222222201',
      '55555555-5555-5555-5555-555555555502', '66666666-6666-6666-6666-666666666601',
      'END_OF_SEMESTER', 'DRAFT', '30000000-0000-0000-0000-000000000001',
      'CSC101/test/reupload.pdf', 'reupload.pdf', 1000, 'application/pdf', repeat('a', 64)
    );
    raise exception 'FAIL: uidx_papers_dedupe did not block an identical-checksum re-upload for the same course/type/year';
  exception when unique_violation then
    raise notice 'PASS: uidx_papers_dedupe blocks a duplicate-content upload for the same course/examination-type/academic-year';
  end;
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- Scenario 16: paper_versions visibility mirrors the paper it archives
-- history for - the owner and staff can see it, an unrelated lecturer
-- (not staff, not the uploader, not even assigned to the course) can't,
-- even when they already know a version row's paper_id (an IDOR probe
-- via a manually-supplied/guessed paper_id, not just the UI's own
-- links).
-- ---------------------------------------------------------------------
insert into paper_versions (paper_id, version_number, storage_path, file_size_bytes, checksum_sha256, uploaded_by) values
  ('a1000000-0000-0000-0000-000000000001', 1, 'CSC101/test/draft-v1-superseded.pdf', 900, repeat('e', 64), '20000000-0000-0000-0000-000000000001');

set role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', false);

do $$
declare visible_count int;
begin
  select count(*) into visible_count from paper_versions where paper_id = 'a1000000-0000-0000-0000-000000000001';
  if visible_count <> 1 then
    raise exception 'FAIL: the paper''s own uploader should see its version history, saw %', visible_count;
  end if;
  raise notice 'PASS: a paper''s uploader can see its version history';
end;
$$;

reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);

do $$
declare visible_count int;
begin
  select count(*) into visible_count from paper_versions where paper_id = 'a1000000-0000-0000-0000-000000000001';
  if visible_count <> 0 then
    raise exception 'FAIL: a STUDENT manually supplying another user''s paper_id should see 0 version rows, saw %', visible_count;
  end if;
  raise notice 'PASS: a student cannot read version history via a manually-supplied paper_id (IDOR blocked)';
end;
$$;

reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', false);

do $$
declare visible_count int;
begin
  select count(*) into visible_count from paper_versions where paper_id = 'a1000000-0000-0000-0000-000000000001';
  if visible_count <> 1 then
    raise exception 'FAIL: library staff should see version history for any paper, saw %', visible_count;
  end if;
  raise notice 'PASS: library staff can read version history for any paper';
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- Scenario 17: paper_versions insert authority - only the paper's own
-- uploader (while archiving their own replaced file) or staff may
-- insert a version row for it; an unrelated lecturer manually posting
-- a version row against someone else's paper_id (again, an IDOR-style
-- probe - guessing/reusing a paper_id that isn't theirs) must be
-- blocked by RLS regardless of the row's uploaded_by value.
-- ---------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', false);

do $$
begin
  begin
    insert into paper_versions (paper_id, version_number, storage_path, file_size_bytes, checksum_sha256, uploaded_by)
      values ('a1000000-0000-0000-0000-000000000001', 2, 'CSC101/test/forged-version.pdf', 800, repeat('f', 64), '20000000-0000-0000-0000-000000000002');
    raise exception 'FAIL: an unrelated lecturer was able to insert a paper_versions row for a paper they neither own nor administer';
  exception when insufficient_privilege then
    raise notice 'PASS: an unrelated lecturer cannot insert a version row for someone else''s paper (IDOR-via-manipulated-paper_id blocked)';
  end;
end;
$$;

reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', false);

do $$
declare affected int;
begin
  insert into paper_versions (paper_id, version_number, storage_path, file_size_bytes, checksum_sha256, uploaded_by)
    values ('a1000000-0000-0000-0000-000000000001', 2, 'CSC101/test/draft-v2-superseded.pdf', 950, repeat('g', 64), '20000000-0000-0000-0000-000000000001');
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'FAIL: the paper''s own uploader should be able to archive its own superseded version';
  end if;
  raise notice 'PASS: a paper''s own uploader can archive its own superseded version';
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- Scenario 18: manipulated storage path - a student who edits a
-- signed-download response client-side (or simply guesses a plausible
-- object key for a paper they can't see) still cannot read that
-- object's row directly from storage.objects, mirroring scenario 12
-- but specifically for a version-history object (superseded files are
-- never re-exposed once replaced, even to someone who already knows
-- the exact historical path).
-- ---------------------------------------------------------------------
insert into storage.objects (bucket_id, name) values
  ('examination-papers', 'CSC101/test/draft-v1-superseded.pdf');

set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);

do $$
declare visible_count int;
begin
  select count(*) into visible_count from storage.objects where name = 'CSC101/test/draft-v1-superseded.pdf';
  if visible_count <> 0 then
    raise exception 'FAIL: a student who guesses/knows a superseded version''s exact storage path should still see 0 rows, saw %', visible_count;
  end if;
  raise notice 'PASS: a manually-guessed superseded-version storage path is not visible to a student';
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- Scenario 19 (Loop 08): search_examination_papers() ranks a title
-- match above an extracted-text-only match for the same term, and
-- excludes non-matching papers entirely rather than just ranking them
-- last - proving the relevance-ranking RPC actually works, not just
-- that it runs without error.
-- ---------------------------------------------------------------------
insert into examination_papers (
  id, title, course_id, faculty_id, department_id, academic_year_id, semester_id,
  examination_type, status, uploaded_by, storage_path, original_filename,
  file_size_bytes, mime_type, checksum_sha256, extracted_text
) values
  ('a1000000-0000-0000-0000-000000000005', 'Thermodynamics Past Paper', '44444444-4444-4444-4444-444444444401',
   '11111111-1111-1111-1111-111111111101', '22222222-2222-2222-2222-222222222201',
   '55555555-5555-5555-5555-555555555502', '66666666-6666-6666-6666-666666666601',
   'END_OF_SEMESTER', 'PUBLISHED', '20000000-0000-0000-0000-000000000001',
   'CSC101/test/rank-title-match.pdf', 'rank-title-match.pdf', 1000, 'application/pdf', repeat('h', 64), null),
  ('a1000000-0000-0000-0000-000000000006', 'General Physics Exam', '44444444-4444-4444-4444-444444444401',
   '11111111-1111-1111-1111-111111111101', '22222222-2222-2222-2222-222222222201',
   '55555555-5555-5555-5555-555555555502', '66666666-6666-6666-6666-666666666601',
   'END_OF_SEMESTER', 'PUBLISHED', '20000000-0000-0000-0000-000000000001',
   'CSC101/test/rank-text-match.pdf', 'rank-text-match.pdf', 1000, 'application/pdf', repeat('i', 64),
   'This exam covers various physics topics including thermodynamics in question 3.'),
  ('a1000000-0000-0000-0000-000000000007', 'Unrelated Chemistry Paper', '44444444-4444-4444-4444-444444444401',
   '11111111-1111-1111-1111-111111111101', '22222222-2222-2222-2222-222222222201',
   '55555555-5555-5555-5555-555555555502', '66666666-6666-6666-6666-666666666601',
   'END_OF_SEMESTER', 'PUBLISHED', '20000000-0000-0000-0000-000000000001',
   'CSC101/test/rank-no-match.pdf', 'rank-no-match.pdf', 1000, 'application/pdf', repeat('j', 64), 'Nothing to do with the search term at all.');

set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);

do $$
declare
  first_id uuid;
  second_id uuid;
  match_count int;
begin
  select count(*) into match_count from search_examination_papers(p_query := 'thermodynamics', p_course_id := '44444444-4444-4444-4444-444444444401');
  if match_count <> 2 then
    raise exception 'FAIL: expected exactly 2 papers to match "thermodynamics" (title + extracted-text matches only, not the unrelated one), got %', match_count;
  end if;

  select id into first_id from search_examination_papers(p_query := 'thermodynamics', p_course_id := '44444444-4444-4444-4444-444444444401') order by rank desc limit 1 offset 0;
  select id into second_id from search_examination_papers(p_query := 'thermodynamics', p_course_id := '44444444-4444-4444-4444-444444444401') order by rank desc limit 1 offset 1;

  if first_id <> 'a1000000-0000-0000-0000-000000000005' then
    raise exception 'FAIL: the title match should rank first (weight A beats weight C), got % first', first_id;
  end if;
  if second_id <> 'a1000000-0000-0000-0000-000000000006' then
    raise exception 'FAIL: the extracted-text match should rank second, got % second', second_id;
  end if;
  raise notice 'PASS: search_examination_papers() ranks a title match above an extracted-text-only match and excludes non-matches entirely';
end;
$$;

do $$
declare reported_total bigint;
begin
  select total_count into reported_total from search_examination_papers(p_query := 'thermodynamics', p_course_id := '44444444-4444-4444-4444-444444444401', p_limit := 1) limit 1;
  if reported_total <> 2 then
    raise exception 'FAIL: total_count should reflect the true match count (2) even when p_limit caps the returned rows to 1, got %', reported_total;
  end if;
  raise notice 'PASS: search_examination_papers() total_count is correct independent of pagination limit';
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- Scenario 20 (Loop 08): search_examination_papers() is SECURITY
-- INVOKER, not DEFINER - RLS still governs visibility even though the
-- caller can pass an explicit status filter directly. A student
-- cannot use the search RPC to enumerate DRAFT papers just because
-- they know how to ask for them.
-- ---------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);

do $$
declare visible_count int;
begin
  select count(*) into visible_count from search_examination_papers(p_status := 'DRAFT', p_course_id := '44444444-4444-4444-4444-444444444401');
  if visible_count <> 0 then
    raise exception 'FAIL: a student explicitly requesting status=DRAFT via the search RPC should still see 0 rows (RLS-blocked), saw %', visible_count;
  end if;
  raise notice 'PASS: the search RPC does not let a student bypass RLS by asking for DRAFT papers directly';
end;
$$;

reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', false);

do $$
declare visible_count int;
begin
  select count(*) into visible_count from search_examination_papers(p_status := 'DRAFT', p_course_id := '44444444-4444-4444-4444-444444444401');
  if visible_count < 1 then
    raise exception 'FAIL: the paper''s own uploader/course lecturer should still see their DRAFT paper via the search RPC, saw %', visible_count;
  end if;
  raise notice 'PASS: the search RPC still surfaces a DRAFT paper to its own uploader (RLS allows it, not blanket-denied)';
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- Scenario 21 (Loop 09): a student cannot self-assign their own
-- practice_answers.marks_awarded/is_correct - the only way to set them
-- is the auto-marking trigger (recomputing from the actual submitted
-- answer) or a genuine staff manual mark. Also proves a LECTURER
-- taking their own practice session still gets auto-graded normally,
-- not mistaken for a staff manual mark just because of their role.
-- ---------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);

insert into practice_answers (session_id, question_id, selected_option_id) values
  ('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000001'); -- wrong option

do $$
declare v_correct boolean; v_marks numeric;
begin
  select is_correct, marks_awarded into v_correct, v_marks from practice_answers
    where session_id = 'c1000000-0000-0000-0000-000000000001' and question_id = 'b1000000-0000-0000-0000-000000000002';
  if v_correct is not false or v_marks is distinct from 0 then
    raise exception 'FAIL: a wrong MC answer should auto-grade as incorrect/0 marks, got correct=%, marks=%', v_correct, v_marks;
  end if;
  raise notice 'PASS: a wrong MULTIPLE_CHOICE answer auto-grades as incorrect (baseline for the attack below)';
end;
$$;

-- ATTACK: a raw UPDATE that touches ONLY the grading columns, never
-- selected_option_id/answer_text/numerical_answer - exactly the
-- vector the Node API's own route never performs but RLS/the trigger
-- alone must still stop, since a real client could call PostgREST
-- directly with the same access token.
update practice_answers set marks_awarded = 5, is_correct = true, marked_by = '30000000-0000-0000-0000-000000000001'
  where session_id = 'c1000000-0000-0000-0000-000000000001' and question_id = 'b1000000-0000-0000-0000-000000000002';

do $$
declare v_correct boolean; v_marks numeric; v_marked_by uuid;
begin
  select is_correct, marks_awarded, marked_by into v_correct, v_marks, v_marked_by from practice_answers
    where session_id = 'c1000000-0000-0000-0000-000000000001' and question_id = 'b1000000-0000-0000-0000-000000000002';
  if v_correct is not false or v_marks is distinct from 0 or v_marked_by is not null then
    raise exception 'FAIL: student self-marking attack succeeded - correct=%, marks=%, marked_by=%', v_correct, v_marks, v_marked_by;
  end if;
  raise notice 'PASS: a student cannot self-assign marks_awarded/is_correct/marked_by via a raw UPDATE that skips the content columns';
end;
$$;

insert into practice_answers (session_id, question_id, answer_text) values
  ('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000003', 'Recursion is when a function calls itself.');

update practice_answers set marks_awarded = 20, is_correct = true
  where session_id = 'c1000000-0000-0000-0000-000000000001' and question_id = 'b1000000-0000-0000-0000-000000000003';

do $$
declare v_marks numeric;
begin
  select marks_awarded into v_marks from practice_answers
    where session_id = 'c1000000-0000-0000-0000-000000000001' and question_id = 'b1000000-0000-0000-0000-000000000003';
  if v_marks is not null then
    raise exception 'FAIL: student self-marked their own ESSAY answer, got marks=%', v_marks;
  end if;
  raise notice 'PASS: a student cannot self-assign marks on their own ESSAY answer either';
end;
$$;

reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', false);

update practice_answers set marks_awarded = 18, is_correct = true, auto_marked = false,
  marked_by = '30000000-0000-0000-0000-000000000001', marked_at = now()
  where session_id = 'c1000000-0000-0000-0000-000000000001' and question_id = 'b1000000-0000-0000-0000-000000000003';

do $$
declare v_marks numeric; v_marked_by uuid;
begin
  select marks_awarded, marked_by into v_marks, v_marked_by from practice_answers
    where session_id = 'c1000000-0000-0000-0000-000000000001' and question_id = 'b1000000-0000-0000-0000-000000000003';
  if v_marks is distinct from 18 or v_marked_by is distinct from '30000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'FAIL: a legitimate staff manual mark did not take effect - marks=%, marked_by=%', v_marks, v_marked_by;
  end if;
  raise notice 'PASS: a legitimate staff manual mark on an ESSAY answer still works correctly';
end;
$$;

reset role;

insert into practice_sessions (id, user_id, course_id, total_questions, total_marks) values
  ('c1000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444401', 1, 5);
insert into practice_session_questions (session_id, question_id, order_index) values
  ('c1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000002', 0);

set role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', false);

insert into practice_answers (session_id, question_id, selected_option_id) values
  ('c1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000002'); -- correct option

do $$
declare v_correct boolean; v_marks numeric; v_auto boolean;
begin
  select is_correct, marks_awarded, auto_marked into v_correct, v_marks, v_auto from practice_answers
    where session_id = 'c1000000-0000-0000-0000-000000000003' and question_id = 'b1000000-0000-0000-0000-000000000002';
  if v_correct is not true or v_marks is distinct from 5 or v_auto is not true then
    raise exception 'FAIL: a LECTURER taking their own practice session should still auto-grade normally, got correct=%, marks=%, auto=%', v_correct, v_marks, v_auto;
  end if;
  raise notice 'PASS: a LECTURER submitting their own practice answer still gets auto-graded normally (not mistaken for a staff manual mark)';
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- Scenario 22 (Loop 09): a student cannot answer (and have counted) a
-- question that was never part of their practice session's snapshot -
-- an "outside the snapshot" question worth 50 marks must not be
-- insertable against a session that never included it, and the
-- session's own total/obtained marks must reflect only its real
-- snapshot on submission.
-- ---------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);

do $$
begin
  begin
    insert into practice_answers (session_id, question_id, selected_option_id) values
      ('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000004', 'b2000000-0000-0000-0000-000000000003');
    raise exception 'FAIL: inserted an answer for a question outside the session''s practice_session_questions snapshot';
  exception when insufficient_privilege then
    raise notice 'PASS: cannot insert a practice_answers row for a question outside the session''s own snapshot';
  end;
end;
$$;

do $$
declare v_result practice_sessions;
begin
  -- By this point in the fixture timeline (scenario 21 above), this
  -- session's 3-question/30-mark snapshot has: the MC question
  -- answered wrong (0 marks), the ESSAY question staff-marked at 18,
  -- and the NUMERICAL question left unanswered - 18/30 total,
  -- regardless of the blocked 50-mark out-of-scope insert attempt.
  select * into v_result from practice_submit_session('c1000000-0000-0000-0000-000000000001');
  if v_result.total_marks is distinct from 30 or v_result.obtained_marks is distinct from 18 or v_result.percentage is distinct from 60.00 then
    raise exception 'FAIL: session totals should reflect only the real 3-question/30-mark snapshot, got total=%, obtained=%, pct=%',
      v_result.total_marks, v_result.obtained_marks, v_result.percentage;
  end if;
  raise notice 'PASS: session totals on submit reflect only the real snapshot, not any out-of-scope answer';
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- Scenario 23 (Loop 09): a staff member CAN actually manually mark
-- another student's subjective practice answer via the RLS-scoped
-- client, and time_spent_seconds genuinely accumulates across pause/
-- resume/submit instead of silently staying at its default 0 forever.
-- Both were previously-undiscovered functional bugs, not just missing
-- coverage - practice_answers had no SELECT policy for staff at all
-- (Postgres requires SELECT-visibility before an UPDATE/DELETE policy
-- is even considered), so every staff manual-mark attempt silently
-- affected 0 rows; and nothing ever wrote to time_spent_seconds.
-- ---------------------------------------------------------------------
insert into practice_sessions (id, user_id, course_id, total_questions, total_marks) values
  ('c1000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444401', 1, 20);
insert into practice_session_questions (session_id, question_id, order_index) values
  ('c1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000003', 0);

set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', false);
insert into practice_answers (session_id, question_id, answer_text) values
  ('c1000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000003', 'A second student''s essay answer.');
reset role;

set role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', false);

do $$
declare v_visible int;
begin
  select count(*) into v_visible from practice_answers where session_id = 'c1000000-0000-0000-0000-000000000004';
  if v_visible <> 1 then
    raise exception 'FAIL: library staff should be able to SELECT another student''s practice_answers row (a prerequisite for marking it), saw %', v_visible;
  end if;
  raise notice 'PASS: library staff can see a practice_answers row that isn''t their own (prerequisite for marking it)';
end;
$$;

do $$
declare v_marks numeric;
begin
  update practice_answers set marks_awarded = 15, is_correct = true, auto_marked = false,
    marked_by = '30000000-0000-0000-0000-000000000001', marked_at = now()
    where session_id = 'c1000000-0000-0000-0000-000000000004' and question_id = 'b1000000-0000-0000-0000-000000000003';
  select marks_awarded into v_marks from practice_answers
    where session_id = 'c1000000-0000-0000-0000-000000000004' and question_id = 'b1000000-0000-0000-0000-000000000003';
  if v_marks is distinct from 15 then
    raise exception 'FAIL: library staff should be able to manually mark another student''s ESSAY answer, got marks=% (previously this silently affected 0 rows)', v_marks;
  end if;
  raise notice 'PASS: library staff can manually mark another student''s ESSAY answer end to end';
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- Scenario 24 (Loop 09): time_spent_seconds genuinely accumulates
-- across pause -> resume -> submit rather than staying at 0.
-- ---------------------------------------------------------------------
insert into practice_sessions (id, user_id, course_id, total_questions, total_marks, started_at) values
  ('c1000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444401', 1, 5, now() - interval '5 seconds');
insert into practice_session_questions (session_id, question_id, order_index) values
  ('c1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000001', 0);

set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);

select practice_pause_session('c1000000-0000-0000-0000-000000000005');

do $$
declare v_time int; v_status text;
begin
  select time_spent_seconds, status into v_time, v_status from practice_sessions where id = 'c1000000-0000-0000-0000-000000000005';
  if v_status <> 'PAUSED' or v_time < 4 then
    raise exception 'FAIL: pausing should accumulate the elapsed active segment (~5s) and flip to PAUSED, got status=%, time=%', v_status, v_time;
  end if;
  raise notice 'PASS: pausing a practice session accumulates real elapsed time (was previously always 0)';
end;
$$;

select practice_resume_session('c1000000-0000-0000-0000-000000000005');
insert into practice_answers (session_id, question_id, numerical_answer) values
  ('c1000000-0000-0000-0000-000000000005', 'b1000000-0000-0000-0000-000000000001', 42);

do $$
declare v_result practice_sessions;
begin
  select * into v_result from practice_submit_session('c1000000-0000-0000-0000-000000000005');
  if v_result.time_spent_seconds < 4 then
    raise exception 'FAIL: submit should add the final active segment on top of the pause accumulation, got time=%', v_result.time_spent_seconds;
  end if;
  raise notice 'PASS: submit finalizes time_spent_seconds to a real, non-zero total (%s)', v_result.time_spent_seconds;
end;
$$;

-- ---------------------------------------------------------------------
-- Scenario 25 (Loop 09): duplicate submission - calling submit again
-- on an already-SUBMITTED session must be a safe no-op (same result
-- returned, nothing double-counted or re-scored), not an error and
-- not a second scoring pass - a student double-clicking "submit" or
-- retrying after a flaky network response must never get two
-- different results.
-- ---------------------------------------------------------------------
do $$
declare v_first practice_sessions; v_second practice_sessions;
begin
  select * into v_first from practice_sessions where id = 'c1000000-0000-0000-0000-000000000005';
  select * into v_second from practice_submit_session('c1000000-0000-0000-0000-000000000005');
  if v_second.status is distinct from 'SUBMITTED'
     or v_second.obtained_marks is distinct from v_first.obtained_marks
     or v_second.time_spent_seconds is distinct from v_first.time_spent_seconds then
    raise exception 'FAIL: re-submitting an already-SUBMITTED session should be a safe no-op, got status=%, obtained=% (was %), time=% (was %)',
      v_second.status, v_second.obtained_marks, v_first.obtained_marks, v_second.time_spent_seconds, v_first.time_spent_seconds;
  end if;
  raise notice 'PASS: submitting an already-SUBMITTED session again is a safe no-op (same result, nothing double-counted)';
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- Scenario 26 (Loop 10): admin_dashboard_stats() reflects real data,
-- not fake/placeholder numbers - active_users excludes a suspended
-- account, and views/downloads/practice-attempts are genuine
-- aggregates over the actual fixture data (not hardcoded). The
-- function's ACTIVE-status filter is a plain WHERE clause, not an
-- RLS-dependent computation, so this runs as the postgres superuser
-- like every other fixture setup in this file rather than needing an
-- authenticated-role round trip.
-- ---------------------------------------------------------------------
do $$
declare v_active_before bigint;
begin
  select active_users into v_active_before from admin_dashboard_stats();

  insert into auth.users (id) values ('80000000-0000-0000-0000-000000000012');
  insert into profiles (id, student_id, full_name, status) values
    ('80000000-0000-0000-0000-000000000012', 'SUSPTEST01', 'Suspended Test Account', 'SUSPENDED');

  if (select active_users from admin_dashboard_stats()) is distinct from v_active_before then
    raise exception 'FAIL: adding a SUSPENDED account should never change active_users, was % before, % after', v_active_before, (select active_users from admin_dashboard_stats());
  end if;
  raise notice 'PASS: active_users correctly excludes a SUSPENDED account (not just counting every profile row)';
end;
$$;

update examination_papers set view_count = 7, download_count = 3 where id = 'a1000000-0000-0000-0000-000000000002';

do $$
declare v_views bigint; v_downloads bigint; v_attempts bigint;
begin
  select total_views, total_downloads, total_practice_attempts
    into v_views, v_downloads, v_attempts
    from admin_dashboard_stats();
  if v_views < 7 or v_downloads < 3 then
    raise exception 'FAIL: admin_dashboard_stats() should reflect the real view_count/download_count just set (>=7/>=3), got views=%, downloads=%', v_views, v_downloads;
  end if;
  if v_attempts < 1 then
    raise exception 'FAIL: admin_dashboard_stats() should count at least the SUBMITTED practice sessions from earlier scenarios, got %', v_attempts;
  end if;
  raise notice 'PASS: admin_dashboard_stats() reflects real aggregate data (views=%, downloads=%, attempts=%), not fake numbers', v_views, v_downloads, v_attempts;
end;
$$;

reset role;

-- ---------------------------------------------------------------------
-- Scenario 27 (Loop 11): answer-key leakage via question_options.
-- is_correct/answer_keys.correct_answer_text - RLS is the real
-- enforcement boundary (table grants are wide open to anon/
-- authenticated, matching Supabase's normal pattern), so these must
-- hold against a direct query, not just through the Node API's JSON-
-- level stripAnswers().
-- ---------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false); -- student1

do $$
declare visible_count int;
begin
  -- b1000000-...004 is VERIFIED but deliberately NOT part of
  -- student1's practice_session_questions snapshot (see the fixture
  -- comment above scenario 22). Before this loop's fix,
  -- question_options_select had a bare "verification_status =
  -- VERIFIED" branch with no role/ownership/session check at all, so
  -- this would have been visible to any authenticated caller,
  -- including a student who had never even started a session
  -- referencing it.
  select count(*) into visible_count from question_options where id = 'b2000000-0000-0000-0000-000000000003';
  if visible_count <> 0 then
    raise exception 'FAIL: a student must not see question_options (and its is_correct) for a VERIFIED question outside any of their own practice sessions';
  end if;
  raise notice 'PASS: a student cannot read question_options.is_correct for a verified question outside their own practice sessions';
end;
$$;

do $$
declare visible_count int;
begin
  -- b1000000-...002 IS part of student1's own session snapshot
  -- (c1000000-...001) - this must keep working, otherwise
  -- PracticeSession.tsx breaks (it renders option_label/option_text
  -- via this exact RLS path).
  select count(*) into visible_count from question_options where question_id = 'b1000000-0000-0000-0000-000000000002';
  if visible_count <> 2 then
    raise exception 'FAIL: a student must still see question_options for a question that IS part of their own practice session snapshot, saw %', visible_count;
  end if;
  raise notice 'PASS: a student still sees question_options for their own practice session''s questions (no regression)';
end;
$$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', false); -- lecturer2 (NOT assigned to CSC101)

do $$
declare visible_count int;
begin
  -- Before this loop's fix, answer_keys_select_staff used
  -- auth_is_staff(), which is true for ANY lecturer - lecturer2 could
  -- read lecturer1's CSC101 answer key despite having no relationship
  -- to that course at all.
  select count(*) into visible_count from answer_keys where question_id = 'b1000000-0000-0000-0000-000000000001';
  if visible_count <> 0 then
    raise exception 'FAIL: a lecturer with no relationship to the course must not read that course''s answer_keys';
  end if;
  raise notice 'PASS: a lecturer not assigned to the course cannot read its answer_keys';
end;
$$;

do $$
declare visible_count int;
begin
  select count(*) into visible_count from question_options where question_id = 'b1000000-0000-0000-0000-000000000002';
  if visible_count <> 0 then
    raise exception 'FAIL: a lecturer with no relationship to the course must not read that course''s question_options (is_correct)';
  end if;
  raise notice 'PASS: a lecturer not assigned to the course cannot read its question_options.is_correct';
end;
$$;

reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', false); -- lecturer1 (author + assigned to CSC101)

do $$
declare visible_count int;
begin
  -- Regression check: the legitimate authoring/review workflow for
  -- the course's own lecturer must be completely unaffected.
  select count(*) into visible_count from answer_keys where question_id = 'b1000000-0000-0000-0000-000000000001';
  if visible_count <> 1 then
    raise exception 'FAIL: the course''s own lecturer (and question author) must still read its answer_keys, saw %', visible_count;
  end if;

  select count(*) into visible_count from question_options where question_id = 'b1000000-0000-0000-0000-000000000002';
  if visible_count <> 2 then
    raise exception 'FAIL: the course''s own lecturer (and question author) must still read its question_options, saw %', visible_count;
  end if;
  raise notice 'PASS: the course''s own lecturer/question-author still has full answer-key visibility (no regression)';
end;
$$;

reset role;

rollback;

\echo 'All RLS/RBAC assertions passed.'
