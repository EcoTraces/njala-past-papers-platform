import clsx from 'clsx';
import type { PaperStatus } from '@njala/shared';

const STYLES: Record<PaperStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  SUBMITTED: 'bg-amber-100 text-amber-800',
  UNDER_REVIEW: 'bg-blue-100 text-blue-800',
  APPROVED: 'bg-teal-100 text-teal-800',
  PUBLISHED: 'bg-green-100 text-green-800',
  ARCHIVED: 'bg-slate-200 text-slate-600',
  REJECTED: 'bg-red-100 text-red-800',
};

export function StatusBadge({ status }: { status: PaperStatus }): JSX.Element {
  return <span className={clsx('badge', STYLES[status])}>{status.replace(/_/g, ' ')}</span>;
}
