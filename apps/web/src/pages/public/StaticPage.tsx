import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

export function StaticPage({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Link to="/" className="text-lg font-bold text-brand-700">Njala Past Papers</Link>
          <Link to="/" className="text-sm text-slate-600 hover:text-slate-900">Back home</Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-12">
        <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
        <div className="prose prose-slate mt-6 max-w-none text-slate-700">{children}</div>
      </main>
    </div>
  );
}
