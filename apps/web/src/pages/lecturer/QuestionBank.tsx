import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QUESTION_TYPES, type QuestionType } from '@njala/shared';
import { api, ApiError } from '../../lib/apiClient';
import { PageSpinner } from '../../components/Spinner';
import { SkeletonRows } from '../../components/Skeleton';
import { EmptyState } from '../../components/EmptyState';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { useAuth } from '../../hooks/useAuth';
import { useCourses } from '../../hooks/useReferenceData';

interface QuestionItem {
  id: string;
  question_text: string;
  question_type: QuestionType;
  marks: number;
  verification_status: 'UNVERIFIED' | 'VERIFIED' | 'REJECTED';
}

const emptyOption = () => ({ optionLabel: '', optionText: '', isCorrect: false });

export function QuestionBank(): JSX.Element {
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [courseId, setCourseId] = useState('');
  const [questionText, setQuestionText] = useState('');
  const [questionType, setQuestionType] = useState<QuestionType>('MULTIPLE_CHOICE');
  const [marks, setMarks] = useState(1);
  const [options, setOptions] = useState([emptyOption(), emptyOption()]);
  const [expectedAnswer, setExpectedAnswer] = useState('');
  const [pendingReject, setPendingReject] = useState<QuestionItem | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  const coursesQuery = useCourses();
  const questionsQuery = useQuery({
    queryKey: ['questions', courseId],
    queryFn: () => api.get<{ items: QuestionItem[] }>(`/questions${courseId ? `?courseId=${courseId}` : ''}`),
  });

  const canVerify = hasRole('LIBRARY_STAFF', 'ADMIN', 'SUPER_ADMIN');

  const createQuestion = useMutation({
    mutationFn: () =>
      api.post('/questions', {
        courseId,
        questionText,
        questionType,
        marks,
        options: ['MULTIPLE_CHOICE', 'TRUE_FALSE'].includes(questionType) ? options : undefined,
        expectedAnswer: questionType === 'NUMERICAL' ? expectedAnswer : undefined,
      }),
    onSuccess: () => {
      setQuestionText('');
      setOptions([emptyOption(), emptyOption()]);
      setExpectedAnswer('');
      void queryClient.invalidateQueries({ queryKey: ['questions'] });
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not create question'),
  });

  const verify = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => api.post(`/questions/${id}/verify`, { approve }),
    onSuccess: () => {
      setPendingReject(null);
      setVerifyError(null);
      queryClient.invalidateQueries({ queryKey: ['questions'] });
    },
    onError: (err) => setVerifyError(err instanceof ApiError ? err.message : 'Could not update this question. Please try again.'),
  });

  if (coursesQuery.isLoading) return <PageSpinner />;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold text-slate-900">Question bank</h1>

      <form
        className="card space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          createQuestion.mutate();
        }}
      >
        <h2 className="text-sm font-semibold text-slate-900">Add a question</h2>
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div>
          <label className="label" htmlFor="qcourse">Course</label>
          <select id="qcourse" className="input" required value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            <option value="">Select a course</option>
            {coursesQuery.data?.items.map((c) => <option key={c.id} value={c.id}>{c.code} - {c.title}</option>)}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="qtext">Question text</label>
          <textarea id="qtext" className="input" rows={3} required value={questionText} onChange={(e) => setQuestionText(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="qtype">Type</label>
            <select id="qtype" className="input" value={questionType} onChange={(e) => setQuestionType(e.target.value as QuestionType)}>
              {QUESTION_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="qmarks">Marks</label>
            <input id="qmarks" type="number" min={1} className="input" value={marks} onChange={(e) => setMarks(Number(e.target.value))} />
          </div>
        </div>

        {(questionType === 'MULTIPLE_CHOICE' || questionType === 'TRUE_FALSE') && (
          <div className="space-y-2">
            <p className="label">Options (mark the correct one)</p>
            {options.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  className="input w-16"
                  placeholder="A"
                  value={opt.optionLabel}
                  onChange={(e) => setOptions(options.map((o, i) => (i === idx ? { ...o, optionLabel: e.target.value } : o)))}
                />
                <input
                  className="input"
                  placeholder="Option text"
                  value={opt.optionText}
                  onChange={(e) => setOptions(options.map((o, i) => (i === idx ? { ...o, optionText: e.target.value } : o)))}
                />
                <label className="flex items-center gap-1 text-xs text-slate-600">
                  <input
                    type="radio"
                    name="correct-option"
                    checked={opt.isCorrect}
                    onChange={() => setOptions(options.map((o, i) => ({ ...o, isCorrect: i === idx })))}
                  />
                  Correct
                </label>
              </div>
            ))}
            <button type="button" className="btn-secondary" onClick={() => setOptions([...options, emptyOption()])}>Add option</button>
          </div>
        )}

        {questionType === 'NUMERICAL' && (
          <div>
            <label className="label" htmlFor="expected">Expected numerical answer</label>
            <input id="expected" className="input" value={expectedAnswer} onChange={(e) => setExpectedAnswer(e.target.value)} />
          </div>
        )}

        <button type="submit" className="btn-primary" disabled={createQuestion.isPending}>
          {createQuestion.isPending ? 'Saving…' : 'Add question'}
        </button>
      </form>

      <section>
        <h2 className="mb-3 text-lg font-medium text-slate-900">Questions {courseId && '(filtered by course)'}</h2>
        {verifyError && <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{verifyError}</p>}
        {questionsQuery.isLoading ? (
          <SkeletonRows count={5} />
        ) : !questionsQuery.data || questionsQuery.data.items.length === 0 ? (
          <EmptyState
            title="No questions yet"
            description={courseId ? 'No questions have been added for this course yet.' : 'Add a question above to start building the question bank.'}
          />
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {questionsQuery.data.items.map((q) => (
              <li key={q.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm text-slate-900">{q.question_text}</p>
                  <p className="text-xs text-slate-500">{q.question_type.replace(/_/g, ' ')} - {q.marks} marks - {q.verification_status}</p>
                </div>
                {canVerify && q.verification_status === 'UNVERIFIED' && (
                  <div className="flex shrink-0 gap-2">
                    <button type="button" className="btn-secondary" onClick={() => verify.mutate({ id: q.id, approve: true })} disabled={verify.isPending}>Verify</button>
                    <button type="button" className="btn-danger" onClick={() => setPendingReject(q)} disabled={verify.isPending}>Reject</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={pendingReject !== null}
        onOpenChange={(open) => !open && setPendingReject(null)}
        title="Reject this question?"
        description="It stays in the bank as REJECTED and won't be usable in any practice session until it's edited and re-verified."
        confirmLabel="Reject question"
        destructive
        onConfirm={() => pendingReject && verify.mutate({ id: pendingReject.id, approve: false })}
        isLoading={verify.isPending}
      />
    </div>
  );
}
