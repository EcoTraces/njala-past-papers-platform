import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../lib/apiClient';

const COOLDOWN_SECONDS = 60;
const SUCCESS_MESSAGE = 'If an account exists for this email, a reset link has been sent';

export function ForgotPassword(): JSX.Element {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown === 0) return;
    const timer = window.setInterval(() => setCooldown((remaining) => Math.max(remaining - 1, 0)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    setIsSubmitting(true);
    try {
      await api.post('/auth/password-reset/request', { email: email.trim() }, { auth: false });
      setSuccess(true);
      setCooldown(COOLDOWN_SECONDS);
    } catch {
      setError('Unable to send a reset link right now. Please try again later.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Link to="/" className="text-lg font-bold text-brand-700">Njala Past Papers</Link>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Forgot password?</h1>
          <p className="mt-1 text-sm text-slate-500">Enter the email address associated with your account.</p>
        </div>
        <form className="card space-y-4" onSubmit={(event) => void onSubmit(event)}>
          {success && <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">{SUCCESS_MESSAGE}</p>}
          {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div>
            <label className="label" htmlFor="reset-email">Email</label>
            <input
              id="reset-email"
              type="email"
              autoComplete="email"
              required
              className="input"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <button type="submit" className="btn-primary w-full" disabled={isSubmitting || cooldown > 0}>
            {isSubmitting ? 'Sending…' : cooldown > 0 ? `Try again in ${cooldown}s` : 'Send reset link'}
          </button>
          <p className="text-center text-sm text-slate-500">
            <Link to="/login" className="font-medium text-brand-700">Back to sign in</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
