import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'U';
}

export function UserMenu(): JSX.Element {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const profileRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return;
    profileRef.current?.focus();

    function closeOnOutsideClick(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
      if (
        rootRef.current?.contains(event.target as Node)
        && event.target instanceof HTMLElement
        && event.target.getAttribute('role') === 'menuitem'
        && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
      ) {
        const items = rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
        if (!items?.length) return;
        event.preventDefault();
        const activeIndex = Array.from(items).indexOf(document.activeElement as HTMLElement);
        const nextIndex = event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? items.length - 1
            : (activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[nextIndex]?.focus();
      }
    }

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`User menu for ${user?.fullName ?? 'account'}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex min-h-11 items-center gap-2 rounded-full p-1 pr-2 text-slate-700 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-brand-600"
      >
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800" aria-hidden="true">
          {initials(user?.fullName ?? '')}
        </span>
        <ChevronDown className="hidden h-4 w-4 sm:block" aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" aria-label="Account menu" className="absolute right-0 top-full z-40 mt-2 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          <div className="border-b border-slate-100 px-3 py-2">
            <p className="truncate text-sm font-semibold text-slate-900">{user?.fullName}</p>
            <p className="text-xs text-slate-500">{user?.roles.join(', ')}</p>
          </div>
          <Link
            ref={profileRef}
            to="/app/profile"
            role="menuitem"
            tabIndex={0}
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-50"
          >
            <UserRound size={16} aria-hidden="true" />
            Profile
          </Link>
          <button
            type="button"
            role="menuitem"
            tabIndex={0}
            onClick={() => {
              setOpen(false);
              void logout();
            }}
            className="flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left text-sm text-slate-700 hover:bg-slate-50 focus-visible:bg-slate-50"
          >
            <LogOut size={16} aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
