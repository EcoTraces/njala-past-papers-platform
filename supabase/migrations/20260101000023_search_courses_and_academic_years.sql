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
        then coalesce(ts_rank(p.search_vector, websearch_to_tsquery('english', p_query)), 0)
          + case when lower(c.code) = lower(btrim(p_query)) then 1.0::real else 0::real end
          + case when position(lower(btrim(p_query)) in lower(ay.name)) > 0 then 0.5::real else 0::real end
      else 0
    end as rank,
    count(*) over () as total_count
  from examination_papers p
  join courses c on c.id = p.course_id
  left join academic_years ay on ay.id = p.academic_year_id
  where
    (
      p_query is null
      or btrim(p_query) = ''
      or p.search_vector @@ websearch_to_tsquery('english', p_query)
      or lower(c.code) = lower(btrim(p_query))
      or to_tsvector('english', coalesce(c.code, '') || ' ' || coalesce(c.title, ''))
        @@ websearch_to_tsquery('english', p_query)
      or position(lower(btrim(p_query)) in lower(ay.name)) > 0
    )
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
