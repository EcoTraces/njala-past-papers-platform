import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/apiClient';
import { PageSpinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import { StatusBadge } from '../../components/StatusBadge';
import type { PaperStatus } from '@njala/shared';

interface LecturerDashboardResponse {
  myPapers: Array<{ id: string; title: string; status: PaperStatus }>;
  myCourses: Array<{ id: string; code: string; title: string }>;
  questionBankStats: { total: number; verified: number; pending: number };
}

export function LecturerDashboard(): JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['lecturer-dashboard'],
    queryFn: () => api.get<LecturerDashboardResponse>('/lecturer/dashboard'),
  });

  if (isLoading || !data) return <PageSpinner />;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Lecturer dashboard</h1>
          <p className="text-slate-600">Your courses, uploaded papers and question bank.</p>
        </div>
        <Link to="/app/lecturer/upload" className="btn-primary">Upload paper</Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Questions authored" value={data.questionBankStats.total} />
        <StatCard label="Verified" value={data.questionBankStats.verified} />
        <StatCard label="Pending verification" value={data.questionBankStats.pending} />
      </div>

      <section>
        <h2 className="mb-3 text-lg font-medium text-slate-900">My courses</h2>
        {data.myCourses.length === 0 ? (
          <EmptyState title="No courses assigned yet" description="An administrator assigns lecturers to courses." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.myCourses.map((c) => (
              <span key={c.id} className="badge bg-slate-100 text-slate-700">{c.code} - {c.title}</span>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-slate-900">My recent papers</h2>
        {data.myPapers.length === 0 ? (
          <EmptyState title="No papers uploaded yet" action={<Link to="/app/lecturer/upload" className="btn-primary">Upload your first paper</Link>} />
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {data.myPapers.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-3">
                <Link to={`/app/papers/${p.id}`} className="text-sm font-medium text-brand-700 hover:underline">{p.title}</Link>
                <StatusBadge status={p.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div className="card">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
