-- =====================================================================
-- Extensions and shared enum types
-- =====================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";
create extension if not exists "unaccent";

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------

create type app_role as enum (
  'STUDENT',
  'LECTURER',
  'LIBRARY_STAFF',
  'ADMIN',
  'SUPER_ADMIN'
);

create type account_status as enum (
  'PENDING',
  'ACTIVE',
  'SUSPENDED',
  'DEACTIVATED'
);

create type programme_level as enum (
  'UNDERGRADUATE',
  'POSTGRADUATE_DIPLOMA',
  'MASTERS',
  'DOCTORAL'
);

create type examination_type as enum (
  'MID_SEMESTER',
  'END_OF_SEMESTER',
  'SUPPLEMENTARY',
  'RESIT',
  'MOCK',
  'SPECIAL',
  'OTHER'
);

create type paper_status as enum (
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'PUBLISHED',
  'ARCHIVED',
  'REJECTED'
);

create type paper_type as enum (
  'THEORY',
  'PRACTICAL',
  'OBJECTIVE',
  'MIXED'
);

create type ocr_status as enum (
  'NOT_REQUIRED',
  'QUEUED',
  'PROCESSING',
  'COMPLETED',
  'FAILED'
);

create type question_type as enum (
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
  'SHORT_ANSWER',
  'ESSAY',
  'NUMERICAL',
  'MIXED'
);

create type question_verification_status as enum (
  'UNVERIFIED',
  'VERIFIED',
  'REJECTED'
);

create type practice_session_status as enum (
  'IN_PROGRESS',
  'PAUSED',
  'SUBMITTED',
  'ABANDONED'
);

create type processing_job_status as enum (
  'QUEUED',
  'PROCESSING',
  'COMPLETED',
  'FAILED'
);

create type notification_type as enum (
  'PAPER_APPROVED',
  'PAPER_REJECTED',
  'PAPER_PUBLISHED',
  'PAPER_SUBMITTED_FOR_REVIEW',
  'PRACTICE_RESULT_READY',
  'ACCOUNT_STATUS_CHANGE',
  'SYSTEM_ANNOUNCEMENT'
);

-- Reusable trigger to maintain updated_at columns.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
