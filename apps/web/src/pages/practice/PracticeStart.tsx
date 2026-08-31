import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../lib/apiClient';
import { PageSpinner } from '../../components/Spinner';
import { useCourses } from '../../hooks/useReferenceData';

interface PracticeSession {
  id: string;
}

export function PracticeStart(): JSX.Element {
  const navigate = useNavigate();
  const [courseId, setCourseId] = useState('');
  const [questionCount, setQuestionCount] = useState(10);
  const [error, setError] = useState<string | null>(null);

  const coursesQuery = useCourses();

  const startSession = useMutation({
    mutationFn: () => api.post<PracticeSession>('/practice/sessions', { courseId, questionCount }),
    onSuccess: (session) => navigate(`/app/practice/${session.id}`),
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Could not start a practice session'),
  });

  if (coursesQuery.isLoading) return <PageSpinner />;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Start a practice session</h1>
        <p className="text-slate-600">Pick a course and how many questions you want to attempt.</p>
      </div>

      <form
        className="card space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startSession.mutate();
        }}
      >
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div>
          <label className="label" htmlFor="course">Course</label>
          <select id="course" className="input" value={courseId} onChange={(e) => setCourseId(e.target.value)} required>
            <option value="">Select a course</option>
            {coursesQuery.data?.items.map((c) => (
              <option key={c.id} value={c.id}>{c.code} - {c.title}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="count">Number of questions</label>
          <input
            id="count"
            type="number"
            min={1}
            max={50}
            className="input"
            value={questionCount}
            onChange={(e) => setQuestionCount(Number(e.target.value))}
          />
        </div>

        <button type="submit" className="btn-primary w-full" disabled={!courseId || startSession.isPending}>
          {startSession.isPending ? 'Starting…' : 'Start practicing'}
        </button>
      </form>
    </div>
  );
}
