import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/apiClient';
import { EmptyState } from '../../components/EmptyState';
import { SkeletonStatCardRow, SkeletonRows } from '../../components/Skeleton';

interface AdminDashboardResponse {
  totalUsers: number;
  activeUsers: number;
  totalPapers: number;
  totalCourses: number;
  totalViews: number;
  totalDownloads: number;
  totalPracticeAttempts: number;
  pendingApprovals: number;
  recentActivity: Array<{
    id: string;
    action: string;
    entity_type: string;
    entity_id: string | null;
    created_at: string;
    profiles: { full_name: string } | null;
  }>;
}

export function AdminDashboard(): JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => api.get<AdminDashboardResponse>('/admin/dashboard'),
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Administrator dashboard</h1>
          <p className="text-slate-600">System-wide overview.</p>
        </div>
        <SkeletonStatCardRow count={4} />
        <SkeletonStatCardRow count={4} />
        <SkeletonRows count={5} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Administrator dashboard</h1>
        <p className="text-slate-600">System-wide overview.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total users" value={data.totalUsers} />
        <StatCard label="Active users" value={data.activeUsers} />
        <StatCard label="Total papers" value={data.totalPapers} />
        <StatCard label="Total courses" value={data.totalCourses} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total paper views" value={data.totalViews} />
        <StatCard label="Total downloads" value={data.totalDownloads} />
        <StatCard label="Practice attempts" value={data.totalPracticeAttempts} />
        <StatCard label="Pending approvals" value={data.pendingApprovals} highlight />
      </div>

      <div className="flex flex-wrap gap-3">
        <Link to="/app/admin/users" className="btn-secondary">Manage users</Link>
        <Link to="/app/admin/academic" className="btn-secondary">Manage academic structure</Link>
        <Link to="/app/admin/audit-logs" className="btn-secondary">View audit logs</Link>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-medium text-slate-900">Recent system activity</h2>
        {data.recentActivity.length === 0 ? (
          <EmptyState title="No recent activity" />
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {data.recentActivity.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="text-slate-900">
                  <span className="font-medium">{entry.profiles?.full_name ?? 'System'}</span>{' '}
                  {entry.action.toLowerCase()} {entry.entity_type.toLowerCase()}
                </span>
                <span className="text-xs text-slate-500">{new Date(entry.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: number; highlight?: boolean }): JSX.Element {
  return (
    <div className="card">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-semibold ${highlight && value > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{value}</p>
    </div>
  );
}
