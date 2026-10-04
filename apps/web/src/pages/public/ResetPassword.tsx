import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { PasswordInput } from '../../components/PasswordInput';
import { api } from '../../lib/apiClient';
import { supabase } from '../../lib/supabaseClient';

type RecoveryState = 'checking' | 'ready' | 'invalid';

function passwordStrength(password: string): string {
  if (!password) return 'Use at least 12 characters. A longer mix of letters, numbers, and symbols is stronger.';
  if (password.length < 12) return `Add ${12 - password.length} more character${12 - password.length === 1 ? '' : 's'} to meet the minimum.`;

  const variety = [/[a-z]/.test(password), /[A-Z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)]
    .filter(Boolean).length;
  if (password.length >= 16 && variety >= 3) return 'Strong password.';
  if (variety >= 2) return 'Good password; a longer mix of characters is stronger.';
  return 'Consider mixing uppercase and lowercase letters, numbers, and symbols.';
}

export function ResetPassword(): JSX.Element {
  const navigate = useNavigate();
  const [recoveryState, setRecoveryState] = useState<RecoveryState>('checking');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let active = true;
    let timeout: number | undefined;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const query = new URLSearchParams(window.location.search);
    const recoveryUrl = hash.get('type') === 'recovery' || query.has('code');

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (active && event === 'PASSWORD_RECOVERY') {
        if (timeout !== undefined) window.clearTimeout(timeout);
        setRecoveryState('ready');
      }
    });

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) {
        setRecoveryState((state) => state === 'ready' ? state : 'invalid');
        return;
      }
      if (data.session && recoveryUrl) {
        setRecoveryState('ready');
        return;
      }
      if (!recoveryUrl) {
        setRecoveryState('invalid');
        return;
      }
      timeout = window.setTimeout(() => {
        if (active) setRecoveryState((state) => state === 'checking' ? 'invalid' : state);
      }, 3000);
    });

    return () => {
      active = false;
      if (timeout !== undefined) window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => navigate('/login', { replace: true }), 2500);
    return () => window.clearTimeout(timer);
  }, [navigate, success]);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    if (newPassword.length < 12) {
      setError('Your new password must be at least 12 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.get<{ eligible: boolean }>('/auth/password/change/eligibility');
    } catch {
      setError('This account is not currently eligible to reset its password. Contact an administrator for help.');
      setIsSubmitting(false);
      return;
    }

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) {
        setError('Unable to reset your password. The link may have expired; request a new one and try again.');
        return;
      }

      setNewPassword('');
      setConfirmPassword('');
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        setError('Your password was updated, but we could not sign you out. Please sign out before continuing.');
        return;
      }
      setSuccess(true);
    } catch {
      setError('Unable to reset your password. The link may have expired; request a new one and try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Link to="/" className="text-lg font-bold text-brand-700">Njala Past Papers</Link>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Reset your password</h1>
        </div>
        {recoveryState === 'checking' ? (
          <div role="status" className="card text-center text-sm text-slate-600">Verifying your reset link…</div>
        ) : recoveryState === 'invalid' ? (
          <div className="card space-y-3 text-center">
            <p role="alert" className="text-sm text-red-700">This password reset link is invalid or has expired.</p>
            <Link to="/forgot-password" className="font-medium text-brand-700 hover:underline">Request a new reset link</Link>
          </div>
        ) : (
          <form className="card space-y-4" onSubmit={(event) => void onSubmit(event)}>
            {success && <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Your password has been reset. Redirecting you to sign in…</p>}
            {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div>
              <label className="label" htmlFor="new-password">New password</label>
              <PasswordInput
                id="new-password"
                className="input"
                autoComplete="new-password"
                required
                minLength={12}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
              <p className="mt-1 text-sm text-slate-500">{passwordStrength(newPassword)}</p>
            </div>
            <div>
              <label className="label" htmlFor="confirm-password">Confirm password</label>
              <PasswordInput
                id="confirm-password"
                className="input"
                autoComplete="new-password"
                required
                minLength={12}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={isSubmitting || success}>
              {isSubmitting ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
