import { useAuth } from '../../hooks/useAuth';
import { StudentDashboard } from './StudentDashboard';
import { LecturerDashboard } from './LecturerDashboard';
import { LibraryDashboard } from './LibraryDashboard';
import { AdminDashboard } from './AdminDashboard';

export function DashboardRouter(): JSX.Element {
  const { hasRole } = useAuth();

  if (hasRole('ADMIN', 'SUPER_ADMIN')) return <AdminDashboard />;
  if (hasRole('LIBRARY_STAFF')) return <LibraryDashboard />;
  if (hasRole('LECTURER')) return <LecturerDashboard />;
  return <StudentDashboard />;
}
