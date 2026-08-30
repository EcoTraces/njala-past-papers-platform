import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { api } from '../../lib/apiClient';
import { EmptyState } from '../../components/EmptyState';
import { PageSpinner } from '../../components/Spinner';
import { StatusBadge } from '../../components/StatusBadge';
import type { PaperStatus } from '@njala/shared';

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

export function PapersBrowse(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');

  const page = Number(params.get('page') ?? '1');
  const sort = params.get('sort') ?? 'recent';

  const { data, isLoading } = useQuery({
    queryKey: ['papers', params.toString()],
    queryFn: () => api.get<PapersResponse>(`/papers?${params.toString()}`),
  });

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams(params);
    if (q) next.set('q', q);
    else next.delete('q');
    next.set('page', '1');
    setParams(next);
  };

  const setSort = (value: string) => {
    const next = new URLSearchParams(params);
    next.set('sort', value);
    setParams(next);
  };

  const goToPage = (p: number) => {
    const next = new URLSearchParams(params);
    next.set('page', String(p));
    setParams(next);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Browse examination papers</h1>
        <p className="text-slate-600">Search by course, title, faculty or keyword.</p>
      </div>

      <form onSubmit={onSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden="true" />
          <input
            className="input pl-9"
            placeholder="Search papers (e.g. CSC201, Data Structures)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search papers"
          />
        </div>
        <button type="submit" className="btn-primary">Search</button>
      </form>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-500">Sort by:</span>
        {(['recent', 'popular', 'title'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSort(s)}
            className={`rounded-full px-3 py-1 ${sort === s ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          >
            {s === 'recent' ? 'Most recent' : s === 'popular' ? 'Most downloaded' : 'Title'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <PageSpinner />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No papers found" description="Try a different search term or filter." />
      ) : (
        <>
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
