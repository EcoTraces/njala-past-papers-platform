import { lazy, Suspense, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Bookmark, BookmarkCheck, Download, FileWarning, Loader2 } from 'lucide-react';
import { api, ApiError } from '../../lib/apiClient';
import { useAuth } from '../../hooks/useAuth';
import { PageSpinner } from '../../components/Spinner';
import { StatusBadge } from '../../components/StatusBadge';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import type { PaperStatus } from '@njala/shared';

// pdfjs-dist is a large library (>1MB with its worker) that most page
// loads never need - lazy-loading it keeps it out of the main bundle
// entirely until a user actually clicks "View" on a paper.
const PdfViewer = lazy(() => import('../../components/PdfViewer').then((m) => ({ default: m.PdfViewer })));

interface PaperDetailResponse {
  id: string;
  title: string;
  status: PaperStatus;
  examination_type: string;
  paper_type: string;
  examination_date: string | null;
  duration_minutes: number | null;
  rejection_reason: string | null;
  page_count: number | null;
  uploaded_by: string;
  courses: { code: string; title: string } | null;
  faculties: { name: string } | null;
  departments: { name: string } | null;
  academic_years: { name: string } | null;
  semesters: { name: string } | null;
}

type PendingAction = 'approve' | 'publish' | 'archive' | 'reject' | null;

export function PaperDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { hasRole, user } = useAuth();
  const queryClient = useQueryClient();
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const { data: paper, isLoading } = useQuery({
    queryKey: ['paper', id],
    queryFn: () => api.get<PaperDetailResponse>(`/papers/${id}`),
    enabled: Boolean(id),
  });

  const isStaff = hasRole('LECTURER', 'LIBRARY_STAFF', 'ADMIN', 'SUPER_ADMIN');
  const isReviewer = hasRole('LIBRARY_STAFF', 'ADMIN', 'SUPER_ADMIN');
  const isOwner = paper?.uploaded_by === user?.id;

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['paper', id] });

  const transition = useMutation({
    mutationFn: (action: string) => api.post(`/papers/${id}/${action}`, action === 'reject' ? { reason: rejectReason } : {}),
    onSuccess: () => {
      setActionError(null);
      setShowRejectForm(false);
      setRejectReason('');
      setPendingAction(null);
      invalidate();
    },
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : 'Action failed. Please try again.');
      setPendingAction(null);
    },
  });

  const bookmark = useMutation({
    mutationFn: (add: boolean) => (add ? api.post(`/papers/${id}/bookmark`) : api.delete(`/papers/${id}/bookmark`)),
  });

  const loadViewer = async () => {
    setViewerError(null);
    setViewerLoading(true);
    try {
      const res = await api.get<{ url: string }>(`/papers/${id}/download-url`);
      setViewerUrl(res.url);
    } catch (err) {
      setViewerError(err instanceof ApiError ? err.message : 'Could not load the document preview. Please try again.');
    } finally {
      setViewerLoading(false);
    }
  };

  const download = async () => {
    setViewerError(null);
    setDownloadLoading(true);
    try {
      const res = await api.get<{ url: string }>(`/papers/${id}/download-url`);
      window.open(res.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setViewerError(err instanceof ApiError ? err.message : 'Could not start the download. Please try again.');
    } finally {
      setDownloadLoading(false);
    }
  };

  if (isLoading || !paper) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase text-brand-600">{paper.courses?.code} - {paper.courses?.title}</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{paper.title}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <StatusBadge status={paper.status} />
            <span className="badge bg-slate-100 text-slate-700">{paper.examination_type.replace(/_/g, ' ')}</span>
            <span className="badge bg-slate-100 text-slate-700">{paper.paper_type}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasRole('STUDENT') && (
            <button type="button" className="btn-secondary" onClick={() => bookmark.mutate(true)}>
              {bookmark.isSuccess ? <BookmarkCheck className="h-4 w-4" aria-hidden="true" /> : <Bookmark className="h-4 w-4" aria-hidden="true" />} Bookmark
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={() => void loadViewer()} disabled={viewerLoading}>
            {viewerLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {viewerLoading ? 'Loading…' : 'View'}
          </button>
          <button type="button" className="btn-primary" onClick={() => void download()} disabled={downloadLoading}>
            {downloadLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
            Download
          </button>
        </div>
      </div>

      {viewerError && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{viewerError}</p>
      )}

      <dl className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 bg-white p-5 text-sm sm:grid-cols-4">
        <Field label="Faculty" value={paper.faculties?.name} />
        <Field label="Department" value={paper.departments?.name} />
        <Field label="Academic year" value={paper.academic_years?.name} />
        <Field label="Semester" value={paper.semesters?.name} />
        <Field label="Examination date" value={paper.examination_date ?? 'Not set'} />
        <Field label="Duration" value={paper.duration_minutes ? `${paper.duration_minutes} minutes` : 'Not set'} />
        <Field label="Pages" value={paper.page_count?.toString() ?? 'Processing…'} />
      </dl>

      {paper.status === 'REJECTED' && paper.rejection_reason && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <FileWarning className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Rejected: {paper.rejection_reason}</span>
        </div>
      )}

      {viewerLoading && !viewerUrl && (
        <div className="skeleton h-[70vh] w-full" />
      )}

      {viewerUrl && (
        <div className="h-[70vh]">
          <Suspense fallback={<div className="skeleton h-full w-full" />}>
            <PdfViewer url={viewerUrl} title={paper.title} />
          </Suspense>
        </div>
      )}

      {isStaff && (isOwner || isReviewer) && (
        <div className="card">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Workflow actions</h2>
          {actionError && <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>}
          <div className="flex flex-wrap gap-2">
            {isOwner && paper.status === 'DRAFT' && (
              <button type="button" className="btn-primary" onClick={() => transition.mutate('submit')}>Submit for review</button>
            )}
            {isReviewer && paper.status === 'SUBMITTED' && (
              <button type="button" className="btn-secondary" onClick={() => transition.mutate('review')}>Start review</button>
            )}
            {isReviewer && paper.status === 'UNDER_REVIEW' && (
              <button type="button" className="btn-primary" onClick={() => setPendingAction('approve')}>Approve</button>
            )}
            {isReviewer && paper.status === 'APPROVED' && (
              <button type="button" className="btn-primary" onClick={() => setPendingAction('publish')}>Publish</button>
            )}
            {isReviewer && ['SUBMITTED', 'UNDER_REVIEW'].includes(paper.status) && (
              <button type="button" className="btn-danger" onClick={() => setShowRejectForm(true)}>Reject</button>
            )}
            {isReviewer && paper.status === 'PUBLISHED' && (
              <button type="button" className="btn-secondary" onClick={() => setPendingAction('archive')}>Archive</button>
            )}
          </div>

          {showRejectForm && (
            <div className="mt-4 space-y-2">
              <label className="label" htmlFor="reject-reason">Rejection reason</label>
              <textarea id="reject-reason" className="input" rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
              <div className="flex gap-2">
                <button type="button" className="btn-danger" disabled={!rejectReason} onClick={() => setPendingAction('reject')}>Confirm rejection</button>
                <button type="button" className="btn-secondary" onClick={() => setShowRejectForm(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={pendingAction === 'approve'}
        onOpenChange={(open) => !open && setPendingAction(null)}
        title="Approve this paper?"
        description="The paper moves to Approved status and becomes ready to publish. Reviewers will still be able to review it again before it goes live."
        confirmLabel="Approve"
        onConfirm={() => transition.mutate('approve')}
        isLoading={transition.isPending}
      />
      <ConfirmDialog
        open={pendingAction === 'publish'}
        onOpenChange={(open) => !open && setPendingAction(null)}
        title="Publish this paper?"
        description="Publishing makes this paper immediately visible and downloadable to every student on the platform. Make sure the content and metadata are correct first."
        confirmLabel="Publish"
        onConfirm={() => transition.mutate('publish')}
        isLoading={transition.isPending}
      />
      <ConfirmDialog
        open={pendingAction === 'archive'}
        onOpenChange={(open) => !open && setPendingAction(null)}
        title="Archive this paper?"
        description="Archiving removes this paper from student search and browsing. It can be found again later, but won't be discoverable until it's republished."
        confirmLabel="Archive"
        onConfirm={() => transition.mutate('archive')}
        isLoading={transition.isPending}
      />
      <ConfirmDialog
        open={pendingAction === 'reject'}
        onOpenChange={(open) => !open && setPendingAction(null)}
        title="Reject this paper?"
        description={`The uploader will see this reason and the paper returns to draft: "${rejectReason}"`}
        confirmLabel="Reject paper"
        destructive
        onConfirm={() => transition.mutate('reject')}
        isLoading={transition.isPending}
      />
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }): JSX.Element {
  return (
    <div>
      <dt className="text-xs uppercase text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-900">{value ?? '—'}</dd>
    </div>
  );
}
