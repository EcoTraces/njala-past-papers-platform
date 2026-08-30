import { z } from 'zod';
import { EXAMINATION_TYPES, PAPER_STATUSES, PAPER_TYPES } from '../constants/enums.js';

export const paperMetadataSchema = z.object({
  title: z.string().trim().min(3).max(200),
  courseId: z.string().uuid(),
  academicYearId: z.string().uuid(),
  semesterId: z.string().uuid(),
  examinationType: z.enum(EXAMINATION_TYPES),
  paperType: z.enum(PAPER_TYPES).default('THEORY'),
  examinationDate: z.string().date().optional(),
  durationMinutes: z.number().int().positive().max(600).optional(),
});
export type PaperMetadataInput = z.infer<typeof paperMetadataSchema>;

export const paperSearchQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  courseId: z.string().uuid().optional(),
  courseCode: z.string().trim().max(20).optional(),
  facultyId: z.string().uuid().optional(),
  departmentId: z.string().uuid().optional(),
  programmeId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
  semesterId: z.string().uuid().optional(),
  examinationType: z.enum(EXAMINATION_TYPES).optional(),
  status: z.enum(PAPER_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(['relevance', 'recent', 'popular', 'title']).default('recent'),
});
export type PaperSearchQuery = z.infer<typeof paperSearchQuerySchema>;

export const paperReviewActionSchema = z.object({
  comment: z.string().trim().max(2000).optional(),
});

export const paperRejectSchema = z.object({
  reason: z.string().trim().min(3).max(2000),
});

/** Allowed upload MIME type - PDF only, enforced again server-side by
 *  magic-byte sniffing, not just this declared type. */
export const ALLOWED_PAPER_MIME_TYPES = ['application/pdf'] as const;
export const MAX_PAPER_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB
