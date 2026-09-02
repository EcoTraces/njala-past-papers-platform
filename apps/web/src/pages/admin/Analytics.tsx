import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../../lib/apiClient';
import { downloadCsv, toCsv } from '../../lib/csv';
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

interface TrendDay {
  day: string;
  uploads: number;
  views: number;
  downloads: number;
  practice_attempts: number;
}

interface TrendsResponse {
  items: TrendDay[];
  days: number;
}

const TREND_RANGE_OPTIONS = [7, 30, 90] as const;

function truncateTitle(title: string, max = 28): string {
  return title.length > max ? `${title.slice(0, max - 1)}…` : title;
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function Analytics(): JSX.Element {
  const [trendRangeDays, setTrendRangeDays] = useState<(typeof TREND_RANGE_OPTIONS)[number]>(30);

  const { data, isLoading } = useQuery({ queryKey: ['analytics'], queryFn: () => api.get<AnalyticsResponse>('/analytics') });
  const { data: trends, isLoading: trendsLoading } = useQuery({
    queryKey: ['analytics', 'trends', trendRangeDays],
    queryFn: () => api.get<TrendsResponse>(`/analytics/trends?days=${trendRangeDays}`),
  });

  if (isLoading || !data) return <PageSpinner />;

  const viewedChartData = data.mostViewedPapers.map((p) => ({ name: truncateTitle(p.title), fullTitle: p.title, count: p.view_count ?? 0 }));
  const downloadedChartData = data.mostDownloadedPapers.map((p) => ({ name: truncateTitle(p.title), fullTitle: p.title, count: p.download_count ?? 0 }));

  function exportMostViewed(): void {
    downloadCsv(
      `most-viewed-papers-${todayStamp()}.csv`,
      toCsv(data!.mostViewedPapers, [
        { header: 'Paper', value: (p) => p.title },
        { header: 'Views', value: (p) => p.view_count ?? 0 },
      ]),
    );
  }

  function exportMostDownloaded(): void {
    downloadCsv(
      `most-downloaded-papers-${todayStamp()}.csv`,
      toCsv(data!.mostDownloadedPapers, [
        { header: 'Paper', value: (p) => p.title },
        { header: 'Downloads', value: (p) => p.download_count ?? 0 },
      ]),
    );
  }

  function exportTrends(): void {
    if (!trends) return;
    downloadCsv(
      `daily-trends-${trendRangeDays}d-${todayStamp()}.csv`,
      toCsv(trends.items, [
        { header: 'Date', value: (t) => t.day },
        { header: 'Uploads', value: (t) => t.uploads },
        { header: 'Views', value: (t) => t.views },
        { header: 'Downloads', value: (t) => t.downloads },
        { header: 'Practice attempts', value: (t) => t.practice_attempts },
      ]),
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Analytics</h1>
        <p className="text-slate-600">Platform-wide engagement across published papers.</p>
      </div>

      <section className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900">Daily activity trends</h2>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md ring-1 ring-inset ring-slate-300">
              {TREND_RANGE_OPTIONS.map((option, i) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={trendRangeDays === option}
                  onClick={() => setTrendRangeDays(option)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${i > 0 ? 'border-l border-slate-300' : ''} ${
                    trendRangeDays === option ? 'bg-brand-600 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
                  } ${i === 0 ? 'rounded-l-md' : ''} ${i === TREND_RANGE_OPTIONS.length - 1 ? 'rounded-r-md' : ''}`}
                >
                  {option}d
                </button>
              ))}
            </div>
            <button type="button" className="btn-secondary" onClick={exportTrends} disabled={!trends || trends.items.length === 0}>
              Export CSV
            </button>
          </div>
        </div>
        {trendsLoading || !trends ? (
          <PageSpinner />
        ) : trends.items.every((t) => t.uploads === 0 && t.views === 0 && t.downloads === 0 && t.practice_attempts === 0) ? (
          <EmptyState title="No activity in this period" />
        ) : (
          <div className="h-72 w-full" role="img" aria-label={`Line chart of uploads, views, downloads, and practice attempts per day over the last ${trendRangeDays} days`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trends.items} margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="day" stroke="#64748b" fontSize={12} tickFormatter={(d: string) => d.slice(5)} />
                <YAxis allowDecimals={false} stroke="#64748b" fontSize={12} />
                <Tooltip contentStyle={{ borderRadius: 8, borderColor: '#e2e8f0', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="uploads" name="Uploads" stroke="#2563eb" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="views" name="Views" stroke="#16a34a" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="downloads" name="Downloads" stroke="#d97706" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="practice_attempts" name="Practice attempts" stroke="#9333ea" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="card">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Most viewed papers</h2>
            <button type="button" className="btn-secondary" onClick={exportMostViewed} disabled={viewedChartData.length === 0}>
              Export CSV
            </button>
          </div>
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
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Most downloaded papers</h2>
            <button type="button" className="btn-secondary" onClick={exportMostDownloaded} disabled={downloadedChartData.length === 0}>
              Export CSV
            </button>
          </div>
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
