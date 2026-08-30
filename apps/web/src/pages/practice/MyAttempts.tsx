import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/apiClient';
import { PageSpinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';

interface Attempt {
  id: string;
  title: string;
  status: string;
  percentage: number | null;
  started_at: string;
  submitted_at: string | null;
}

export function MyAttempts(): JSX.Element {
  const { data, isLoading } = useQuery({ queryKey: ['practice-attempts'], queryFn: () => api.get<{ items: Attempt[] }>('/practice/sessions') });

  if (isLoading || !data) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">My practice attempts</h1>

      {data.items.length === 0 ? (
        <EmptyState title="No attempts yet" action={<Link to="/app/practice" className="btn-primary">Start practicing</Link>} />
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {data.items.map((attempt) => (
            <li key={attempt.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <Link
                  to={attempt.status === 'SUBMITTED' ? `/app/practice/${attempt.id}/results` : `/app/practice/${attempt.id}`}
                  className="text-sm font-medium text-brand-700 hover:underline"
                >
                  {attempt.title}
                </Link>
                <p className="text-xs text-slate-500">{new Date(attempt.started_at).toLocaleString()}</p>
              </div>
              <span className="text-sm font-medium text-slate-700">
                {attempt.status === 'SUBMITTED' ? `${attempt.percentage ?? 0}%` : attempt.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
