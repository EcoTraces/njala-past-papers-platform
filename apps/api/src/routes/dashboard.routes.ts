import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/student/dashboard', { preHandler: [authenticate, requireRole('STUDENT')], schema: { tags: ['dashboards'] } }, async (request) => {
    const userId = request.user!.id;
    const [recentPapers, bookmarks, recentAttempts, notifications] = await Promise.all([
      request.db
        .from('examination_papers')
        .select('id, title, course_id, courses(code, title), publication_date')
        .eq('status', 'PUBLISHED')
        .order('publication_date', { ascending: false })
        .limit(8),
      request.db.from('bookmarks').select('paper_id, examination_papers(id, title)').eq('user_id', userId).limit(10),
      request.db
        .from('practice_sessions')
        .select('id, title, status, percentage, submitted_at')
        .eq('user_id', userId)
        .order('started_at', { ascending: false })
        .limit(5),
      request.db.from('notifications').select('id, type, title, is_read, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(10),
    ]);

    return {
      recentPapers: recentPapers.data ?? [],
      bookmarks: bookmarks.data ?? [],
      recentAttempts: recentAttempts.data ?? [],
      notifications: notifications.data ?? [],
    };
  });

  app.get('/lecturer/dashboard', { preHandler: [authenticate, requireRole('LECTURER')], schema: { tags: ['dashboards'] } }, async (request) => {
    const userId = request.user!.id;
    const [myPapers, myCourses, questionStats] = await Promise.all([
      request.db.from('examination_papers').select('id, title, status, created_at').eq('uploaded_by', userId).order('created_at', { ascending: false }).limit(10),
      request.db.from('course_lecturers').select('courses(id, code, title)').eq('lecturer_id', userId),
      request.db.from('questions').select('id, verification_status').eq('author_id', userId),
    ]);

    const questions = questionStats.data ?? [];
    return {
      myPapers: myPapers.data ?? [],
      myCourses: (myCourses.data ?? []).map((r) => (r as unknown as { courses: unknown }).courses),
      questionBankStats: {
        total: questions.length,
        verified: questions.filter((q) => q.verification_status === 'VERIFIED').length,
        pending: questions.filter((q) => q.verification_status === 'UNVERIFIED').length,
      },
    };
  });

  app.get('/library/dashboard', { preHandler: [authenticate, requireRole('LIBRARY_STAFF')], schema: { tags: ['dashboards'] } }, async (request) => {
    const [pendingReview, approvedRecent, rejectedRecent, processingFailures] = await Promise.all([
      request.db.from('examination_papers').select('id, title, status, created_at').in('status', ['SUBMITTED', 'UNDER_REVIEW']).order('created_at').limit(20),
      request.db.from('examination_papers').select('id, title, publication_date').eq('status', 'PUBLISHED').order('publication_date', { ascending: false }).limit(10),
      request.db.from('examination_papers').select('id, title, rejection_reason').eq('status', 'REJECTED').order('updated_at', { ascending: false }).limit(10),
      request.db.from('document_processing_jobs').select('id, paper_id, status, error_message').eq('status', 'FAILED').order('created_at', { ascending: false }).limit(10),
    ]);

    return {
      pendingReview: pendingReview.data ?? [],
      recentlyApproved: approvedRecent.data ?? [],
      recentlyRejected: rejectedRecent.data ?? [],
      processingFailures: processingFailures.data ?? [],
    };
  });

  app.get('/admin/dashboard', { preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')], schema: { tags: ['dashboards'] } }, async (request) => {
    const [users, papers, courses, pendingApprovals] = await Promise.all([
      request.db.from('profiles').select('id, status', { count: 'exact', head: true }),
      request.db.from('examination_papers').select('id', { count: 'exact', head: true }),
      request.db.from('courses').select('id', { count: 'exact', head: true }),
      request.db.from('examination_papers').select('id', { count: 'exact', head: true }).in('status', ['SUBMITTED', 'UNDER_REVIEW']),
    ]);

    return {
      totalUsers: users.count ?? 0,
      totalPapers: papers.count ?? 0,
      totalCourses: courses.count ?? 0,
      pendingApprovals: pendingApprovals.count ?? 0,
    };
  });

  app.get('/analytics', { preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN', 'LIBRARY_STAFF')], schema: { tags: ['dashboards'] } }, async (request) => {
    const [mostViewed, mostDownloaded, uploadTrend] = await Promise.all([
      request.db.from('examination_papers').select('id, title, view_count').eq('status', 'PUBLISHED').order('view_count', { ascending: false }).limit(10),
      request.db.from('examination_papers').select('id, title, download_count').eq('status', 'PUBLISHED').order('download_count', { ascending: false }).limit(10),
      request.db.from('examination_papers').select('created_at').order('created_at', { ascending: false }).limit(500),
    ]);

    return {
      mostViewedPapers: mostViewed.data ?? [],
      mostDownloadedPapers: mostDownloaded.data ?? [],
      uploadCountSample: (uploadTrend.data ?? []).length,
    };
  });
}
