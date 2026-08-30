-- =====================================================================
-- Supabase Storage: private bucket for examination paper files.
--
-- The bucket is PRIVATE (public = false). The Node API is the only
-- writer: it uploads using the service role (which bypasses RLS) after
-- generating a sanitized, random object key - it never trusts a
-- client-supplied filename or path. Students/staff never receive a
-- permanent object URL; they receive a short-lived signed URL minted
-- by the API for each view/download, scoped to a paper they are
-- already authorized (via the examination_papers RLS/authorization
-- checks) to see.
--
-- The SELECT policy below is defense-in-depth for the rare case a
-- client hits the Storage REST API directly instead of going through a
-- signed URL - it re-derives the same visibility rules as
-- examination_papers.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('examination-papers', 'examination-papers', false, 26214400, array['application/pdf'])
on conflict (id) do nothing;

create policy storage_papers_select on storage.objects for select
  using (
    bucket_id = 'examination-papers'
    and exists (
      select 1 from examination_papers p
      where p.storage_path = storage.objects.name
        and (
          (p.status = 'PUBLISHED' and p.deleted_at is null)
          or p.uploaded_by = auth.uid()
          or auth_is_staff()
        )
    )
  );

-- No client-side INSERT/UPDATE/DELETE policy is granted: uploads,
-- replacements and deletions of paper files happen exclusively through
-- the Node API using the Supabase service role.
