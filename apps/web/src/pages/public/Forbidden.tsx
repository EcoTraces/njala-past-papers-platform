import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

export function Forbidden(): JSX.Element {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-center">
      <ShieldAlert className="h-12 w-12 text-amber-500" aria-hidden="true" />
      <h1 className="text-2xl font-semibold text-slate-900">You don't have access to this page</h1>
      <p className="max-w-md text-slate-600">Your account role doesn't include permission for this section of the platform.</p>
      <Link to="/app" className="btn-primary">Back to dashboard</Link>
    </div>
  );
}
