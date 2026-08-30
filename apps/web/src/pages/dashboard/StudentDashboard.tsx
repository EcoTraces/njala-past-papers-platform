import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/apiClient';
import { PageSpinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';
import { BookOpen, Bookmark } from 'lucide-react';

interface StudentDashboardResponse {
  recentPapers: Array<{ id: string; title: string; courses: { code: string; title: string } | null }>;
  bookmarks: Array<{ paper_id: string; examination_papers: { id: string; title: string } | null }>;
  recentAttempts: Array<{ id: string; title: string; status: string; percentage: number | null }>;
  notifications: Array<{ id: string; title: string; is_read: boolean }>;
}

export function StudentDashboard(): JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['student-dashboard'],
    queryFn: () => api.get<StudentDashboardResponse>('/student/dashboard'),
  });

  if (isLoading || !data) return <PageSpinner />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Your dashboard</h1>
        <p className="text-slate-600">Recently published papers, your bookmarks and recent practice attempts.</p>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-medium text-slate-900">Recently published papers</h2>
        {data.recentPapers.length === 0 ? (
          <EmptyState title="No papers published yet" />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.recentPapers.map((paper) => (
              <Link key={paper.id} to={`/app/papers/${paper.id}`} className="card block hover:shadow-md">
                <p className="text-xs font-medium uppercase text-brand-600">{paper.courses?.code}</p>
                <p className="mt-1 font-medium text-slate-900">{paper.title}</p>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-medium text-slate-900">
          <Bookmark className="h-5 w-5" aria-hidden="true" /> Your bookmarks
        </h2>
        {data.bookmarks.length === 0 ? (
          <EmptyState title="No bookmarks yet" description="Bookmark papers you want to find quickly later." />
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {data.bookmarks.map((b) => (
              <li key={b.paper_id} className="px-4 py-3">
                <Link to={`/app/papers/${b.paper_id}`} className="text-sm font-medium text-brand-700 hover:underline">
                  {b.examination_papers?.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-lg font-medium text-slate-900">
          <BookOpen className="h-5 w-5" aria-hidden="true" /> Recent practice attempts
        </h2>
        {data.recentAttempts.length === 0 ? (
          <EmptyState
            title="No practice attempts yet"
            action={<Link to="/app/practice" className="btn-primary">Start practicing</Link>}
          />
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {data.recentAttempts.map((attempt) => (
              <li key={attempt.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm font-medium text-slate-900">{attempt.title}</span>
                <span className="text-sm text-slate-500">
                  {attempt.status === 'SUBMITTED' ? `${attempt.percentage ?? 0}%` : attempt.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
