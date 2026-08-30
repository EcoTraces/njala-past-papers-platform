-- =====================================================================
-- Engagement (bookmarks, notifications) and operational tables
-- (audit logs, document processing jobs, system settings).
-- =====================================================================

create table bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  paper_id uuid not null references examination_papers(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, paper_id)
);

create index idx_bookmarks_user on bookmarks (user_id);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type notification_type not null,
  title text not null,
  body text not null default '',
  is_read boolean not null default false,
  related_entity_type text,
  related_entity_id uuid,
  created_at timestamptz not null default now()
);

create index idx_notifications_user on notifications (user_id, is_read, created_at desc);

-- ---------------------------------------------------------------------
-- Audit logs: append-only, security-sensitive event trail.
-- ---------------------------------------------------------------------
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id) on delete set null,
  action text not null,           -- e.g. "paper.approve", "user.suspend"
  entity_type text not null,      -- e.g. "examination_papers"
  entity_id uuid,
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_audit_logs_actor on audit_logs (actor_id);
create index idx_audit_logs_entity on audit_logs (entity_type, entity_id);
create index idx_audit_logs_created on audit_logs (created_at desc);

-- No update/delete privilege is ever granted on audit_logs beyond the
-- service role (see RLS migration) - it is intentionally insert-only
-- from the application's point of view.

-- ---------------------------------------------------------------------
-- Document processing jobs: tracks async OCR/text-extraction work
-- handed off to apps/document-service.
-- ---------------------------------------------------------------------
create table document_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references examination_papers(id) on delete cascade,
  job_type text not null default 'FULL_PROCESS', -- FULL_PROCESS | OCR_ONLY | TEXT_EXTRACT
  status processing_job_status not null default 'QUEUED',
  attempts smallint not null default 0,
  error_message text,
  requested_by uuid references profiles(id),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_processing_jobs_paper on document_processing_jobs (paper_id);
create index idx_processing_jobs_status on document_processing_jobs (status);

-- ---------------------------------------------------------------------
-- System settings: simple key/value configuration store.
-- ---------------------------------------------------------------------
create table system_settings (
  key text primary key,
  value jsonb not null,
  description text,
  updated_by uuid references profiles(id),
  updated_at timestamptz not null default now()
);

create trigger trg_system_settings_updated_at
  before update on system_settings for each row execute function set_updated_at();

insert into system_settings (key, value, description) values
  ('max_upload_size_mb', '25', 'Maximum accepted examination paper file size, in megabytes'),
  ('allowed_mime_types', '["application/pdf"]', 'MIME types accepted for paper uploads'),
  ('signed_url_expiry_seconds', '300', 'Expiry window for signed paper view/download URLs'),
  ('practice_default_question_count', '20', 'Default number of questions in a generated practice session');
