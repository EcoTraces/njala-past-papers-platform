-- =====================================================================
-- Atomic counters for paper view/download counts. SECURITY DEFINER so
-- any authenticated user who can already see paper_views/paper_downloads
-- rows (i.e. anyone who legitimately viewed/downloaded, per RLS) can
-- bump the aggregate without needing a broad UPDATE grant on
-- examination_papers itself.
-- =====================================================================

create or replace function increment_paper_view_count(p_paper_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update examination_papers set view_count = view_count + 1 where id = p_paper_id;
end;
$$;

create or replace function increment_paper_download_count(p_paper_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update examination_papers set download_count = download_count + 1 where id = p_paper_id;
end;
$$;

grant execute on function increment_paper_view_count(uuid) to authenticated;
grant execute on function increment_paper_download_count(uuid) to authenticated;
