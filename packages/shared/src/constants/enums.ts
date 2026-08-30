/**
 * Enum values mirror the Postgres enum types defined in
 * supabase/migrations exactly. Keep these two in sync by hand - there
 * is a codegen script (scripts/check-enum-drift, see TESTING.md) that
 * fails CI if they diverge.
 */

export const APP_ROLES = ['STUDENT', 'LECTURER', 'LIBRARY_STAFF', 'ADMIN', 'SUPER_ADMIN'] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const ACCOUNT_STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const PROGRAMME_LEVELS = ['UNDERGRADUATE', 'POSTGRADUATE_DIPLOMA', 'MASTERS', 'DOCTORAL'] as const;
export type ProgrammeLevel = (typeof PROGRAMME_LEVELS)[number];

export const EXAMINATION_TYPES = [
  'MID_SEMESTER',
  'END_OF_SEMESTER',
  'SUPPLEMENTARY',
  'RESIT',
  'MOCK',
  'SPECIAL',
  'OTHER',
] as const;
export type ExaminationType = (typeof EXAMINATION_TYPES)[number];

export const PAPER_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'PUBLISHED',
  'ARCHIVED',
  'REJECTED',
] as const;
export type PaperStatus = (typeof PAPER_STATUSES)[number];

/** Allowed forward transitions in the paper workflow state machine. */
export const PAPER_STATUS_TRANSITIONS: Record<PaperStatus, PaperStatus[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['UNDER_REVIEW', 'REJECTED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED'],
  APPROVED: ['PUBLISHED'],
  PUBLISHED: ['ARCHIVED'],
  ARCHIVED: [],
  REJECTED: ['DRAFT'],
};

export const PAPER_TYPES = ['THEORY', 'PRACTICAL', 'OBJECTIVE', 'MIXED'] as const;
export type PaperType = (typeof PAPER_TYPES)[number];

export const OCR_STATUSES = ['NOT_REQUIRED', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED'] as const;
export type OcrStatus = (typeof OCR_STATUSES)[number];

export const QUESTION_TYPES = [
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
  'SHORT_ANSWER',
  'ESSAY',
  'NUMERICAL',
  'MIXED',
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_VERIFICATION_STATUSES = ['UNVERIFIED', 'VERIFIED', 'REJECTED'] as const;
export type QuestionVerificationStatus = (typeof QUESTION_VERIFICATION_STATUSES)[number];

export const PRACTICE_SESSION_STATUSES = ['IN_PROGRESS', 'PAUSED', 'SUBMITTED', 'ABANDONED'] as const;
export type PracticeSessionStatus = (typeof PRACTICE_SESSION_STATUSES)[number];

export const PROCESSING_JOB_STATUSES = ['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED'] as const;
export type ProcessingJobStatus = (typeof PROCESSING_JOB_STATUSES)[number];

export const NOTIFICATION_TYPES = [
  'PAPER_APPROVED',
  'PAPER_REJECTED',
  'PAPER_PUBLISHED',
  'PAPER_SUBMITTED_FOR_REVIEW',
  'PRACTICE_RESULT_READY',
  'ACCOUNT_STATUS_CHANGE',
  'SYSTEM_ANNOUNCEMENT',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Permission codes, must match supabase/migrations/*_roles_permissions.sql */
export const PERMISSIONS = [
  'papers.read.published',
  'papers.read.any',
  'papers.upload',
  'papers.submit',
  'papers.review',
  'papers.approve',
  'papers.reject',
  'papers.archive',
  'papers.delete',
  'papers.manage.own_courses',
  'questions.read',
  'questions.create',
  'questions.verify',
  'practice.attempt',
  'users.manage',
  'academic_structure.manage',
  'academic_calendar.manage',
  'audit_logs.read',
  'analytics.read',
  'system_settings.manage',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<AppRole, readonly Permission[]> = {
  STUDENT: ['papers.read.published', 'practice.attempt', 'questions.read'],
  LECTURER: [
    'papers.read.published',
    'papers.read.any',
    'papers.upload',
    'papers.submit',
    'papers.manage.own_courses',
    'questions.read',
    'questions.create',
    'practice.attempt',
  ],
  LIBRARY_STAFF: [
    'papers.read.published',
    'papers.read.any',
    'papers.upload',
    'papers.submit',
    'papers.review',
    'papers.approve',
    'papers.reject',
    'papers.archive',
    'questions.read',
    'questions.verify',
    'audit_logs.read',
  ],
  ADMIN: [
    'papers.read.published',
    'papers.read.any',
    'papers.upload',
    'papers.submit',
    'papers.review',
    'papers.approve',
    'papers.reject',
    'papers.archive',
    'papers.delete',
    'questions.read',
    'questions.create',
    'questions.verify',
    'users.manage',
    'academic_structure.manage',
    'academic_calendar.manage',
    'audit_logs.read',
    'analytics.read',
    'system_settings.manage',
  ],
  SUPER_ADMIN: PERMISSIONS,
};

export function roleHasPermission(role: AppRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
