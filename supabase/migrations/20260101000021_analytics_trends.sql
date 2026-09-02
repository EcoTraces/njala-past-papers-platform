-- =====================================================================
-- Exportable analytics reports / time-series trends (recommended
-- improvement #11 from the Loop 15 roadmap review): the dashboards and
-- /api/analytics previously only ever exposed static top-10 lists and
-- point-in-time counts - no time-series data existed anywhere, so
-- there was nothing for a trends chart or an exported report to show
-- change over time.
--
-- Day-bucketed GROUP BY aggregates across four different tables in one
-- call aren't expressible through PostgREST's plain query builder any
-- more than ts_rank() (Loop 08) or admin_dashboard_stats()'s SUM()s
-- (Loop 10) were - same fix, a real Postgres function.
--
-- SECURITY INVOKER (the default): RLS still governs what the calling
-- role can see. No new RLS policies are needed for this - unlike when
-- admin_dashboard_stats() was added, paper_views_select_own and
-- paper_downloads_select_own already grant `auth_is_staff()` (which
-- covers LIBRARY_STAFF/ADMIN/SUPER_ADMIN, the only roles
-- GET /api/analytics/trends is reachable by - see dashboard.routes.ts)
-- full visibility across every row, not just their own.
-- =====================================================================

-- Supporting indexes for the new query pattern this function
-- introduces (a range filter over the last N days on each table's own
-- timestamp column) - added alongside the function that actually uses
-- them, not speculatively; examination_papers.created_at is already
-- indexed (idx_papers_created_at, Loop 08).
create index if not exists idx_paper_views_viewed_at on paper_views (viewed_at);
create index if not exists idx_paper_downloads_downloaded_at on paper_downloads (downloaded_at);
create index if not exists idx_practice_sessions_submitted_at on practice_sessions (submitted_at) where status = 'SUBMITTED';

create or replace function analytics_daily_trends(p_days int default 30)
returns table (
  day date,
  uploads bigint,
  views bigint,
  downloads bigint,
  practice_attempts bigint
)
language sql
stable
as $$
  with bounded as (
    -- Clamped server-side too (not just at the API layer) so a direct
    -- RPC call can't request an absurd generate_series range.
    select least(greatest(p_days, 1), 365) as n
  ),
  days as (
    select generate_series(
      (current_date - ((select n from bounded) - 1) * interval '1 day')::date,
      current_date,
      interval '1 day'
    )::date as day
  ),
  uploads_by_day as (
    select created_at::date as day, count(*) as n
    from examination_papers
    where deleted_at is null
      and created_at >= current_date - ((select n from bounded) - 1)
    group by 1
  ),
  views_by_day as (
    select viewed_at::date as day, count(*) as n
    from paper_views
    where viewed_at >= current_date - ((select n from bounded) - 1)
    group by 1
  ),
  downloads_by_day as (
    select downloaded_at::date as day, count(*) as n
    from paper_downloads
    where downloaded_at >= current_date - ((select n from bounded) - 1)
    group by 1
  ),
  attempts_by_day as (
    select submitted_at::date as day, count(*) as n
    from practice_sessions
    where status = 'SUBMITTED'
      and submitted_at >= current_date - ((select n from bounded) - 1)
    group by 1
  )
  select
    d.day,
    coalesce(u.n, 0) as uploads,
    coalesce(v.n, 0) as views,
    coalesce(dl.n, 0) as downloads,
    coalesce(a.n, 0) as practice_attempts
  from days d
  left join uploads_by_day u on u.day = d.day
  left join views_by_day v on v.day = d.day
  left join downloads_by_day dl on dl.day = d.day
  left join attempts_by_day a on a.day = d.day
  order by d.day;
$$;

grant execute on function analytics_daily_trends(int) to authenticated;
