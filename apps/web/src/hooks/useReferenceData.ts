import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/apiClient';

export interface Course {
  id: string;
  code: string;
  title: string;
}

export interface AcademicYear {
  id: string;
  name: string;
}

export interface Semester {
  id: string;
  name: string;
  academic_year_id?: string;
}

// Courses/academic years/semesters are admin-managed and change rarely
// (new courses get added a few times a term at most), but were
// previously fetched under the same global 30s staleTime as everything
// else - every one of PapersBrowse/PracticeStart/QuestionBank/
// UploadPaper independently refetches this reference data more than
// 30s apart during ordinary navigation, even though nothing changed
// (Loop 14 perf audit). A 10-minute staleTime here is long enough to
// eliminate that redundant traffic within a normal session, while
// still being short enough that a newly-added course shows up on a
// fresh page load without requiring a full app reload.
const REFERENCE_DATA_STALE_TIME_MS = 10 * 60 * 1000;

export function useCourses() {
  return useQuery({
    queryKey: ['courses'],
    queryFn: () => api.get<{ items: Course[] }>('/courses'),
    staleTime: REFERENCE_DATA_STALE_TIME_MS,
  });
}

export function useAcademicYears() {
  return useQuery({
    queryKey: ['academic-years'],
    queryFn: () => api.get<{ items: AcademicYear[] }>('/academic-years'),
    staleTime: REFERENCE_DATA_STALE_TIME_MS,
  });
}

export function useSemesters() {
  return useQuery({
    queryKey: ['semesters'],
    queryFn: () => api.get<{ items: Semester[] }>('/semesters'),
    staleTime: REFERENCE_DATA_STALE_TIME_MS,
  });
}
