-- =====================================================================
-- Loop 10: the admin dashboard only ever exposed totalUsers/
-- totalPapers/totalCourses/pendingApprovals - views, downloads,
-- practice attempts, and active users are all explicitly called out
-- in the brief and none of them existed. Aggregating view_count/
-- download_count across the whole catalogue needs a real SUM, which
-- PostgREST's plain filter/select interface can't express any more
-- than ts_rank could (see search_examination_papers in Loop 08) - a
-- real Postgres function is the right tool again here.
--
-- SECURITY INVOKER (the default, no `security definer`): RLS still
-- governs what the calling role can actually aggregate over -
-- profiles_select_admin/papers_select_staff/practice_sessions_select_
-- admin already grant an ADMIN/SUPER_ADMIN caller (the only role
-- GET /api/admin/dashboard is reachable by) full visibility, so this
-- doesn't widen access - a non-admin caller would just get whatever
-- their own restricted RLS visibility allows the aggregate to see.
-- =====================================================================

create or replace function admin_dashboard_stats()
returns table (
  active_users bigint,
  total_views bigint,
  total_downloads bigint,
  total_practice_attempts bigint
)
language sql
stable
as $$
  select
    (select count(*) from profiles where status = 'ACTIVE' and deleted_at is null),
    (select coalesce(sum(view_count), 0) from examination_papers where deleted_at is null),
    (select coalesce(sum(download_count), 0) from examination_papers where deleted_at is null),
    (select count(*) from practice_sessions where status = 'SUBMITTED');
$$;

grant execute on function admin_dashboard_stats() to authenticated;
