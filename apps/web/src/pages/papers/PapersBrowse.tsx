import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { api } from '../../lib/apiClient';
import { EmptyState } from '../../components/EmptyState';
import { PageSpinner } from '../../components/Spinner';
import { StatusBadge } from '../../components/StatusBadge';
import type { PaperStatus } from '@njala/shared';
import { EXAMINATION_TYPES } from '@njala/shared';

interface PaperListItem {
  id: string;
  title: string;
  status: PaperStatus;
  examination_type: string;
  courses: { code: string; title: string } | null;
  view_count: number;
  download_count: number;
  publication_date: string | null;
}

interface PapersResponse {
  items: PaperListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface Course {
  id: string;
  code: string;
  title: string;
}

interface AcademicYear {
  id: string;
  name: string;
}

interface Semester {
  id: string;
  name: string;
}

const SORT_OPTIONS = [
  { value: 'recent', label: 'Most recent' },
  { value: 'relevance', label: 'Best match' },
  { value: 'popular', label: 'Most downloaded' },
  { value: 'title', label: 'Title' },
] as const;

const FILTER_KEYS = ['courseId', 'examinationType', 'academicYearId', 'semesterId'] as const;

export function PapersBrowse(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');

  const page = Number(params.get('page') ?? '1');
  const sort = params.get('sort') ?? 'recent';

  const { data, isLoading } = useQuery({
    queryKey: ['papers', params.toString()],
    queryFn: () => api.get<PapersResponse>(`/papers?${params.toString()}`),
  });

  const { data: courses } = useQuery({ queryKey: ['courses'], queryFn: () => api.get<{ items: Course[] }>('/courses') });
  const { data: academicYears } = useQuery({ queryKey: ['academic-years'], queryFn: () => api.get<{ items: AcademicYear[] }>('/academic-years') });
  const { data: semesters } = useQuery({ queryKey: ['semesters'], queryFn: () => api.get<{ items: Semester[] }>('/semesters') });

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams(params);
    if (q) {
      next.set('q', q);
      // A keyword search with no explicit sort choice yet defaults to
      // relevance ranking, not insertion order - matches how every
      // other search box on the web behaves. Still fully overridable
      // via the sort chips below.
      if (!params.get('sort')) next.set('sort', 'relevance');
    } else {
      next.delete('q');
    }
    next.set('page', '1');
    setParams(next);
  };

  const setSort = (value: string) => {
    const next = new URLSearchParams(params);
    next.set('sort', value);
    setParams(next);
  };

  const setFilter = (key: (typeof FILTER_KEYS)[number], value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.set('page', '1');
    setParams(next);
  };

  const clearFilters = () => {
    const next = new URLSearchParams(params);
    FILTER_KEYS.forEach((key) => next.delete(key));
    next.delete('q');
    next.set('page', '1');
    setParams(next);
    setQ('');
  };

  const goToPage = (p: number) => {
    const next = new URLSearchParams(params);
    next.set('page', String(p));
    setParams(next);
  };

  const activeFilterCount = FILTER_KEYS.filter((key) => params.get(key)).length + (params.get('q') ? 1 : 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Browse examination papers</h1>
        <p className="text-slate-600">Search by course, title, or keyword, and narrow by examination type, academic year, or semester.</p>
      </div>

      <form onSubmit={onSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
          <input
            className="input pl-9"
            placeholder="Search by title or keyword (e.g. Data Structures)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search papers"
          />
        </div>
        <button type="submit" className="btn-primary">Search</button>
      </form>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <select
          className="input"
          aria-label="Filter by course"
          value={params.get('courseId') ?? ''}
          onChange={(e) => setFilter('courseId', e.target.value)}
        >
          <option value="">All courses</option>
          {courses?.items.map((c) => (
            <option key={c.id} value={c.id}>{c.code} - {c.title}</option>
          ))}
        </select>
        <select
          className="input"
          aria-label="Filter by examination type"
          value={params.get('examinationType') ?? ''}
          onChange={(e) => setFilter('examinationType', e.target.value)}
        >
          <option value="">All examination types</option>
          {EXAMINATION_TYPES.map((t) => (
            <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
          ))}
        </select>
        <select
          className="input"
          aria-label="Filter by academic year"
          value={params.get('academicYearId') ?? ''}
          onChange={(e) => setFilter('academicYearId', e.target.value)}
        >
          <option value="">All academic years</option>
          {academicYears?.items.map((y) => (
            <option key={y.id} value={y.id}>{y.name}</option>
          ))}
        </select>
        <select
          className="input"
          aria-label="Filter by semester"
          value={params.get('semesterId') ?? ''}
          onChange={(e) => setFilter('semesterId', e.target.value)}
        >
          <option value="">All semesters</option>
          {semesters?.items.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Sort by:</span>
          {SORT_OPTIONS.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setSort(s.value)}
              className={`rounded-full px-3 py-1 ${sort === s.value ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {activeFilterCount > 0 && (
          <button type="button" onClick={clearFilters} className="text-sm text-brand-700 hover:underline">
            Clear filters ({activeFilterCount})
          </button>
        )}
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No papers found" description="Try a different search term or filter." />
      ) : (
        <>
          <p className="text-sm text-slate-500">{data.total} paper{data.total === 1 ? '' : 's'} found</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((paper) => (
              <Link key={paper.id} to={`/app/papers/${paper.id}`} className="card block hover:shadow-md">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase text-brand-600">{paper.courses?.code}</span>
                  <StatusBadge status={paper.status} />
                </div>
                <p className="font-medium text-slate-900">{paper.title}</p>
                <p className="mt-1 text-xs text-slate-500">{paper.examination_type.replace(/_/g, ' ')}</p>
                <div className="mt-3 flex gap-3 text-xs text-slate-400">
                  <span>{paper.view_count} views</span>
                  <span>{paper.download_count} downloads</span>
                </div>
              </Link>
            ))}
          </div>

          {data.totalPages > 1 && (
            <nav className="flex items-center justify-center gap-2" aria-label="Pagination">
              <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                Previous
              </button>
              <span className="text-sm text-slate-500">Page {page} of {data.totalPages}</span>
              <button type="button" className="btn-secondary" disabled={page >= data.totalPages} onClick={() => goToPage(page + 1)}>
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
