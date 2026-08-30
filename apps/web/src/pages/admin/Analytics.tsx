import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../lib/apiClient';
import { PageSpinner } from '../../components/Spinner';
import { EmptyState } from '../../components/EmptyState';

interface AnalyticsPaper {
  id: string;
  title: string;
  view_count?: number;
  download_count?: number;
}

interface AnalyticsResponse {
  mostViewedPapers: AnalyticsPaper[];
  mostDownloadedPapers: AnalyticsPaper[];
  totalUploads: number;
  uploadsLast30Days: number;
}

function truncateTitle(title: string, max = 28): string {
  return title.length > max ? `${title.slice(0, max - 1)}…` : title;
}

export function Analytics(): JSX.Element {
  const { data, isLoading } = useQuery({ queryKey: ['analytics'], queryFn: () => api.get<AnalyticsResponse>('/analytics') });

  if (isLoading || !data) return <PageSpinner />;

  const viewedChartData = data.mostViewedPapers.map((p) => ({ name: truncateTitle(p.title), fullTitle: p.title, count: p.view_count ?? 0 }));
  const downloadedChartData = data.mostDownloadedPapers.map((p) => ({ name: truncateTitle(p.title), fullTitle: p.title, count: p.download_count ?? 0 }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Analytics</h1>
        <p className="text-slate-600">Platform-wide engagement across published papers.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="card">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Most viewed papers</h2>
          {viewedChartData.length === 0 ? (
            <EmptyState title="No view data yet" />
          ) : (
            <div className="h-72 w-full" role="img" aria-label="Bar chart of the most viewed papers, ranked by view count">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={viewedChartData} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} stroke="#64748b" fontSize={12} />
                  <YAxis type="category" dataKey="name" width={160} stroke="#64748b" fontSize={12} />
                  <Tooltip
                    formatter={(value: number) => [`${value} views`, '']}
                    labelFormatter={(_label, payload) => payload?.[0]?.payload?.fullTitle ?? ''}
                    contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }}
                  />
                  <Bar dataKey="count" fill="#2563eb" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Most downloaded papers</h2>
          {downloadedChartData.length === 0 ? (
            <EmptyState title="No download data yet" />
          ) : (
            <div className="h-72 w-full" role="img" aria-label="Bar chart of the most downloaded papers, ranked by download count">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={downloadedChartData} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} stroke="#64748b" fontSize={12} />
                  <YAxis type="category" dataKey="name" width={160} stroke="#64748b" fontSize={12} />
                  <Tooltip
                    formatter={(value: number) => [`${value} downloads`, '']}
                    labelFormatter={(_label, payload) => payload?.[0]?.payload?.fullTitle ?? ''}
                    contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }}
                  />
                  <Bar dataKey="count" fill="#16a34a" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </div>

      <p className="text-sm text-slate-500">
        {data.totalUploads} papers uploaded in total, {data.uploadsLast30Days} in the last 30 days.
      </p>
    </div>
  );
}
