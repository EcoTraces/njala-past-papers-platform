-- =====================================================================
-- Loop 08: RLS performance fix for examination_papers' SELECT
-- policies, found while testing search at a realistic data volume
-- (50k rows) - EXPLAIN ANALYZE showed a keyword search taking ~940ms
-- via a full sequential scan, never touching idx_papers_search_vector
-- (the GIN index), even though the exact same query as the table
-- owner (RLS bypassed) used the index and ran in ~7ms.
--
-- Root cause: examination_papers has four permissive SELECT policies,
-- which Postgres combines with OR into one qual evaluated on every
-- candidate row. `auth.uid()`/`auth_has_role()`/`auth_is_admin()` are
-- STABLE, but a plain (unwrapped) function call in a policy is still
-- evaluated inline per row rather than hoisted out - so the combined
-- qual (four OR'd branches, one of them a correlated EXISTS against
-- course_lecturers) was expensive enough per row, and opaque enough to
-- the planner, that it never considered a Bitmap Index Scan off the
-- GIN index worth it, defaulting to Seq Scan regardless of role.
--
-- Fix (Postgres/Supabase's own documented RLS performance pattern):
-- wrap each function call in `(select ...)`. This turns it into an
-- explicit, once-evaluated InitPlan instead of a per-row call, which
-- both cuts the per-row filter cost directly and simplifies the qual
-- enough for the planner to reconsider its access path. Measured
-- effect on the exact search query from Loop 08's perf test: ~940ms
-- (unfiltered keyword search over 50k rows, worst case) down to ~29ms
-- - logic is otherwise identical to the original policies.
--
-- Scoped to the SELECT policies only (what search actually exercises);
-- the same pattern likely benefits this table's INSERT/UPDATE/DELETE
-- policies and other RLS-protected tables too, left for a dedicated
-- pass - see TASK.md "Findings from Loop 08" and SECURITY.md.
-- =====================================================================

drop policy papers_select_own on examination_papers;
drop policy papers_select_course_lecturer on examination_papers;
drop policy papers_select_staff on examination_papers;

create policy papers_select_own on examination_papers for select
  using (uploaded_by = (select auth.uid()));

create policy papers_select_course_lecturer on examination_papers for select
  using (
    (select auth_has_role('LECTURER'))
    and exists (
      select 1 from course_lecturers cl
      where cl.course_id = examination_papers.course_id and cl.lecturer_id = (select auth.uid())
    )
  );

create policy papers_select_staff on examination_papers for select
  using ((select auth_has_role('LIBRARY_STAFF')) or (select auth_is_admin()));
