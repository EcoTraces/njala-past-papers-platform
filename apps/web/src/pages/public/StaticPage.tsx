import type { ReactNode } from 'react';
import { PublicHeader } from '../../components/PublicHeader';

export function StaticPage({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />
      <main className="mx-auto max-w-4xl px-4 py-12">
        <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
        <div className="prose prose-slate mt-6 max-w-none text-slate-700">{children}</div>
      </main>
    </div>
  );
}
