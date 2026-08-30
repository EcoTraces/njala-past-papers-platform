import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/apiClient';
import { PageSpinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';

interface LibraryDashboardResponse {
  pendingReview: Array<{ id: string; title: string; status: string }>;
  recentlyApproved: Array<{ id: string; title: string }>;
  recentlyRejected: Array<{ id: string; title: string; rejection_reason: string | null }>;
  processingFailures: Array<{ id: string; paper_id: string; error_message: string | null }>;
}

export function LibraryDashboard(): JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['library-dashboard'],
    queryFn: () => api.get<LibraryDashboardResponse>('/library/dashboard'),
  });

  if (isLoading || !data) return <PageSpinner />;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Library dashboard</h1>
          <p className="text-slate-600">Papers awaiting review, and recent verification activity.</p>
        </div>
        <Link to="/app/library/queue" className="btn-primary">Open review queue</Link>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-medium text-slate-900">Awaiting review ({data.pendingReview.length})</h2>
        {data.pendingReview.length === 0 ? (
          <EmptyState title="Nothing pending review" />
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {data.pendingReview.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-3">
                <Link to={`/app/papers/${p.id}`} className="text-sm font-medium text-brand-700 hover:underline">{p.title}</Link>
                <span className="text-xs text-slate-500">{p.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-medium text-slate-900">Recently approved</h2>
          {data.recentlyApproved.length === 0 ? (
            <EmptyState title="Nothing approved recently" />
          ) : (
            <ul className="space-y-1 text-sm">
              {data.recentlyApproved.map((p) => <li key={p.id}><Link to={`/app/papers/${p.id}`} className="text-brand-700 hover:underline">{p.title}</Link></li>)}
            </ul>
          )}
        </section>
        <section>
          <h2 className="mb-3 text-lg font-medium text-slate-900">Recently rejected</h2>
          {data.recentlyRejected.length === 0 ? (
            <EmptyState title="Nothing rejected recently" />
          ) : (
            <ul className="space-y-1 text-sm">
              {data.recentlyRejected.map((p) => <li key={p.id}>{p.title} <span className="text-slate-400">- {p.rejection_reason}</span></li>)}
            </ul>
          )}
        </section>
      </div>

      {data.processingFailures.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-medium text-red-700">Processing failures</h2>
          <ul className="space-y-1 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {data.processingFailures.map((j) => <li key={j.id}>Paper {j.paper_id}: {j.error_message}</li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
