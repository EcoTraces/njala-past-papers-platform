import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  LayoutDashboard,
  Search,
  Bookmark,
  Bell,
  User,
  Menu,
  X,
  Upload,
  ClipboardList,
  Users,
  Building2,
  ShieldCheck,
  BarChart3,
  LogOut,
} from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../hooks/useAuth';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}

function navForRoles(roles: string[]): NavItem[] {
  const items: NavItem[] = [{ to: '/app', label: 'Dashboard', icon: LayoutDashboard }, { to: '/app/papers', label: 'Browse Papers', icon: Search }];

  if (roles.includes('STUDENT')) {
    items.push({ to: '/app/practice', label: 'Practice', icon: BookOpen });
    items.push({ to: '/app/bookmarks', label: 'Bookmarks', icon: Bookmark });
  }
  if (roles.includes('LECTURER')) {
    items.push({ to: '/app/lecturer/papers', label: 'My Papers', icon: ClipboardList });
    items.push({ to: '/app/lecturer/upload', label: 'Upload Paper', icon: Upload });
  }
  if (roles.includes('LIBRARY_STAFF')) {
    items.push({ to: '/app/library/queue', label: 'Review Queue', icon: ClipboardList });
    items.push({ to: '/app/library/upload', label: 'Upload Paper', icon: Upload });
  }
  if (roles.includes('ADMIN') || roles.includes('SUPER_ADMIN')) {
    items.push({ to: '/app/admin/users', label: 'Users', icon: Users });
    items.push({ to: '/app/admin/academic', label: 'Academic Structure', icon: Building2 });
    items.push({ to: '/app/admin/audit-logs', label: 'Audit Logs', icon: ShieldCheck });
  }
  if (roles.includes('ADMIN') || roles.includes('SUPER_ADMIN') || roles.includes('LIBRARY_STAFF')) {
    items.push({ to: '/app/analytics', label: 'Analytics', icon: BarChart3 });
  }
  items.push({ to: '/app/notifications', label: 'Notifications', icon: Bell });
  items.push({ to: '/app/profile', label: 'Profile', icon: User });
  return items;
}

const MOBILE_NAV_ID = 'primary-mobile-nav';

export function AppLayout(): JSX.Element {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = navForRoles(user?.roles ?? []);
  const location = useLocation();
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // A route change is the most common way the drawer gets left open
  // behind the user - back/forward navigation, a redirect from inside
  // a page, clicking the wordmark - none of which pass through the
  // per-link onClick handler below.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    // Move focus into the drawer when it opens and return it to the
    // toggle button when it closes, so keyboard/screen-reader users
    // land somewhere sensible instead of focus silently staying on a
    // now-hidden control.
    const firstLink = navRef.current?.querySelector<HTMLElement>('a');
    firstLink?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMobileOpen(false);
        toggleButtonRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  return (
    <div className="min-h-screen bg-slate-50">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-brand-700 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <button
              ref={toggleButtonRef}
              type="button"
              className="rounded-md p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle navigation"
              aria-expanded={mobileOpen}
              aria-controls={MOBILE_NAV_ID}
            >
              {mobileOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
            </button>
            <span className="text-sm font-bold text-brand-700">Njala Past Papers</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-600 sm:inline">{user?.fullName}</span>
            <button type="button" className="btn-secondary" onClick={() => void logout()}>
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Backdrop: only present while the mobile drawer is open, so it
          never intercepts clicks on desktop where the nav is static. */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-10 bg-slate-900/30 lg:hidden"
          aria-hidden="true"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <div className="mx-auto flex max-w-7xl">
        <nav
          id={MOBILE_NAV_ID}
          ref={navRef}
          aria-label="Primary"
          className={clsx(
            'w-64 shrink-0 border-r border-slate-200 bg-white p-4',
            mobileOpen ? 'fixed inset-y-0 left-0 top-14 z-10 block h-[calc(100vh-3.5rem)] overflow-y-auto shadow-lg' : 'hidden lg:block',
          )}
        >
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/app'}
                  className={({ isActive }) =>
                    clsx(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
                      isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-100',
                    )
                  }
                  onClick={() => setMobileOpen(false)}
                >
                  <item.icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main className="min-w-0 flex-1 p-4 sm:p-6" id="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
