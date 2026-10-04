drop policy if exists papers_insert_authorized on examination_papers;

create policy papers_insert_authorized on examination_papers for insert
  with check (
    uploaded_by = (select auth.uid())
    and (
      (select auth_has_role('LECTURER'))
      or (select auth_has_role('LIBRARY_STAFF'))
      or (select auth_is_admin())
    )
  );
