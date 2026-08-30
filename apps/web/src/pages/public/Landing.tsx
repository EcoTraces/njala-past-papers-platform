import { Link } from 'react-router-dom';
import { BookOpen, Search, ShieldCheck, GraduationCap } from 'lucide-react';

export function Landing(): JSX.Element {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4">
          <span className="text-lg font-bold text-brand-700">Njala Past Papers</span>
          <nav className="flex items-center gap-4 text-sm font-medium text-slate-600">
            <Link to="/about" className="hover:text-slate-900">About</Link>
            <Link to="/help" className="hover:text-slate-900">Help</Link>
            <Link to="/contact" className="hover:text-slate-900">Contact</Link>
            <Link to="/login" className="btn-secondary">Sign in</Link>
            <Link to="/signup" className="btn-primary">Create student account</Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-7xl px-4 py-20 text-center">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Verified past examination papers for Njala University students
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
            Search a centrally verified catalogue of past papers by course, faculty, department and academic year -
            then practice with auto-marked questions before the real exam.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Link to="/signup" className="btn-primary px-6 py-3 text-base">Get started with your Student ID</Link>
            <Link to="/login" className="btn-secondary px-6 py-3 text-base">I already have an account</Link>
          </div>
        </section>

        <section className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 pb-20 sm:grid-cols-3">
          <FeatureCard
            icon={Search}
            title="Powerful search"
            description="Find papers by course code, faculty, department, academic year, semester and examination type."
          />
          <FeatureCard
            icon={ShieldCheck}
            title="Verified papers only"
            description="Library staff review and approve every paper before it is published - no unverified uploads reach students."
          />
          <FeatureCard
            icon={BookOpen}
            title="Practice mode"
            description="Attempt auto-marked multiple choice, true/false and numerical questions, then review your results."
          />
        </section>

        <section className="border-t border-slate-200 bg-slate-50">
          <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-4 py-16 text-center">
            <GraduationCap className="h-10 w-10 text-brand-600" aria-hidden="true" />
            <h2 className="text-2xl font-semibold text-slate-900">For lecturers and library staff</h2>
            <p className="max-w-xl text-slate-600">
              Privileged accounts (lecturer, library staff, administrator) are provisioned by an administrator - there
              is no public sign-up for staff roles.
            </p>
            <Link to="/login" className="btn-secondary">Staff sign in</Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500">
        Njala Past Papers &amp; Exam Practice Platform
      </footer>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description }: { icon: typeof Search; title: string; description: string }): JSX.Element {
  return (
    <div className="card text-left">
      <Icon className="mb-3 h-8 w-8 text-brand-600" aria-hidden="true" />
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
    </div>
  );
}
