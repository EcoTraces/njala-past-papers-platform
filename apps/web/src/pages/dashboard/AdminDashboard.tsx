import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/apiClient';
import { PageSpinner } from '../../components/Spinner';

interface AdminDashboardResponse {
  totalUsers: number;
  totalPapers: number;
  totalCourses: number;
  pendingApprovals: number;
}

export function AdminDashboard(): JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => api.get<AdminDashboardResponse>('/admin/dashboard'),
  });

  if (isLoading || !data) return <PageSpinner />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Administrator dashboard</h1>
        <p className="text-slate-600">System-wide overview.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total users" value={data.totalUsers} />
        <StatCard label="Total papers" value={data.totalPapers} />
        <StatCard label="Total courses" value={data.totalCourses} />
        <StatCard label="Pending approvals" value={data.pendingApprovals} highlight />
      </div>

      <div className="flex flex-wrap gap-3">
        <Link to="/app/admin/users" className="btn-secondary">Manage users</Link>
        <Link to="/app/admin/academic" className="btn-secondary">Manage academic structure</Link>
        <Link to="/app/admin/audit-logs" className="btn-secondary">View audit logs</Link>
      </div>
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
