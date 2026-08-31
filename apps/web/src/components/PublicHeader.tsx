import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

const NAV_LINKS = [
  { to: '/about', label: 'About' },
  { to: '/help', label: 'Help' },
  { to: '/contact', label: 'Contact' },
] as const;

const MOBILE_MENU_ID = 'public-mobile-menu';

/**
 * Shared header for every public (unauthenticated) page. Previously
 * Landing.tsx and StaticPage.tsx each hand-rolled their own header,
 * inconsistent with each other - and Landing's About/Help/Contact
 * links simply vanished below the `sm` (640px) breakpoint with no
 * hamburger or other way to reach them on a phone. Since many students
 * are expected to use this on a smartphone, that meant those pages
 * were effectively unreachable from the landing page on mobile.
 *
 * "Sign in" renders exactly once, at every breakpoint, rather than
 * once per responsive variant - existing students returning to search/
 * practice are the common case, so it's worth never hiding behind the
 * menu; About/Help/Contact and "Create student account" collapse into
 * the hamburger below `sm`.
 */
export function PublicHeader(): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLElement>('a')?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        toggleRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  return (
    <header className="relative border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4">
        <Link to="/" className="shrink-0 text-lg font-bold text-brand-700">Njala Past Papers</Link>

        <div className="flex min-w-0 items-center gap-2 sm:gap-4">
          <nav aria-label="Secondary" className="hidden items-center gap-4 text-sm font-medium text-slate-600 sm:flex">
            {NAV_LINKS.map((link) => (
              <Link key={link.to} to={link.to} className="hover:text-slate-900">{link.label}</Link>
            ))}
          </nav>

          <Link to="/login" className="btn-secondary shrink-0 px-3 sm:px-4">Sign in</Link>
          <Link to="/signup" className="btn-primary hidden shrink-0 whitespace-nowrap px-4 sm:inline-flex">Create student account</Link>

          <button
            ref={toggleRef}
            type="button"
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100 sm:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            aria-controls={MOBILE_MENU_ID}
          >
            {menuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div
          id={MOBILE_MENU_ID}
          ref={menuRef}
          className="absolute inset-x-0 top-full z-30 border-b border-slate-200 bg-white px-4 py-4 shadow-lg sm:hidden"
        >
          <nav aria-label="Secondary" className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <Link key={link.to} to={link.to} className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                {link.label}
              </Link>
            ))}
            <Link to="/signup" className="btn-primary mt-2 justify-center">Create student account</Link>
          </nav>
        </div>
      )}
    </header>
  );
}
