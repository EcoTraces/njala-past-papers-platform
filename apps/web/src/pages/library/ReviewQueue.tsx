import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/apiClient';
import { PageSpinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import type { PaperStatus } from '@njala/shared';

interface QueueItem {
  id: string;
  title: string;
  status: PaperStatus;
  created_at: string;
  courses: { code: string; title: string } | null;
}

const TABS: PaperStatus[] = ['SUBMITTED', 'UNDER_REVIEW'];

export function ReviewQueue(): JSX.Element {
  const [status, setStatus] = useState<PaperStatus>('SUBMITTED');
  const { data, isLoading } = useQuery({
    queryKey: ['review-queue', status],
    queryFn: () => api.get<{ items: QueueItem[] }>(`/papers?status=${status}&sort=recent`),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Review queue</h1>

      <div className="flex gap-2">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`rounded-full px-3 py-1 text-sm ${status === tab ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            onClick={() => setStatus(tab)}
          >
            {tab.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {isLoading || !data ? (
        <PageSpinner />
      ) : data.items.length === 0 ? (
        <EmptyState title="Nothing here" description="No papers currently in this state." />
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {data.items.map((p) => (
            <li key={p.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <Link to={`/app/papers/${p.id}`} className="text-sm font-medium text-brand-700 hover:underline">{p.title}</Link>
                <p className="text-xs text-slate-500">{p.courses?.code} - {new Date(p.created_at).toLocaleDateString()}</p>
              </div>
              <StatusBadge status={p.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
