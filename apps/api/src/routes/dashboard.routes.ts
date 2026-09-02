import type { FastifyInstance } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';

export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get('/student/dashboard', { preHandler: [authenticate, requireRole('STUDENT')], schema: { tags: ['dashboards'] } }, async (request) => {
    const userId = request.user!.id;
    const [recentPapers, bookmarks, recentAttempts, notifications, submittedAttempts, profile] = await Promise.all([
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
      // All SUBMITTED attempts (not just the 5 most recent above) - the
      // performance/progress summary needs the true average, not an
      // average of whatever happened to fit in the "recent" list.
      request.db.from('practice_sessions').select('percentage').eq('user_id', userId).eq('status', 'SUBMITTED'),
      request.db.from('profiles').select('department_id').eq('id', userId).maybeSingle(),
    ]);

    const bookmarkedPaperIds = new Set((bookmarks.data ?? []).map((b) => b.paper_id));
    const scores = (submittedAttempts.data ?? []).map((s) => Number(s.percentage ?? 0));
    const performance = {
      totalAttempts: scores.length,
      averagePercentage: scores.length > 0 ? Math.round((scores.reduce((sum, p) => sum + p, 0) / scores.length) * 100) / 100 : null,
    };

    // Recommendations: recently published papers in the student's own
    // department that they haven't already bookmarked. Deliberately
    // simple (recency + department match + not-already-saved) rather
    // than a learned/ranked model - still genuinely derived from real
    // data, not a fixed or fake list.
    let recommendations: unknown[] = [];
    if (profile.data?.department_id) {
      const { data: candidates } = await request.db
        .from('examination_papers')
        .select('id, title, course_id, courses(code, title), publication_date')
        .eq('status', 'PUBLISHED')
        .eq('department_id', profile.data.department_id)
        .order('publication_date', { ascending: false })
        .limit(15);
      recommendations = (candidates ?? []).filter((p) => !bookmarkedPaperIds.has(p.id)).slice(0, 5);
    }

    return {
      recentPapers: recentPapers.data ?? [],
      bookmarks: bookmarks.data ?? [],
      recentAttempts: recentAttempts.data ?? [],
      notifications: notifications.data ?? [],
      performance,
      recommendations,
    };
  });

  app.get('/lecturer/dashboard', { preHandler: [authenticate, requireRole('LECTURER')], schema: { tags: ['dashboards'] } }, async (request) => {
    const userId = request.user!.id;
    const [myPapers, myCourses, questionStats, draftPapers] = await Promise.all([
      request.db.from('examination_papers').select('id, title, status, created_at').eq('uploaded_by', userId).order('created_at', { ascending: false }).limit(10),
      request.db.from('course_lecturers').select('courses(id, code, title)').eq('lecturer_id', userId),
      request.db.from('questions').select('id, verification_status').eq('author_id', userId),
      request.db.from('examination_papers').select('id', { count: 'exact', head: true }).eq('uploaded_by', userId).eq('status', 'DRAFT'),
    ]);

    const questions = questionStats.data ?? [];
    const courseIds = (myCourses.data ?? []).map((r) => (r as unknown as { courses: { id: string } | null }).courses?.id).filter((id): id is string => Boolean(id));

    let practiceStatistics = { totalAttempts: 0, averagePercentage: null as number | null };
    if (courseIds.length > 0) {
      const { data: attempts } = await request.db
        .from('practice_sessions')
        .select('percentage')
        .in('course_id', courseIds)
        .eq('status', 'SUBMITTED');
      const scores = (attempts ?? []).map((a) => Number(a.percentage ?? 0));
      practiceStatistics = {
        totalAttempts: scores.length,
        averagePercentage: scores.length > 0 ? Math.round((scores.reduce((sum, p) => sum + p, 0) / scores.length) * 100) / 100 : null,
      };
    }

    return {
      myPapers: myPapers.data ?? [],
      myCourses: (myCourses.data ?? []).map((r) => (r as unknown as { courses: unknown }).courses),
      questionBankStats: {
        total: questions.length,
        verified: questions.filter((q) => q.verification_status === 'VERIFIED').length,
        pending: questions.filter((q) => q.verification_status === 'UNVERIFIED').length,
      },
      practiceStatistics,
      pendingActions: {
        unverifiedQuestions: questions.filter((q) => q.verification_status === 'UNVERIFIED').length,
        draftPapers: draftPapers.count ?? 0,
      },
    };
  });

  app.get('/library/dashboard', { preHandler: [authenticate, requireRole('LIBRARY_STAFF')], schema: { tags: ['dashboards'] } }, async (request) => {
    const [pendingReview, approvedRecent, rejectedRecent, processingFailures, totalPapers, totalPublished, totalCourses] = await Promise.all([
      request.db.from('examination_papers').select('id, title, status, created_at').in('status', ['SUBMITTED', 'UNDER_REVIEW']).order('created_at').limit(20),
      request.db.from('examination_papers').select('id, title, publication_date').eq('status', 'PUBLISHED').order('publication_date', { ascending: false }).limit(10),
      request.db.from('examination_papers').select('id, title, rejection_reason').eq('status', 'REJECTED').order('updated_at', { ascending: false }).limit(10),
      request.db.from('document_processing_jobs').select('id, paper_id, status, error_message, attempts, examination_papers(title)').eq('status', 'FAILED').order('created_at', { ascending: false }).limit(10),
      request.db.from('examination_papers').select('id', { count: 'exact', head: true }),
      request.db.from('examination_papers').select('id', { count: 'exact', head: true }).eq('status', 'PUBLISHED'),
      request.db.from('courses').select('id', { count: 'exact', head: true }),
    ]);

    return {
      pendingReview: pendingReview.data ?? [],
      recentlyApproved: approvedRecent.data ?? [],
      recentlyRejected: rejectedRecent.data ?? [],
      processingFailures: processingFailures.data ?? [],
      catalogueStats: {
        totalPapers: totalPapers.count ?? 0,
        totalPublished: totalPublished.count ?? 0,
        totalCourses: totalCourses.count ?? 0,
      },
    };
  });

  app.get('/admin/dashboard', { preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')], schema: { tags: ['dashboards'] } }, async (request) => {
    const [users, papers, courses, pendingApprovals, aggregateStats, recentActivity] = await Promise.all([
      request.db.from('profiles').select('id, status', { count: 'exact', head: true }),
      request.db.from('examination_papers').select('id', { count: 'exact', head: true }),
      request.db.from('courses').select('id', { count: 'exact', head: true }),
      request.db.from('examination_papers').select('id', { count: 'exact', head: true }).in('status', ['SUBMITTED', 'UNDER_REVIEW']),
      request.db.rpc('admin_dashboard_stats'),
      request.db.from('audit_logs').select('id, action, entity_type, entity_id, created_at, profiles(full_name)').order('created_at', { ascending: false }).limit(15),
    ]);
    if (aggregateStats.error) throw aggregateStats.error;

    const stats = aggregateStats.data?.[0] as { active_users: number; total_views: number; total_downloads: number; total_practice_attempts: number } | undefined;

    return {
      totalUsers: users.count ?? 0,
      activeUsers: stats?.active_users ?? 0,
      totalPapers: papers.count ?? 0,
      totalCourses: courses.count ?? 0,
      totalViews: stats?.total_views ?? 0,
      totalDownloads: stats?.total_downloads ?? 0,
      totalPracticeAttempts: stats?.total_practice_attempts ?? 0,
      pendingApprovals: pendingApprovals.count ?? 0,
      recentActivity: recentActivity.data ?? [],
    };
  });

  app.get('/analytics', { preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN', 'LIBRARY_STAFF')], schema: { tags: ['dashboards'] } }, async (request) => {
    // A count of matched rows via `{ count: 'exact', head: true }` asks
    // Postgres for a row count without transferring any row data - unlike
    // the previous approach here, which fetched up to 500 real rows just
    // to read off `.length`, this scales to the true total regardless of
    // catalogue size.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [mostViewed, mostDownloaded, totalUploads, uploadsLast30Days] = await Promise.all([
      request.db.from('examination_papers').select('id, title, view_count').eq('status', 'PUBLISHED').order('view_count', { ascending: false }).limit(10),
      request.db.from('examination_papers').select('id, title, download_count').eq('status', 'PUBLISHED').order('download_count', { ascending: false }).limit(10),
      request.db.from('examination_papers').select('id', { count: 'exact', head: true }),
      request.db.from('examination_papers').select('id', { count: 'exact', head: true }).gte('created_at', thirtyDaysAgo),
    ]);

    return {
      mostViewedPapers: mostViewed.data ?? [],
      mostDownloadedPapers: mostDownloaded.data ?? [],
      totalUploads: totalUploads.count ?? 0,
      uploadsLast30Days: uploadsLast30Days.count ?? 0,
    };
  });

  app.get(
    '/analytics/trends',
    { preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN', 'LIBRARY_STAFF')], schema: { tags: ['dashboards'] } },
    async (request) => {
      // Day-bucketed GROUP BY across four tables in one call isn't
      // expressible through PostgREST's plain query builder any more
      // than ts_rank()/admin_dashboard_stats()'s SUM()s were - same
      // fix, a real Postgres function (SECURITY INVOKER - RLS already
      // grants staff full visibility on every table it aggregates, no
      // new policies needed; see the migration).
      const { days } = request.query as { days?: string };
      const requestedDays = Math.min(365, Math.max(1, Number(days) || 30));
      const { data, error } = await request.db.rpc('analytics_daily_trends', { p_days: requestedDays });
      if (error) throw error;
      return { items: data ?? [], days: requestedDays };
    },
  );
}
