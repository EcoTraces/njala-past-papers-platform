import { Link } from 'react-router-dom';
import { Clock3 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';

export function AccountPending(): JSX.Element {
  const { user, logout } = useAuth();
  const status = user?.status;

  const message =
    status === 'SUSPENDED'
      ? 'Your account has been suspended. Contact an administrator if you believe this is a mistake.'
      : status === 'DEACTIVATED'
        ? 'Your account has been deactivated. Contact an administrator if you believe this is a mistake.'
        : 'Your account has been created and is awaiting activation by a library staff member or administrator. You will be able to sign in normally once it is activated.';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-center">
      <Clock3 className="h-12 w-12 text-amber-500" aria-hidden="true" />
      <h1 className="text-2xl font-semibold text-slate-900">Account not yet active</h1>
      <p className="max-w-md text-slate-600">{message}</p>
      <div className="flex gap-3">
        <Link to="/" className="btn-secondary">Back home</Link>
        <button type="button" className="btn-primary" onClick={() => void logout()}>
          Sign out
        </button>
      </div>
    </div>
  );
}
