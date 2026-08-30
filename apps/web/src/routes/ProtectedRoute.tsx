import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import type { AppRole } from '@njala/shared';
import { useAuth } from '../hooks/useAuth';
import { PageSpinner } from '../components/Spinner';

interface ProtectedRouteProps {
  children: ReactNode;
  roles?: AppRole[];
}

/**
 * Frontend route guard. This is UX only - it stops a signed-out or
 * wrong-role user from ever rendering a screen they can't use, but it
 * is NOT a security boundary by itself. Every API call this screen
 * makes is independently authorized by the Node API's RBAC middleware
 * and by Postgres RLS, so a determined user hitting the API directly
 * still gets a proper 403, not a data leak.
 */
export function ProtectedRoute({ children, roles }: ProtectedRouteProps): JSX.Element {
  const { user, loading, hasRole } = useAuth();
  const location = useLocation();

  if (loading) return <PageSpinner />;

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (user.status !== 'ACTIVE') {
    // A PENDING/SUSPENDED/DEACTIVATED account never reaches the app
    // shell, even in the brief window right after signup before the
    // next authenticate()-gated API call would otherwise reject it.
    return <Navigate to="/account-pending" replace />;
  }

  if (roles && !hasRole(...roles)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <>{children}</>;
}
