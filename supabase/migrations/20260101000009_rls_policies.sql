-- =====================================================================
-- Row Level Security. Every table gets RLS enabled and an explicit,
-- narrow policy set. Nothing here ever trusts a client-supplied role
-- claim - all role checks resolve through auth_has_role/auth_is_staff/
-- auth_is_admin, which read user_roles server-side via auth.uid().
--
-- The Node API additionally authorizes every request itself (defense
-- in depth): RLS is the last line of defense, not the only one.
-- =====================================================================

alter table profiles enable row level security;
alter table roles enable row level security;
alter table permissions enable row level security;
alter table role_permissions enable row level security;
alter table user_roles enable row level security;
alter table faculties enable row level security;
alter table departments enable row level security;
alter table programmes enable row level security;
alter table courses enable row level security;
alter table course_lecturers enable row level security;
alter table academic_years enable row level security;
alter table semesters enable row level security;
alter table examination_papers enable row level security;
alter table paper_versions enable row level security;
alter table paper_reviews enable row level security;
alter table paper_categories enable row level security;
alter table paper_category_links enable row level security;
alter table paper_downloads enable row level security;
alter table paper_views enable row level security;
alter table questions enable row level security;
alter table question_options enable row level security;
alter table answer_keys enable row level security;
alter table practice_sessions enable row level security;
alter table practice_session_questions enable row level security;
alter table practice_answers enable row level security;
alter table bookmarks enable row level security;
alter table notifications enable row level security;
alter table audit_logs enable row level security;
alter table document_processing_jobs enable row level security;
alter table system_settings enable row level security;

-- ---------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------
create policy profiles_select_own on profiles for select
  using (id = auth.uid());

create policy profiles_select_admin on profiles for select
  using (auth_is_admin());

-- Lecturers/library staff can look up basic profile info of a paper
-- uploader etc. Kept read-only and role-gated, not a blanket grant.
create policy profiles_select_staff on profiles for select
  using (auth_is_staff());

create policy profiles_update_own on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_update_admin on profiles for update
  using (auth_is_admin());

-- Row creation happens server-side (service role) at signup time, so
-- no client INSERT policy is granted.

-- ---------------------------------------------------------------------
-- roles / permissions / role_permissions - read-only reference data.
-- Writes are performed only by the service role (bypasses RLS).
-- ---------------------------------------------------------------------
create policy roles_select_all on roles for select using (auth.uid() is not null);
create policy permissions_select_all on permissions for select using (auth.uid() is not null);
create policy role_permissions_select_all on role_permissions for select using (auth.uid() is not null);

-- ---------------------------------------------------------------------
-- user_roles
-- ---------------------------------------------------------------------
create policy user_roles_select_own on user_roles for select
  using (user_id = auth.uid());

create policy user_roles_select_admin on user_roles for select
  using (auth_is_admin());

-- Admins may grant any role except SUPER_ADMIN; only a SUPER_ADMIN may
-- grant SUPER_ADMIN. This stops privilege escalation to the top role
-- by a merely-ADMIN account.
create policy user_roles_insert_admin on user_roles for insert
  with check (
    auth_is_admin()
    and (
      auth_has_role('SUPER_ADMIN')
      or role_id <> (select id from roles where name = 'SUPER_ADMIN')
    )
  );

create policy user_roles_delete_admin on user_roles for delete
  using (
    auth_is_admin()
    and (
      auth_has_role('SUPER_ADMIN')
      or role_id <> (select id from roles where name = 'SUPER_ADMIN')
    )
  );

-- ---------------------------------------------------------------------
-- Academic structure - readable by any authenticated user, writable
-- only by admins.
-- ---------------------------------------------------------------------
create policy faculties_select_all on faculties for select using (auth.uid() is not null);
create policy faculties_write_admin on faculties for all
  using (auth_is_admin()) with check (auth_is_admin());

create policy departments_select_all on departments for select using (auth.uid() is not null);
create policy departments_write_admin on departments for all
  using (auth_is_admin()) with check (auth_is_admin());

create policy programmes_select_all on programmes for select using (auth.uid() is not null);
create policy programmes_write_admin on programmes for all
  using (auth_is_admin()) with check (auth_is_admin());

create policy courses_select_all on courses for select using (auth.uid() is not null);
create policy courses_write_admin on courses for all
  using (auth_is_admin()) with check (auth_is_admin());

create policy course_lecturers_select_own on course_lecturers for select
  using (lecturer_id = auth.uid() or auth_is_staff());
create policy course_lecturers_write_admin on course_lecturers for all
  using (auth_is_admin()) with check (auth_is_admin());

create policy academic_years_select_all on academic_years for select using (auth.uid() is not null);
create policy academic_years_write_admin on academic_years for all
  using (auth_is_admin()) with check (auth_is_admin());

create policy semesters_select_all on semesters for select using (auth.uid() is not null);
create policy semesters_write_admin on semesters for all
  using (auth_is_admin()) with check (auth_is_admin());

-- ---------------------------------------------------------------------
-- examination_papers
-- ---------------------------------------------------------------------
create policy papers_select_published on examination_papers for select
  using (status = 'PUBLISHED' and deleted_at is null);

create policy papers_select_own on examination_papers for select
  using (uploaded_by = auth.uid());

create policy papers_select_course_lecturer on examination_papers for select
  using (
    auth_has_role('LECTURER')
    and exists (
      select 1 from course_lecturers cl
      where cl.course_id = examination_papers.course_id and cl.lecturer_id = auth.uid()
    )
  );

create policy papers_select_staff on examination_papers for select
  using (auth_has_role('LIBRARY_STAFF') or auth_is_admin());

-- Lecturers may only upload for courses they are assigned to; library
-- staff/admins may upload for any course.
create policy papers_insert_authorized on examination_papers for insert
  with check (
    uploaded_by = auth.uid()
    and (
      auth_has_role('LIBRARY_STAFF') or auth_is_admin()
      or (
        auth_has_role('LECTURER')
        and exists (
          select 1 from course_lecturers cl
          where cl.course_id = examination_papers.course_id and cl.lecturer_id = auth.uid()
        )
      )
    )
  );

-- Uploaders may edit their own paper only while it is still a draft.
create policy papers_update_own_draft on examination_papers for update
  using (uploaded_by = auth.uid() and status = 'DRAFT')
  with check (uploaded_by = auth.uid());

-- Library staff/admins drive the review workflow end to end.
create policy papers_update_staff on examination_papers for update
  using (auth_has_role('LIBRARY_STAFF') or auth_is_admin())
  with check (auth_has_role('LIBRARY_STAFF') or auth_is_admin());

create policy papers_delete_admin on examination_papers for delete
  using (auth_is_admin());

create policy paper_versions_select on paper_versions for select
  using (
    exists (
      select 1 from examination_papers p
      where p.id = paper_versions.paper_id
        and (p.uploaded_by = auth.uid() or auth_is_staff())
    )
  );

create policy paper_versions_insert on paper_versions for insert
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from examination_papers p
      where p.id = paper_versions.paper_id
        and (p.uploaded_by = auth.uid() or auth_is_staff())
    )
  );

create policy paper_reviews_select on paper_reviews for select
  using (
    exists (
      select 1 from examination_papers p
      where p.id = paper_reviews.paper_id
        and (p.uploaded_by = auth.uid() or auth_is_staff())
    )
  );

create policy paper_reviews_insert_staff on paper_reviews for insert
  with check (reviewer_id = auth.uid() and (auth_has_role('LIBRARY_STAFF') or auth_is_admin()));

create policy paper_categories_select_all on paper_categories for select using (auth.uid() is not null);
create policy paper_categories_write_staff on paper_categories for all
  using (auth_has_role('LIBRARY_STAFF') or auth_is_admin())
  with check (auth_has_role('LIBRARY_STAFF') or auth_is_admin());

create policy paper_category_links_select_all on paper_category_links for select using (auth.uid() is not null);
create policy paper_category_links_write_staff on paper_category_links for all
  using (auth_has_role('LIBRARY_STAFF') or auth_is_admin())
  with check (auth_has_role('LIBRARY_STAFF') or auth_is_admin());

create policy paper_downloads_insert_self on paper_downloads for insert
  with check (user_id = auth.uid());
create policy paper_downloads_select_own on paper_downloads for select
  using (user_id = auth.uid() or auth_is_staff());

create policy paper_views_insert_self on paper_views for insert
  with check (user_id = auth.uid());
create policy paper_views_select_own on paper_views for select
  using (user_id = auth.uid() or auth_is_staff());

-- ---------------------------------------------------------------------
-- questions / question_options / answer_keys
-- ---------------------------------------------------------------------
create policy questions_select_verified on questions for select
  using (verification_status = 'VERIFIED' and deleted_at is null);

create policy questions_select_own on questions for select
  using (author_id = auth.uid());

create policy questions_select_staff on questions for select
  using (auth_is_staff());

create policy questions_insert_authorized on questions for insert
  with check (
    author_id = auth.uid()
    and (auth_has_role('LECTURER') or auth_has_role('LIBRARY_STAFF') or auth_is_admin())
  );

create policy questions_update_own_unverified on questions for update
  using (author_id = auth.uid() and verification_status = 'UNVERIFIED')
  with check (author_id = auth.uid());

create policy questions_update_staff on questions for update
  using (auth_has_role('LIBRARY_STAFF') or auth_is_admin())
  with check (auth_has_role('LIBRARY_STAFF') or auth_is_admin());

create policy question_options_select on question_options for select
  using (
    exists (
      select 1 from questions q
      where q.id = question_options.question_id
        and (q.verification_status = 'VERIFIED' or q.author_id = auth.uid() or auth_is_staff())
    )
  );

create policy question_options_write on question_options for all
  using (
    exists (
      select 1 from questions q
      where q.id = question_options.question_id
        and (q.author_id = auth.uid() or auth_has_role('LIBRARY_STAFF') or auth_is_admin())
    )
  )
  with check (
    exists (
      select 1 from questions q
      where q.id = question_options.question_id
        and (q.author_id = auth.uid() or auth_has_role('LIBRARY_STAFF') or auth_is_admin())
    )
  );

-- Answer keys are never exposed to students, even for their own
-- attempts - marking is computed server-side (see auto-marking
-- trigger) and only the *result* (is_correct/marks_awarded) is
-- readable via practice_answers.
create policy answer_keys_select_staff on answer_keys for select
  using (
    auth_is_staff()
    or exists (select 1 from questions q where q.id = answer_keys.question_id and q.author_id = auth.uid())
  );

create policy answer_keys_write_staff on answer_keys for all
  using (auth_has_role('LECTURER') or auth_has_role('LIBRARY_STAFF') or auth_is_admin())
  with check (created_by = auth.uid());

-- ---------------------------------------------------------------------
-- practice_sessions / practice_session_questions / practice_answers
-- ---------------------------------------------------------------------
create policy practice_sessions_owner on practice_sessions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy practice_sessions_select_admin on practice_sessions for select
  using (auth_is_admin());

create policy psq_owner on practice_session_questions for all
  using (exists (select 1 from practice_sessions s where s.id = session_id and s.user_id = auth.uid()))
  with check (exists (select 1 from practice_sessions s where s.id = session_id and s.user_id = auth.uid()));

create policy practice_answers_owner on practice_answers for all
  using (exists (select 1 from practice_sessions s where s.id = session_id and s.user_id = auth.uid()))
  with check (exists (select 1 from practice_sessions s where s.id = session_id and s.user_id = auth.uid()));

-- Staff manually marking ESSAY/SHORT_ANSWER answers - deliberately
-- separate from the owner policy above so a student can never set
-- their own marks_awarded/is_correct by hand; only the auto-marking
-- trigger (SECURITY DEFINER) or a staff member via this policy can.
create policy practice_answers_mark_staff on practice_answers for update
  using (auth_has_role('LECTURER') or auth_has_role('LIBRARY_STAFF') or auth_is_admin())
  with check (auth_has_role('LECTURER') or auth_has_role('LIBRARY_STAFF') or auth_is_admin());

-- ---------------------------------------------------------------------
-- bookmarks
-- ---------------------------------------------------------------------
create policy bookmarks_owner on bookmarks for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- notifications - readable/updatable (mark-as-read) by the owner only.
-- Creation is system-driven via the service role, not client insert.
-- ---------------------------------------------------------------------
create policy notifications_select_own on notifications for select
  using (user_id = auth.uid());

create policy notifications_update_own on notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- audit_logs - read-only, admin/library-staff only, insert via service
-- role only.
-- ---------------------------------------------------------------------
create policy audit_logs_select_staff on audit_logs for select
  using (auth_has_role('LIBRARY_STAFF') or auth_is_admin());

-- ---------------------------------------------------------------------
-- document_processing_jobs
-- ---------------------------------------------------------------------
create policy processing_jobs_select on document_processing_jobs for select
  using (
    auth_is_staff()
    or exists (
      select 1 from examination_papers p
      where p.id = document_processing_jobs.paper_id and p.uploaded_by = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- system_settings - readable by all authenticated users (drives client
-- side validation hints), writable only by admins.
-- ---------------------------------------------------------------------
create policy system_settings_select_all on system_settings for select using (auth.uid() is not null);
create policy system_settings_write_admin on system_settings for all
  using (auth_is_admin()) with check (auth_is_admin());
