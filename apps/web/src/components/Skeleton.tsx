import clsx from 'clsx';

/** A single placeholder block. Compose these into page-shaped skeletons below. */
export function Skeleton({ className }: { className?: string }): JSX.Element {
  return <div className={clsx('skeleton', className)} aria-hidden="true" />;
}

/** Placeholder for a `.card`-based stat tile (dashboards). */
export function SkeletonStatCard(): JSX.Element {
  return (
    <div className="card">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="mt-2 h-8 w-16" />
    </div>
  );
}

/** A row of `count` stat-card skeletons, matching the dashboards' grid. */
export function SkeletonStatCardRow({ count = 4 }: { count?: number }): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonStatCard key={i} />
      ))}
    </div>
  );
}

/** Placeholder for a paper/course card in a browse-style grid. */
export function SkeletonCard(): JSX.Element {
  return (
    <div className="card space-y-2">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

/** A grid of `count` card skeletons (papers browse, bookmarks, etc). */
export function SkeletonCardGrid({ count = 6 }: { count?: number }): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/** Placeholder rows for a list/table (users, audit logs, notifications). */
export function SkeletonRows({ count = 6 }: { count?: number }): JSX.Element {
  return (
    <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="ml-auto h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
