import { Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { ProtectedRoute } from './routes/ProtectedRoute';

import { Landing } from './pages/public/Landing';
import { Login } from './pages/public/Login';
import { Signup } from './pages/public/Signup';
import { About } from './pages/public/About';
import { Help } from './pages/public/Help';
import { Contact } from './pages/public/Contact';
import { Forbidden } from './pages/public/Forbidden';
import { NotFound } from './pages/public/NotFound';

import { DashboardRouter } from './pages/dashboard/DashboardRouter';
import { PapersBrowse } from './pages/papers/PapersBrowse';
import { PaperDetail } from './pages/papers/PaperDetail';

import { PracticeStart } from './pages/practice/PracticeStart';
import { PracticeSession } from './pages/practice/PracticeSession';
import { PracticeResults } from './pages/practice/PracticeResults';
import { MyAttempts } from './pages/practice/MyAttempts';

import { Bookmarks } from './pages/bookmarks/Bookmarks';
import { Notifications } from './pages/notifications/Notifications';
import { Profile } from './pages/profile/Profile';

import { MyPapers } from './pages/lecturer/MyPapers';
import { UploadPaper } from './pages/lecturer/UploadPaper';
import { QuestionBank } from './pages/lecturer/QuestionBank';

import { ReviewQueue } from './pages/library/ReviewQueue';

import { AdminUsers } from './pages/admin/AdminUsers';
import { AcademicStructure } from './pages/admin/AcademicStructure';
import { AuditLogs } from './pages/admin/AuditLogs';

export function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/about" element={<About />} />
      <Route path="/help" element={<Help />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/forbidden" element={<Forbidden />} />

      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardRouter />} />
        <Route path="papers" element={<PapersBrowse />} />
        <Route path="papers/:id" element={<PaperDetail />} />

        <Route
          path="practice"
          element={
            <ProtectedRoute roles={['STUDENT']}>
              <PracticeStart />
            </ProtectedRoute>
          }
        />
        <Route
          path="practice/attempts"
          element={
            <ProtectedRoute roles={['STUDENT']}>
              <MyAttempts />
            </ProtectedRoute>
          }
        />
        <Route
          path="practice/:sessionId"
          element={
            <ProtectedRoute roles={['STUDENT']}>
              <PracticeSession />
            </ProtectedRoute>
          }
        />
        <Route
          path="practice/:sessionId/results"
          element={
            <ProtectedRoute roles={['STUDENT']}>
              <PracticeResults />
            </ProtectedRoute>
          }
        />

        <Route
          path="bookmarks"
          element={
            <ProtectedRoute roles={['STUDENT']}>
              <Bookmarks />
            </ProtectedRoute>
          }
        />

        <Route path="notifications" element={<Notifications />} />
        <Route path="profile" element={<Profile />} />

        <Route
          path="lecturer/papers"
          element={
            <ProtectedRoute roles={['LECTURER']}>
              <MyPapers />
            </ProtectedRoute>
          }
        />
        <Route
          path="lecturer/upload"
          element={
            <ProtectedRoute roles={['LECTURER']}>
              <UploadPaper />
            </ProtectedRoute>
          }
        />
        <Route
          path="lecturer/questions"
          element={
            <ProtectedRoute roles={['LECTURER', 'LIBRARY_STAFF', 'ADMIN', 'SUPER_ADMIN']}>
              <QuestionBank />
            </ProtectedRoute>
          }
        />

        <Route
          path="library/queue"
          element={
            <ProtectedRoute roles={['LIBRARY_STAFF', 'ADMIN', 'SUPER_ADMIN']}>
              <ReviewQueue />
            </ProtectedRoute>
          }
        />
        <Route
          path="library/upload"
          element={
            <ProtectedRoute roles={['LIBRARY_STAFF', 'ADMIN', 'SUPER_ADMIN']}>
              <UploadPaper />
            </ProtectedRoute>
          }
        />

        <Route
          path="admin/users"
          element={
            <ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']}>
              <AdminUsers />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/academic"
          element={
            <ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']}>
              <AcademicStructure />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/audit-logs"
          element={
            <ProtectedRoute roles={['ADMIN', 'SUPER_ADMIN']}>
              <AuditLogs />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
