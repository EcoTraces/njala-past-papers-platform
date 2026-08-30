import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import * as Tabs from '@radix-ui/react-tabs';
import { useAuth } from '../../hooks/useAuth';
import { ApiError } from '../../lib/apiClient';

const studentSchema = z.object({ studentId: z.string().min(1, 'Student ID is required'), password: z.string().min(1, 'Password is required') });
const staffSchema = z.object({ email: z.string().email(), password: z.string().min(1, 'Password is required') });
type StudentLoginForm = z.infer<typeof studentSchema>;
type StaffLoginForm = z.infer<typeof staffSchema>;

export function Login(): JSX.Element {
  const { loginStudent, loginStaff } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: { pathname: string } } };
  const [serverError, setServerError] = useState<string | null>(null);
  const redirectTo = location.state?.from?.pathname ?? '/app';

  const studentForm = useForm<StudentLoginForm>({ resolver: zodResolver(studentSchema) });
  const staffForm = useForm<StaffLoginForm>({ resolver: zodResolver(staffSchema) });

  const onStudentSubmit = studentForm.handleSubmit(async (values) => {
    setServerError(null);
    try {
      await loginStudent(values.studentId, values.password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  });

  const onStaffSubmit = staffForm.handleSubmit(async (values) => {
    setServerError(null);
    try {
      await loginStaff(values.email, values.password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Link to="/" className="text-lg font-bold text-brand-700">Njala Past Papers</Link>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Sign in</h1>
        </div>

        <div className="card">
          <Tabs.Root defaultValue="student">
            <Tabs.List className="mb-6 flex rounded-md bg-slate-100 p-1" aria-label="Sign-in method">
              <Tabs.Trigger value="student" className="flex-1 rounded-md py-2 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow">
                Student
              </Tabs.Trigger>
              <Tabs.Trigger value="staff" className="flex-1 rounded-md py-2 text-sm font-medium data-[state=active]:bg-white data-[state=active]:shadow">
                Staff
              </Tabs.Trigger>
            </Tabs.List>

            {serverError && (
              <p role="alert" className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {serverError}
              </p>
            )}

            <Tabs.Content value="student">
              <form className="space-y-4" onSubmit={onStudentSubmit} noValidate>
                <div>
                  <label className="label" htmlFor="studentId">Student ID</label>
                  <input id="studentId" className="input" autoComplete="username" {...studentForm.register('studentId')} />
                  {studentForm.formState.errors.studentId && (
                    <p className="mt-1 text-sm text-red-600">{studentForm.formState.errors.studentId.message}</p>
                  )}
                </div>
                <div>
                  <label className="label" htmlFor="student-password">Password</label>
                  <input id="student-password" type="password" className="input" autoComplete="current-password" {...studentForm.register('password')} />
                  {studentForm.formState.errors.password && (
                    <p className="mt-1 text-sm text-red-600">{studentForm.formState.errors.password.message}</p>
                  )}
                </div>
                <button type="submit" className="btn-primary w-full" disabled={studentForm.formState.isSubmitting}>
                  {studentForm.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
                </button>
                <p className="text-center text-sm text-slate-500">
                  New here? <Link to="/signup" className="font-medium text-brand-700">Create a student account</Link>
                </p>
              </form>
            </Tabs.Content>

            <Tabs.Content value="staff">
              <form className="space-y-4" onSubmit={onStaffSubmit} noValidate>
                <div>
                  <label className="label" htmlFor="email">Email</label>
                  <input id="email" type="email" className="input" autoComplete="username" {...staffForm.register('email')} />
                  {staffForm.formState.errors.email && (
                    <p className="mt-1 text-sm text-red-600">{staffForm.formState.errors.email.message}</p>
                  )}
                </div>
                <div>
                  <label className="label" htmlFor="staff-password">Password</label>
                  <input id="staff-password" type="password" className="input" autoComplete="current-password" {...staffForm.register('password')} />
                  {staffForm.formState.errors.password && (
                    <p className="mt-1 text-sm text-red-600">{staffForm.formState.errors.password.message}</p>
                  )}
                </div>
                <button type="submit" className="btn-primary w-full" disabled={staffForm.formState.isSubmitting}>
                  {staffForm.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
                </button>
                <p className="text-center text-xs text-slate-400">
                  Staff accounts (lecturer, library staff, admin) are provisioned by an administrator.
                </p>
              </form>
            </Tabs.Content>
          </Tabs.Root>
        </div>
      </div>
    </div>
  );
}
