import { useState, type FormEvent } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { PasswordInput } from '../../components/PasswordInput';
import { api, ApiError } from '../../lib/apiClient';
import { supabase } from '../../lib/supabaseClient';

export function Profile(): JSX.Element {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!user) return <></>;

  async function onChangePassword(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setMessage(null);
    setError(null);
    if (newPassword.length < 12) {
      setError('Your new password must be at least 12 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.get<{ eligible: boolean }>('/auth/password/change/eligibility');
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      if (authError || !authUser?.email) {
        throw new Error('Your session could not be verified. Please sign in again.');
      }

      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: authUser.email,
        password: currentPassword,
      });
      if (reauthError) {
        throw new Error('Current password is incorrect.');
      }

      await api.get<{ eligible: boolean }>('/auth/password/change/eligibility');
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw new Error('Unable to update your password. Please try again.');

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage('Your password has been changed.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Unable to update your password. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold text-slate-900">Profile</h1>
      <div className="card space-y-3">
        <Field label="Full name" value={user.fullName} />
        {user.studentId && <Field label="Student ID" value={user.studentId} />}
        {user.staffId && <Field label="Staff ID" value={user.staffId} />}
        <Field label="Roles" value={user.roles.join(', ')} />
        <Field label="Status" value={user.status} />
      </div>
      <form className="card space-y-4" onSubmit={(event) => void onChangePassword(event)}>
        <h2 className="text-lg font-semibold text-slate-900">Change password</h2>
        {message && <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{message}</p>}
        {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div>
          <label className="label" htmlFor="current-password">Current password</label>
          <PasswordInput
            id="current-password"
            className="input"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="profile-new-password">New password</label>
          <PasswordInput
            id="profile-new-password"
            className="input"
            autoComplete="new-password"
            required
            minLength={12}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <p className="mt-1 text-sm text-slate-500">Use at least 12 characters.</p>
        </div>
        <div>
          <label className="label" htmlFor="profile-confirm-password">Confirm new password</label>
          <PasswordInput
            id="profile-confirm-password"
            className="input"
            autoComplete="new-password"
            required
            minLength={12}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Updating…' : 'Change password'}
        </button>
      </form>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div>
      <p className="text-xs uppercase text-slate-500">{label}</p>
      <p className="font-medium text-slate-900">{value}</p>
    </div>
  );
}
