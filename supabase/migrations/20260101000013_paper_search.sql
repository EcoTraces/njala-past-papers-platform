-- =====================================================================
-- Loop 08: relevance-ranked full-text search, plus an index PostgREST's
-- plain filter/order interface can't express (ts_rank against a
-- per-request search term). SECURITY INVOKER (the default - no
-- `security definer` here, unlike the counters/marking functions in
-- earlier migrations) so this runs with the CALLING role's privileges:
-- RLS on examination_papers is still the authority on which rows a
-- given caller can see, exactly as it is for the plain PostgREST
-- query path apps/api/src/routes/papers.routes.ts otherwise uses. A
-- student calling this with a manipulated status filter still only
-- ever gets rows RLS already lets them see.
-- =====================================================================

create index idx_papers_programme on examination_papers (programme_id);

-- The "recent"/"popular" browse sorts (GET /api/papers?sort=recent|
-- popular, the defaults - see apps/web's home/browse pages) previously
-- had no supporting index at all: an unfiltered site-wide ORDER BY
-- created_at/download_count DESC LIMIT n forces Postgres to sort the
-- entire table rather than walk an index top-to-bottom. At the scale
-- a real archive reaches (see the seeded-volume EXPLAIN ANALYZE run
-- in TASK.md "Findings from Loop 08") this is a real, measurable cost
-- that a course/status filter alone doesn't rescue, since those sorts
-- are also the ones most likely to run with no other filter applied
-- at all (a plain "browse everything, newest/most-downloaded first").
create index idx_papers_created_at on examination_papers (created_at desc);
create index idx_papers_download_count on examination_papers (download_count desc);

create or replace function search_examination_papers(
  p_query text default null,
  p_course_id uuid default null,
  p_faculty_id uuid default null,
  p_department_id uuid default null,
  p_programme_id uuid default null,
  p_academic_year_id uuid default null,
  p_semester_id uuid default null,
  p_examination_type examination_type default null,
  p_status paper_status default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  title text,
  course_id uuid,
  course_code text,
  course_title text,
  faculty_id uuid,
  department_id uuid,
  academic_year_id uuid,
  semester_id uuid,
  examination_type examination_type,
  paper_type paper_type,
  status paper_status,
  page_count smallint,
  view_count integer,
  download_count integer,
  publication_date timestamptz,
  created_at timestamptz,
  rank real,
  total_count bigint
)
language sql
stable
as $$
  select
    p.id, p.title, p.course_id, c.code as course_code, c.title as course_title,
    p.faculty_id, p.department_id,
    p.academic_year_id, p.semester_id, p.examination_type, p.paper_type,
    p.status, p.page_count, p.view_count, p.download_count,
    p.publication_date, p.created_at,
    case
      when p_query is not null and btrim(p_query) <> ''
        then ts_rank(p.search_vector, websearch_to_tsquery('english', p_query))
      else 0
    end as rank,
    count(*) over () as total_count
  from examination_papers p
  join courses c on c.id = p.course_id
  where
    (p_query is null or btrim(p_query) = '' or p.search_vector @@ websearch_to_tsquery('english', p_query))
    and (p_course_id is null or p.course_id = p_course_id)
    and (p_faculty_id is null or p.faculty_id = p_faculty_id)
    and (p_department_id is null or p.department_id = p_department_id)
    and (p_programme_id is null or p.programme_id = p_programme_id)
    and (p_academic_year_id is null or p.academic_year_id = p_academic_year_id)
    and (p_semester_id is null or p.semester_id = p_semester_id)
    and (p_examination_type is null or p.examination_type = p_examination_type)
    and (p_status is null or p.status = p_status)
  order by rank desc, p.created_at desc
  limit p_limit offset p_offset;
$$;

grant execute on function search_examination_papers(
  text, uuid, uuid, uuid, uuid, uuid, uuid, examination_type, paper_status, int, int
) to authenticated;
