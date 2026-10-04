import { useEffect, useState, type FormEvent } from 'react';
import { Search, X } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { AppRole } from '@njala/shared';

interface SearchBarProps {
  roles: AppRole[];
}

type SearchTarget = 'papers' | 'users';

export function SearchBar({ roles }: SearchBarProps): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [value, setValue] = useState(params.get('q') ?? '');
  const [target, setTarget] = useState<SearchTarget>('papers');
  const isAdmin = roles.some((role) => role === 'ADMIN' || role === 'SUPER_ADMIN');
  const isStudent = roles.includes('STUDENT') && !isAdmin;
  const placeholder = isStudent
    ? 'Search past papers by course code, course or year'
    : 'Search papers, courses or users';

  useEffect(() => {
    setValue(params.get('q') ?? '');
    if (!isAdmin || location.pathname.startsWith('/app/papers')) setTarget('papers');
    else if (location.pathname === '/app/admin/users') setTarget('users');
  }, [isAdmin, location.pathname, location.search, params]);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const query = value.trim();
    if (!query) return;

    if (target === 'users' && isAdmin) {
      navigate(`/app/admin/users?${new URLSearchParams({ q: query }).toString()}`);
      return;
    }

    const next = location.pathname.startsWith('/app/papers')
      ? new URLSearchParams(params)
      : new URLSearchParams();
    next.set('q', query);
    next.set('page', '1');
    next.set('sort', 'relevance');
    navigate(`/app/papers?${next.toString()}`);
  }

  function clear(): void {
    setValue('');
    if (location.pathname.startsWith('/app/papers') || (isAdmin && location.pathname === '/app/admin/users')) {
      const next = new URLSearchParams(params);
      next.delete('q');
      next.set('page', '1');
      setParams(next);
    }
  }

  return (
    <form role="search" onSubmit={submit} className="flex h-14 items-center gap-2 border-b border-slate-200 bg-white px-3 sm:px-4">
      {isAdmin && (
        <label className="sr-only" htmlFor="global-search-target">Search area</label>
      )}
      {isAdmin && (
        <select
          id="global-search-target"
          aria-label="Search area"
          value={target}
          onChange={(event) => setTarget(event.target.value as SearchTarget)}
          className="h-11 max-w-24 rounded-md border-0 bg-slate-100 px-2 text-xs font-medium text-slate-700 focus-visible:ring-2 focus-visible:ring-brand-600 sm:max-w-32 sm:text-sm"
        >
          <option value="papers">Papers</option>
          <option value="users">Users</option>
        </select>
      )}
      <div className="relative mx-auto flex h-11 min-w-0 max-w-4xl flex-1 items-center">
        <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-500" aria-hidden="true" />
        <input
          type="text"
          aria-label={target === 'users' ? 'Search users' : 'Search papers'}
          placeholder={target === 'users' ? 'Search users by name or ID' : placeholder}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-full min-w-0 flex-1 rounded-l-md border border-slate-300 bg-white pl-9 pr-2 text-sm text-slate-900 placeholder:text-slate-500 focus:z-10 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600"
        />
        {value && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={clear}
            className="inline-flex h-11 w-10 shrink-0 items-center justify-center border-y border-slate-300 text-slate-600 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            <X size={16} aria-hidden="true" />
          </button>
        )}
        <button type="submit" aria-label="Search" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-r-md bg-brand-700 text-white hover:bg-brand-800 focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-brand-600">
          <Search size={18} aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
