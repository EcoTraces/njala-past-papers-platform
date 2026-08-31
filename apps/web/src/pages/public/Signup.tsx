import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { studentSignupSchema, type StudentSignupInput } from '@njala/shared';
import { useAuth } from '../../hooks/useAuth';
import { api, ApiError } from '../../lib/apiClient';
import { Spinner } from '../../components/Spinner';

interface ProgrammeOption {
  id: string;
  name: string;
  code: string;
  departments: { name: string; faculties: { name: string } } | null;
}

export function Signup(): JSX.Element {
  const { signupStudent } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const programmesQuery = useQuery({
    queryKey: ['public-programmes'],
    queryFn: () => api.get<{ items: ProgrammeOption[] }>('/public/programmes', { auth: false }),
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<StudentSignupInput>({ resolver: zodResolver(studentSignupSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      const profile = await signupStudent(values);
      // New accounts start PENDING until a library staff member/admin
      // activates them (see SECURITY.md) - never route straight into
      // the app shell for an account that can't call any API yet.
      navigate(profile.status === 'ACTIVE' ? '/app' : '/account-pending', { replace: true });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Link to="/" className="text-lg font-bold text-brand-700">Njala Past Papers</Link>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Create your student account</h1>
          <p className="mt-1 text-sm text-slate-500">Only students can self-register. Staff accounts are provisioned by an administrator.</p>
        </div>

        <form className="card space-y-4" onSubmit={onSubmit} noValidate>
          {serverError && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{serverError}</p>
          )}

          <div>
            <label className="label" htmlFor="fullName">Full name</label>
            <input
              id="fullName"
              className="input"
              aria-invalid={errors.fullName ? true : undefined}
              aria-describedby={errors.fullName ? 'fullName-error' : undefined}
              {...register('fullName')}
            />
            {errors.fullName && <p id="fullName-error" role="alert" className="mt-1 text-sm text-red-600">{errors.fullName.message}</p>}
          </div>

          <div>
            <label className="label" htmlFor="studentId">Student ID</label>
            <input
              id="studentId"
              className="input"
              autoComplete="username"
              aria-invalid={errors.studentId ? true : undefined}
              aria-describedby={errors.studentId ? 'studentId-error' : undefined}
              {...register('studentId')}
            />
            {errors.studentId && <p id="studentId-error" role="alert" className="mt-1 text-sm text-red-600">{errors.studentId.message}</p>}
          </div>

          <div>
            <label className="label" htmlFor="programmeId">Programme</label>
            {programmesQuery.isLoading ? (
              <Spinner label="Loading programmes" />
            ) : (
              <select
                id="programmeId"
                className="input"
                aria-invalid={errors.programmeId ? true : undefined}
                aria-describedby={errors.programmeId ? 'programmeId-error' : undefined}
                {...register('programmeId')}
              >
                <option value="">Select your programme</option>
                {programmesQuery.data?.items.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} - {p.name} ({p.departments?.faculties.name})
                  </option>
                ))}
              </select>
            )}
            {errors.programmeId && <p id="programmeId-error" role="alert" className="mt-1 text-sm text-red-600">{errors.programmeId.message}</p>}
          </div>

          <div>
            <label className="label" htmlFor="entryYear">Entry year</label>
            <input
              id="entryYear"
              type="number"
              className="input"
              aria-invalid={errors.entryYear ? true : undefined}
              aria-describedby={errors.entryYear ? 'entryYear-error' : undefined}
              {...register('entryYear', { valueAsNumber: true })}
            />
            {errors.entryYear && <p id="entryYear-error" role="alert" className="mt-1 text-sm text-red-600">{errors.entryYear.message}</p>}
          </div>

          <div>
            <label className="label" htmlFor="contactEmail">Contact email (optional, used for password resets)</label>
            <input
              id="contactEmail"
              type="email"
              className="input"
              aria-invalid={errors.contactEmail ? true : undefined}
              aria-describedby={errors.contactEmail ? 'contactEmail-error' : undefined}
              {...register('contactEmail')}
            />
            {errors.contactEmail && <p id="contactEmail-error" role="alert" className="mt-1 text-sm text-red-600">{errors.contactEmail.message}</p>}
          </div>

          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="input"
              autoComplete="new-password"
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? 'password-error' : undefined}
              {...register('password')}
            />
            {errors.password && <p id="password-error" role="alert" className="mt-1 text-sm text-red-600">{errors.password.message}</p>}
          </div>

          <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account…' : 'Create account'}
          </button>

          <p className="text-center text-sm text-slate-500">
            Already have an account? <Link to="/login" className="font-medium text-brand-700">Sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
