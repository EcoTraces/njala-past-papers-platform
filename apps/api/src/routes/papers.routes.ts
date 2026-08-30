import type { FastifyInstance } from 'fastify';
import { paperMetadataSchema, paperRejectSchema, paperReviewActionSchema, paperSearchQuerySchema } from '@njala/shared';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { assertLecturerOwnsCourse, transitionPaperStatus } from '../services/papers.service.js';
import { createSignedUrl, generateStorageKey, uploadPaperFile, validatePaperUpload } from '../services/storage.service.js';
import { queueDocumentProcessing } from '../services/documentProcessing.service.js';
import { recordAuditEvent } from '../services/audit.service.js';
import { notifyUser } from '../services/notifications.service.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { supabaseAdmin } from '../lib/supabase.js';

const STAFF_UPLOAD_ROLES = requireRole('LECTURER', 'LIBRARY_STAFF', 'ADMIN', 'SUPER_ADMIN');
const REVIEW_ROLES = requireRole('LIBRARY_STAFF', 'ADMIN', 'SUPER_ADMIN');

export async function papersRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: authenticate, schema: { tags: ['papers'], summary: 'Search and list examination papers' } }, async (request) => {
    const query = paperSearchQuerySchema.parse(request.query);
    let dbQuery = request.db
      .from('examination_papers')
      .select(
        'id, title, course_id, faculty_id, department_id, academic_year_id, semester_id, examination_type, paper_type, status, page_count, view_count, download_count, publication_date, created_at, courses(code, title)',
        { count: 'exact' },
      );

    if (query.courseId) dbQuery = dbQuery.eq('course_id', query.courseId);
    if (query.facultyId) dbQuery = dbQuery.eq('faculty_id', query.facultyId);
    if (query.departmentId) dbQuery = dbQuery.eq('department_id', query.departmentId);
    if (query.programmeId) dbQuery = dbQuery.eq('programme_id', query.programmeId);
    if (query.academicYearId) dbQuery = dbQuery.eq('academic_year_id', query.academicYearId);
    if (query.semesterId) dbQuery = dbQuery.eq('semester_id', query.semesterId);
    if (query.examinationType) dbQuery = dbQuery.eq('examination_type', query.examinationType);
    if (query.status) dbQuery = dbQuery.eq('status', query.status);
    if (query.q) dbQuery = dbQuery.textSearch('search_vector', query.q, { type: 'websearch', config: 'english' });

    switch (query.sort) {
      case 'popular':
        dbQuery = dbQuery.order('download_count', { ascending: false });
        break;
      case 'title':
        dbQuery = dbQuery.order('title', { ascending: true });
        break;
      case 'recent':
      default:
        dbQuery = dbQuery.order('created_at', { ascending: false });
        break;
    }

    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;
    const { data, error, count } = await dbQuery.range(from, to);
    if (error) throw error;

    return {
      items: data,
      total: count ?? 0,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil((count ?? 0) / query.pageSize)),
    };
  });

  app.get('/mine/uploaded', { preHandler: [authenticate, STAFF_UPLOAD_ROLES], schema: { tags: ['papers'], summary: 'Papers uploaded by the current user' } }, async (request) => {
    const { data, error } = await request.db
      .from('examination_papers')
      .select('id, title, status, created_at, courses(code, title)')
      .eq('uploaded_by', request.user!.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return { items: data };
  });

  app.get('/bookmarks/mine', { preHandler: authenticate, schema: { tags: ['papers'], summary: 'List the current user\'s bookmarked papers' } }, async (request) => {
    const { data, error } = await request.db
      .from('bookmarks')
      .select('id, created_at, examination_papers(id, title, status, courses(code, title))')
      .eq('user_id', request.user!.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return { items: data };
  });

  app.get('/:id', { preHandler: authenticate, schema: { tags: ['papers'] } }, async (request) => {
    const { id } = request.params as { id: string };
    const { data, error } = await request.db
      .from('examination_papers')
      .select('*, courses(code, title), faculties(name), departments(name), academic_years(name), semesters(name)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundError('Examination paper');

    await request.db.from('paper_views').insert({ paper_id: id, user_id: request.user!.id });
    const { error: viewCountError } = await request.db.rpc('increment_paper_view_count', { p_paper_id: id });
    if (viewCountError) request.log.warn({ err: viewCountError, paperId: id }, 'Failed to increment paper view count');
    return data;
  });

  app.post(
    '/',
    { preHandler: [authenticate, STAFF_UPLOAD_ROLES], schema: { tags: ['papers'], summary: 'Upload a new examination paper (multipart: file + metadata)' } },
    async (request, reply) => {
      const parts = request.parts();
      let fileBuffer: Buffer | null = null;
      let mimeType = '';
      const fields: Record<string, string> = {};

      for await (const part of parts) {
        if (part.type === 'file') {
          fileBuffer = await part.toBuffer();
          mimeType = part.mimetype;
        } else {
          fields[part.fieldname] = String(part.value);
        }
      }

      if (!fileBuffer) throw new ValidationError('A PDF file is required');

      const metadata = paperMetadataSchema.parse({
        title: fields.title,
        courseId: fields.courseId,
        academicYearId: fields.academicYearId,
        semesterId: fields.semesterId,
        examinationType: fields.examinationType,
        paperType: fields.paperType,
        examinationDate: fields.examinationDate || undefined,
        durationMinutes: fields.durationMinutes ? Number(fields.durationMinutes) : undefined,
      });

      const isLecturerOnly = request.user!.roles.every((r) => r === 'LECTURER');
      if (isLecturerOnly) {
        await assertLecturerOwnsCourse(request.user!.id, metadata.courseId);
      }

      const { data: course, error: courseError } = await request.db
        .from('courses')
        .select('id, code, department_id, faculty:departments(faculty_id)')
        .eq('id', metadata.courseId)
        .single();
      if (courseError || !course) throw new ValidationError('Unknown course');

      const validated = validatePaperUpload(fileBuffer, mimeType || 'application/pdf');
      const storagePath = generateStorageKey(course.code);
      await uploadPaperFile(storagePath, validated.buffer);

      const facultyId = (course as unknown as { faculty: { faculty_id: string } }).faculty.faculty_id;

      const { data: paper, error } = await request.db
        .from('examination_papers')
        .insert({
          title: metadata.title,
          course_id: metadata.courseId,
          faculty_id: facultyId,
          department_id: course.department_id,
          academic_year_id: metadata.academicYearId,
          semester_id: metadata.semesterId,
          examination_type: metadata.examinationType,
          paper_type: metadata.paperType,
          examination_date: metadata.examinationDate ?? null,
          duration_minutes: metadata.durationMinutes ?? null,
          uploaded_by: request.user!.id,
          storage_path: storagePath,
          original_filename: (fields.filename ?? 'paper.pdf').slice(0, 255),
          file_size_bytes: validated.sizeBytes,
          mime_type: validated.mimeType,
          checksum_sha256: validated.checksumSha256,
          status: 'DRAFT',
          ocr_status: 'QUEUED',
        })
        .select()
        .single();

      if (error) {
        // Roll back the orphaned file if the metadata row failed
        // (e.g. duplicate-checksum unique constraint).
        throw error;
      }

      await queueDocumentProcessing(paper.id, request.user!.id);
      await recordAuditEvent({ actorId: request.user!.id, action: 'paper.upload', entityType: 'examination_papers', entityId: paper.id, request });

      reply.status(201);
      return paper;
    },
  );

  app.patch('/:id', { preHandler: [authenticate, STAFF_UPLOAD_ROLES], schema: { tags: ['papers'] } }, async (request) => {
    const { id } = request.params as { id: string };
    const input = paperMetadataSchema.partial().parse(request.body);
    const patch: Record<string, unknown> = {};
    if (input.title) patch.title = input.title;
    if (input.examinationDate) patch.examination_date = input.examinationDate;
    if (input.durationMinutes) patch.duration_minutes = input.durationMinutes;
    if (input.examinationType) patch.examination_type = input.examinationType;
    if (input.paperType) patch.paper_type = input.paperType;

    const { data, error } = await request.db.from('examination_papers').update(patch).eq('id', id).select().single();
    if (error) throw error;
    return data;
  });

  app.post('/:id/submit', { preHandler: [authenticate, STAFF_UPLOAD_ROLES], schema: { tags: ['papers'] } }, async (request) => {
    const { id } = request.params as { id: string };
    const updated = await transitionPaperStatus(request.db, id, request.user!.id, 'SUBMITTED');
    await recordAuditEvent({ actorId: request.user!.id, action: 'paper.submit', entityType: 'examination_papers', entityId: id, request });
    return updated;
  });

  app.post('/:id/review', { preHandler: [authenticate, REVIEW_ROLES], schema: { tags: ['papers'] } }, async (request) => {
    const { id } = request.params as { id: string };
    const { comment } = paperReviewActionSchema.parse(request.body ?? {});
    const updated = await transitionPaperStatus(request.db, id, request.user!.id, 'UNDER_REVIEW', comment);
    await recordAuditEvent({ actorId: request.user!.id, action: 'paper.review_start', entityType: 'examination_papers', entityId: id, request });
    return updated;
  });

  app.post('/:id/approve', { preHandler: [authenticate, REVIEW_ROLES], schema: { tags: ['papers'] } }, async (request) => {
    const { id } = request.params as { id: string };
    const { comment } = paperReviewActionSchema.parse(request.body ?? {});
    const updated = await transitionPaperStatus(request.db, id, request.user!.id, 'APPROVED', comment);
    await notifyPaperUploader(id, 'PAPER_APPROVED', 'Your examination paper was approved');
    await recordAuditEvent({ actorId: request.user!.id, action: 'paper.approve', entityType: 'examination_papers', entityId: id, request });
    return updated;
  });

  app.post('/:id/publish', { preHandler: [authenticate, REVIEW_ROLES], schema: { tags: ['papers'] } }, async (request) => {
    const { id } = request.params as { id: string };
    const updated = await transitionPaperStatus(request.db, id, request.user!.id, 'PUBLISHED');
    await notifyPaperUploader(id, 'PAPER_PUBLISHED', 'Your examination paper is now published');
    await recordAuditEvent({ actorId: request.user!.id, action: 'paper.publish', entityType: 'examination_papers', entityId: id, request });
    return updated;
  });

  app.post('/:id/reject', { preHandler: [authenticate, REVIEW_ROLES], schema: { tags: ['papers'] } }, async (request) => {
    const { id } = request.params as { id: string };
    const { reason } = paperRejectSchema.parse(request.body);
    const updated = await transitionPaperStatus(request.db, id, request.user!.id, 'REJECTED', reason);
    await request.db.from('examination_papers').update({ rejection_reason: reason }).eq('id', id);
    await notifyPaperUploader(id, 'PAPER_REJECTED', `Your examination paper was rejected: ${reason}`);
    await recordAuditEvent({ actorId: request.user!.id, action: 'paper.reject', entityType: 'examination_papers', entityId: id, request, metadata: { reason } });
    return updated;
  });

  app.post('/:id/archive', { preHandler: [authenticate, REVIEW_ROLES], schema: { tags: ['papers'] } }, async (request) => {
    const { id } = request.params as { id: string };
    const updated = await transitionPaperStatus(request.db, id, request.user!.id, 'ARCHIVED');
    await recordAuditEvent({ actorId: request.user!.id, action: 'paper.archive', entityType: 'examination_papers', entityId: id, request });
    return updated;
  });

  app.delete('/:id', { preHandler: [authenticate, requireRole('ADMIN', 'SUPER_ADMIN')], schema: { tags: ['papers'] } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { error } = await request.db.from('examination_papers').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    await recordAuditEvent({ actorId: request.user!.id, action: 'paper.delete', entityType: 'examination_papers', entityId: id, request });
    reply.status(204);
  });

  app.get('/:id/download-url', { preHandler: authenticate, schema: { tags: ['papers'], summary: 'Mint a short-lived signed download URL' } }, async (request) => {
    const { id } = request.params as { id: string };
    const { data: paper, error } = await request.db.from('examination_papers').select('id, storage_path').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!paper) throw new NotFoundError('Examination paper');

    const url = await createSignedUrl(paper.storage_path);
    await request.db.from('paper_downloads').insert({ paper_id: id, user_id: request.user!.id });
    const { error: downloadCountError } = await request.db.rpc('increment_paper_download_count', { p_paper_id: id });
    if (downloadCountError) request.log.warn({ err: downloadCountError, paperId: id }, 'Failed to increment paper download count');
    await recordAuditEvent({ actorId: request.user!.id, action: 'paper.download', entityType: 'examination_papers', entityId: id, request });
    return { url, expiresInSeconds: 300 };
  });

  app.post('/:id/bookmark', { preHandler: authenticate, schema: { tags: ['papers'] } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { error } = await request.db.from('bookmarks').insert({ user_id: request.user!.id, paper_id: id });
    if (error && !error.message.includes('duplicate')) throw error;
    reply.status(204);
  });

  app.delete('/:id/bookmark', { preHandler: authenticate, schema: { tags: ['papers'] } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { error } = await request.db.from('bookmarks').delete().eq('paper_id', id).eq('user_id', request.user!.id);
    if (error) throw error;
    reply.status(204);
  });
}

async function notifyPaperUploader(paperId: string, type: 'PAPER_APPROVED' | 'PAPER_PUBLISHED' | 'PAPER_REJECTED', title: string): Promise<void> {
  const { data: paper } = await supabaseAdmin.from('examination_papers').select('uploaded_by, title').eq('id', paperId).maybeSingle();
  if (!paper) return;
  await notifyUser({
    userId: paper.uploaded_by,
    type,
    title,
    body: paper.title,
    relatedEntityType: 'examination_papers',
    relatedEntityId: paperId,
  });
}
