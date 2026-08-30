import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/apiClient';
import { PageSpinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import type { PaperStatus } from '@njala/shared';

interface MyPaper {
  id: string;
  title: string;
  status: PaperStatus;
  created_at: string;
  courses: { code: string; title: string } | null;
}

export function MyPapers(): JSX.Element {
  const { data, isLoading } = useQuery({ queryKey: ['my-papers'], queryFn: () => api.get<{ items: MyPaper[] }>('/papers/mine/uploaded') });

  if (isLoading || !data) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">My papers</h1>
        <Link to="/app/lecturer/upload" className="btn-primary">Upload paper</Link>
      </div>

      {data.items.length === 0 ? (
        <EmptyState title="No papers uploaded yet" action={<Link to="/app/lecturer/upload" className="btn-primary">Upload your first paper</Link>} />
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {data.items.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <Link to={`/app/papers/${p.id}`} className="text-sm font-medium text-brand-700 hover:underline">{p.title}</Link>
                <p className="text-xs text-slate-500">{p.courses?.code}</p>
              </div>
              <StatusBadge status={p.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
