import { Link } from 'react-router-dom';
import { Menu } from 'lucide-react';
import type { RefObject } from 'react';
import type { AppRole } from '@njala/shared';
import { NotificationBell } from './NotificationBell';
import { SearchBar } from './SearchBar';
import { UserMenu } from './UserMenu';

interface AppHeaderProps {
  fullName: string;
  roles: AppRole[];
  menuExpanded: boolean;
  menuButtonRef: RefObject<HTMLButtonElement>;
  onMenuClick: () => void;
}

export function AppHeader({ fullName, roles, menuExpanded, menuButtonRef, onMenuClick }: AppHeaderProps): JSX.Element {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-2 sm:gap-3 sm:px-4">
        <button
          ref={menuButtonRef}
          type="button"
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-brand-600"
          onClick={onMenuClick}
          aria-label="Toggle navigation menu"
          aria-expanded={menuExpanded}
          aria-controls="primary-mobile-nav"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
        <Link to="/app" aria-label="Njala Past Papers dashboard" className="flex min-w-0 items-center gap-2 rounded-md focus-visible:ring-2 focus-visible:ring-brand-600">
          <img src="/njala-logo.png" width="32" height="32" alt="Njala University crest" className="h-8 w-8 shrink-0 object-contain" />
          <span className="hidden truncate text-sm font-bold text-brand-800 min-[390px]:inline sm:text-base">Njala Past Papers</span>
        </Link>
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <span className="sr-only">Signed in as {fullName}</span>
          <NotificationBell />
          <UserMenu />
        </div>
      </div>
      <SearchBar roles={roles} />
    </header>
  );
}
