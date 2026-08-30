import { Link } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';

export function NotFound(): JSX.Element {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-center">
      <FileQuestion className="h-12 w-12 text-slate-400" aria-hidden="true" />
      <h1 className="text-2xl font-semibold text-slate-900">Page not found</h1>
      <Link to="/" className="btn-primary">Back home</Link>
    </div>
  );
}
