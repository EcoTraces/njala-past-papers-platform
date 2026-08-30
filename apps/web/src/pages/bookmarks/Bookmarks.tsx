import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/apiClient';
import { PageSpinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';

interface BookmarkItem {
  id: string;
  created_at: string;
  examination_papers: { id: string; title: string; courses: { code: string; title: string } | null } | null;
}

export function Bookmarks(): JSX.Element {
  const { data, isLoading } = useQuery({ queryKey: ['bookmarks'], queryFn: () => api.get<{ items: BookmarkItem[] }>('/papers/bookmarks/mine') });

  if (isLoading || !data) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Your bookmarks</h1>

      {data.items.length === 0 ? (
        <EmptyState title="No bookmarks yet" action={<Link to="/app/papers" className="btn-primary">Browse papers</Link>} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((b) => (
            <Link key={b.id} to={`/app/papers/${b.examination_papers?.id}`} className="card block hover:shadow-md">
              <p className="text-xs font-semibold uppercase text-brand-600">{b.examination_papers?.courses?.code}</p>
              <p className="mt-1 font-medium text-slate-900">{b.examination_papers?.title}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
