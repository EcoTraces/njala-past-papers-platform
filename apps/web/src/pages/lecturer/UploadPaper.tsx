import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { EXAMINATION_TYPES, PAPER_TYPES } from '@njala/shared';
import { api, ApiError } from '../../lib/apiClient';
import { PageSpinner } from '../../components/Spinner';
import { useCourses, useAcademicYears, useSemesters } from '../../hooks/useReferenceData';

export function UploadPaper(): JSX.Element {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const [form, setForm] = useState({
    title: '',
    courseId: '',
    academicYearId: '',
    semesterId: '',
    examinationType: EXAMINATION_TYPES[0],
    paperType: PAPER_TYPES[0],
    examinationDate: '',
    durationMinutes: '',
  });

  const coursesQuery = useCourses();
  const yearsQuery = useAcademicYears();
  const semestersQuery = useSemesters();

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Select a PDF file');
      const body = new FormData();
      body.append('file', file);
      Object.entries(form).forEach(([key, value]) => {
        if (value) body.append(key, value);
      });
      body.append('filename', file.name);
      return api.post<{ id: string }>('/papers', body);
    },
    onSuccess: (paper) => navigate(`/app/papers/${paper.id}`),
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Upload failed. Please check the file and try again.'),
  });

  if (coursesQuery.isLoading || yearsQuery.isLoading || semestersQuery.isLoading) return <PageSpinner />;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Upload an examination paper</h1>

      <form
        className="card space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          upload.mutate();
        }}
      >
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div>
          <label className="label" htmlFor="title">Title</label>
          <input id="title" className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>

        <div>
          <label className="label" htmlFor="courseId">Course</label>
          <select id="courseId" className="input" required value={form.courseId} onChange={(e) => setForm({ ...form, courseId: e.target.value })}>
            <option value="">Select a course</option>
            {coursesQuery.data?.items.map((c) => <option key={c.id} value={c.id}>{c.code} - {c.title}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="academicYearId">Academic year</label>
            <select id="academicYearId" className="input" required value={form.academicYearId} onChange={(e) => setForm({ ...form, academicYearId: e.target.value })}>
              <option value="">Select</option>
              {yearsQuery.data?.items.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="semesterId">Semester</label>
            <select id="semesterId" className="input" required value={form.semesterId} onChange={(e) => setForm({ ...form, semesterId: e.target.value })}>
              <option value="">Select</option>
              {semestersQuery.data?.items
                .filter((s) => !form.academicYearId || s.academic_year_id === form.academicYearId)
                .map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="examinationType">Examination type</label>
            <select id="examinationType" className="input" value={form.examinationType} onChange={(e) => setForm({ ...form, examinationType: e.target.value as typeof form.examinationType })}>
              {EXAMINATION_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="paperType">Paper type</label>
            <select id="paperType" className="input" value={form.paperType} onChange={(e) => setForm({ ...form, paperType: e.target.value as typeof form.paperType })}>
              {PAPER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="examinationDate">Examination date</label>
            <input id="examinationDate" type="date" className="input" value={form.examinationDate} onChange={(e) => setForm({ ...form, examinationDate: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="durationMinutes">Duration (minutes)</label>
            <input id="durationMinutes" type="number" className="input" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="file">PDF file (max 25MB)</label>
          <input
            id="file"
            type="file"
            accept="application/pdf"
            required
            className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-md file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <button type="submit" className="btn-primary w-full" disabled={upload.isPending}>
          {upload.isPending ? 'Uploading…' : 'Upload as draft'}
        </button>
      </form>
    </div>
  );
}
