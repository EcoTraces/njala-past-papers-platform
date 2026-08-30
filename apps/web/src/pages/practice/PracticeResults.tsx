import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../lib/apiClient';
import { PageSpinner } from '../../components/Spinner';
import { CheckCircle2, XCircle, HelpCircle } from 'lucide-react';

interface SessionResponse {
  session: { id: string; status: string; total_marks: number; obtained_marks: number | null; percentage: number | null; time_spent_seconds: number };
  questions: Array<{ order_index: number; questions: { id: string; question_text: string; marks: number } }>;
  answers: Array<{ question_id: string; is_correct: boolean | null; marks_awarded: number | null; auto_marked: boolean }>;
}

export function PracticeResults(): JSX.Element {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ['practice-session', sessionId],
    queryFn: () => api.get<SessionResponse>(`/practice/sessions/${sessionId}`),
    enabled: Boolean(sessionId),
  });

  if (isLoading || !data) return <PageSpinner />;

  const answersByQuestion = new Map(data.answers.map((a) => [a.question_id, a]));
  const pendingManualMarking = data.answers.filter((a) => a.marks_awarded === null).length;

  return (
    <div className="space-y-6">
      <div className="card text-center">
        <p className="text-sm text-slate-500">Your score</p>
        <p className="text-4xl font-bold text-brand-700">{data.session.percentage ?? 0}%</p>
        <p className="mt-1 text-sm text-slate-500">
          {data.session.obtained_marks ?? 0} / {data.session.total_marks} marks
        </p>
        {pendingManualMarking > 0 && (
          <p className="mt-2 text-xs text-amber-600">{pendingManualMarking} answer(s) still awaiting manual marking - your score may change.</p>
        )}
      </div>

      <ol className="space-y-3">
        {data.questions.map(({ questions: q, order_index }) => {
          const answer = answersByQuestion.get(q.id);
          const Icon = answer?.is_correct === true ? CheckCircle2 : answer?.is_correct === false ? XCircle : HelpCircle;
          const color = answer?.is_correct === true ? 'text-green-600' : answer?.is_correct === false ? 'text-red-600' : 'text-slate-400';
          return (
            <li key={q.id} className="card flex items-start gap-3">
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${color}`} aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-slate-900">{order_index + 1}. {q.question_text}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {answer?.marks_awarded ?? 0} / {q.marks} marks {answer?.auto_marked ? '(auto-marked)' : answer ? '(awaiting/manual marking)' : ''}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <div className="flex justify-center gap-3">
        <Link to="/app/practice" className="btn-secondary">Practice again</Link>
        <Link to="/app/practice/attempts" className="btn-primary">View all attempts</Link>
      </div>
    </div>
  );
}
