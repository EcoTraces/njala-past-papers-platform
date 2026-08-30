import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/apiClient';
import { PageSpinner } from '../../components/Spinner';
import type { QuestionType } from '@njala/shared';

interface SessionQuestion {
  order_index: number;
  questions: {
    id: string;
    question_text: string;
    question_type: QuestionType;
    marks: number;
    section: string | null;
    question_number: string | null;
    question_options: Array<{ id: string; option_label: string; option_text: string; order_index: number }>;
  };
}

interface SessionAnswer {
  question_id: string;
  selected_option_id: string | null;
  answer_text: string | null;
  numerical_answer: number | null;
}

interface SessionResponse {
  session: { id: string; status: string; total_questions: number };
  questions: SessionQuestion[];
  answers: SessionAnswer[];
}

export function PracticeSession(): JSX.Element {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [savingId, setSavingId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['practice-session', sessionId],
    queryFn: () => api.get<SessionResponse>(`/practice/sessions/${sessionId}`),
    enabled: Boolean(sessionId),
  });

  const answersByQuestion = useMemo(() => {
    const map = new Map<string, SessionAnswer>();
    data?.answers.forEach((a) => map.set(a.question_id, a));
    return map;
  }, [data]);

  const saveAnswer = useMutation({
    mutationFn: (payload: { questionId: string; selectedOptionId?: string; answerText?: string; numericalAnswer?: number }) =>
      api.post(`/practice/sessions/${sessionId}/answers`, payload),
    onMutate: (payload) => setSavingId(payload.questionId),
    onSettled: () => {
      setSavingId(null);
      void queryClient.invalidateQueries({ queryKey: ['practice-session', sessionId] });
    },
  });

  const submitSession = useMutation({
    mutationFn: () => api.post(`/practice/sessions/${sessionId}/submit`),
    onSuccess: () => navigate(`/app/practice/${sessionId}/results`),
  });

  const pauseSession = useMutation({
    mutationFn: () => api.post(`/practice/sessions/${sessionId}/pause`),
    onSuccess: () => navigate('/app/practice/attempts'),
  });

  const resumeSession = useMutation({
    mutationFn: () => api.post(`/practice/sessions/${sessionId}/resume`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['practice-session', sessionId] }),
  });

  // A student returning to a PAUSED session (via "My attempts") picks
  // up answering immediately - resume it server-side so time tracking
  // starts a fresh active segment instead of undercounting.
  useEffect(() => {
    if (data?.session.status === 'PAUSED' && !resumeSession.isPending && !resumeSession.isSuccess) {
      resumeSession.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.session.status]);

  if (isLoading || !data) return <PageSpinner />;

  const answeredCount = data.answers.length;

  return (
    <div className="space-y-6 pb-24">
      <div className="sticky top-14 z-10 -mx-4 border-b border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-slate-900">Practice session</h1>
          <span className="text-sm text-slate-500">{answeredCount} / {data.questions.length} answered</span>
        </div>
      </div>

      <ol className="space-y-6">
        {data.questions.map(({ questions: q, order_index }) => {
          const existing = answersByQuestion.get(q.id);
          return (
            <li key={q.id} className="card">
              <p className="mb-3 text-sm font-medium text-slate-900">
                {order_index + 1}. {q.question_text} <span className="text-xs text-slate-400">({q.marks} marks)</span>
              </p>

              {(q.question_type === 'MULTIPLE_CHOICE' || q.question_type === 'TRUE_FALSE') && (
                <div className="space-y-2">
                  {q.question_options.map((opt) => (
                    <label key={opt.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name={`q-${q.id}`}
                        checked={existing?.selected_option_id === opt.id}
                        onChange={() => saveAnswer.mutate({ questionId: q.id, selectedOptionId: opt.id })}
                      />
                      <span>{opt.option_label}. {opt.option_text}</span>
                    </label>
                  ))}
                </div>
              )}

              {q.question_type === 'NUMERICAL' && (
                <input
                  type="number"
                  className="input"
                  defaultValue={existing?.numerical_answer ?? ''}
                  onBlur={(e) => e.target.value && saveAnswer.mutate({ questionId: q.id, numericalAnswer: Number(e.target.value) })}
                />
              )}

              {(q.question_type === 'SHORT_ANSWER' || q.question_type === 'ESSAY' || q.question_type === 'MIXED') && (
                <textarea
                  className="input"
                  rows={q.question_type === 'ESSAY' ? 6 : 2}
                  defaultValue={existing?.answer_text ?? ''}
                  onBlur={(e) => e.target.value && saveAnswer.mutate({ questionId: q.id, answerText: e.target.value })}
                />
              )}

              {savingId === q.id && <p className="mt-1 text-xs text-slate-400">Saving…</p>}
            </li>
          );
        })}
      </ol>

      <div className="fixed inset-x-0 bottom-0 border-t border-slate-200 bg-white p-4">
        <div className="mx-auto flex max-w-3xl justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => pauseSession.mutate()} disabled={pauseSession.isPending}>
            {pauseSession.isPending ? 'Saving…' : 'Save & exit'}
          </button>
          <button type="button" className="btn-primary" onClick={() => submitSession.mutate()} disabled={submitSession.isPending}>
            {submitSession.isPending ? 'Submitting…' : 'Submit practice session'}
          </button>
        </div>
      </div>
    </div>
  );
}
