import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { Bookmark, BookmarkCheck, Download, FileWarning } from 'lucide-react';
import { api, ApiError } from '../../lib/apiClient';
import { useAuth } from '../../hooks/useAuth';
import { PageSpinner } from '../../components/Spinner';
import { StatusBadge } from '../../components/StatusBadge';
import type { PaperStatus } from '@njala/shared';

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

export function PaperDetail(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { hasRole, user } = useAuth();
  const queryClient = useQueryClient();
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);

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
      invalidate();
    },
    onError: (err) => setActionError(err instanceof ApiError ? err.message : 'Action failed'),
  });

  const bookmark = useMutation({
    mutationFn: (add: boolean) => (add ? api.post(`/papers/${id}/bookmark`) : api.delete(`/papers/${id}/bookmark`)),
  });

  const loadViewer = async () => {
    const res = await api.get<{ url: string }>(`/papers/${id}/download-url`);
    setViewerUrl(res.url);
  };

  const download = async () => {
    const res = await api.get<{ url: string }>(`/papers/${id}/download-url`);
    window.open(res.url, '_blank', 'noopener,noreferrer');
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
        <div className="flex gap-2">
          {hasRole('STUDENT') && (
            <button type="button" className="btn-secondary" onClick={() => bookmark.mutate(true)}>
              {bookmark.isSuccess ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />} Bookmark
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={() => void loadViewer()}>View</button>
          <button type="button" className="btn-primary" onClick={() => void download()}>
            <Download className="h-4 w-4" aria-hidden="true" /> Download
          </button>
        </div>
      </div>

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

      {viewerUrl && (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <iframe title={`Preview of ${paper.title}`} src={viewerUrl} className="h-[70vh] w-full" />
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
              <button type="button" className="btn-primary" onClick={() => transition.mutate('approve')}>Approve</button>
            )}
            {isReviewer && paper.status === 'APPROVED' && (
              <button type="button" className="btn-primary" onClick={() => transition.mutate('publish')}>Publish</button>
            )}
            {isReviewer && ['SUBMITTED', 'UNDER_REVIEW'].includes(paper.status) && (
              <button type="button" className="btn-danger" onClick={() => setShowRejectForm(true)}>Reject</button>
            )}
            {isReviewer && paper.status === 'PUBLISHED' && (
              <button type="button" className="btn-secondary" onClick={() => transition.mutate('archive')}>Archive</button>
            )}
          </div>

          {showRejectForm && (
            <div className="mt-4 space-y-2">
              <label className="label" htmlFor="reject-reason">Rejection reason</label>
              <textarea id="reject-reason" className="input" rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
              <div className="flex gap-2">
                <button type="button" className="btn-danger" disabled={!rejectReason} onClick={() => transition.mutate('reject')}>Confirm rejection</button>
                <button type="button" className="btn-secondary" onClick={() => setShowRejectForm(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
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
