import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/apiClient';
import { PageSpinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';

interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
}

export function AuditLogs(): JSX.Element {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page],
    queryFn: () => api.get<{ items: AuditLog[]; total: number; pageSize: number }>(`/admin/audit-logs?page=${page}&pageSize=50`),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Audit logs</h1>

      {isLoading || !data ? (
        <PageSpinner />
      ) : data.items.length === 0 ? (
        <EmptyState title="No audit events yet" />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-slate-500">Time</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-500">Action</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-500">Entity</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-500">Actor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((log) => (
                  <tr key={log.id}>
                    <td className="whitespace-nowrap px-4 py-2 text-slate-600">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="px-4 py-2 font-medium text-slate-900">{log.action}</td>
                    <td className="px-4 py-2 text-slate-600">{log.entity_type}{log.entity_id ? ` #${log.entity_id.slice(0, 8)}` : ''}</td>
                    <td className="px-4 py-2 text-slate-600">{log.actor_id ? log.actor_id.slice(0, 8) : 'system'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-center gap-2">
            <button type="button" className="btn-secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <button type="button" className="btn-secondary" disabled={data.items.length < data.pageSize} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </>
      )}
    </div>
  );
}
