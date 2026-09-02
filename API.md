# API Reference

Full interactive OpenAPI/Swagger documentation is served by the running
API at **`/api/docs`** (generated from the Fastify route schemas in
`apps/api/src/routes/*.ts` and `apps/api/src/plugins/swagger.ts`). This
file is a human-readable index; treat `/api/docs` as the source of
truth.

All endpoints below are prefixed with the API's base URL
(`http://localhost:4000` in development). Endpoints marked **Auth**
require `Authorization: Bearer <supabase-access-token>`; the token is
obtained from `/api/auth/login` (student), `/api/auth/staff-login`
(staff), or `/api/auth/signup`.

## Auth (`/api/auth`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/signup` | - | Student self-registration only; always creates a STUDENT-role account |
| POST | `/login` | - | Student ID + password |
| POST | `/staff-login` | - | Email + password (LECTURER/LIBRARY_STAFF/ADMIN/SUPER_ADMIN) |
| POST | `/logout` | ✓ | Invalidates the current session |
| GET | `/me` | ✓ | Current user's profile + roles |
| POST | `/password-reset/request` | - | Student ID (uses `contact_email` if set) or staff email |

## Public lookups (`/api/public`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/programmes` | - | Needed by the sign-up form, which runs before any session exists |

## Academic structure (`/api`)

CRUD for `faculties`, `departments`, `programmes`, `courses`,
`academic-years`, `semesters` - all under those exact path segments
(e.g. `GET/POST /api/faculties`, `PATCH/DELETE /api/faculties/:id`).
Reads require any authenticated role; writes require ADMIN/SUPER_ADMIN.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/courses/mine` | ✓ (LECTURER) | Courses the caller is assigned to via `course_lecturers` |

## Papers (`/api/papers`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/` | ✓ | Search/filter/sort/paginate (`q, courseId, courseCode, facultyId, departmentId, programmeId, academicYearId, semesterId, examinationType, status, sort, page, pageSize`). `sort=relevance` ranks by `ts_rank` against `q` via the `search_examination_papers` RPC (SECURITY INVOKER - RLS still applies); every other sort uses the plain filtered/ordered query. `courseCode` resolves to a course id first (case-insensitive); an unmatched code returns zero results, never the unfiltered list |
| GET | `/mine/uploaded` | ✓ (staff) | Papers the caller uploaded |
| GET | `/bookmarks/mine` | ✓ | Caller's bookmarked papers |
| GET | `/:id` | ✓ | Full paper detail; records a view |
| POST | `/` | ✓ (LECTURER/LIBRARY_STAFF/ADMIN) | Multipart upload (file + metadata fields); creates as `DRAFT`, queues OCR |
| PATCH | `/:id` | ✓ (owner, staff) | Edit metadata |
| GET | `/:id/versions` | ✓ (owner, staff) | Superseded file history (not the current file - that's on the paper itself) |
| POST | `/:id/versions` | ✓ (owner's `DRAFT`, or staff any status) | Multipart replace (file only); archives the old file into history, re-queues OCR. Rejects an identical-content re-upload and a checksum collision with a different paper (409) |
| POST | `/:id/submit` | ✓ (owner) | `DRAFT` → `SUBMITTED` |
| POST | `/:id/review` | ✓ (LIBRARY_STAFF/ADMIN) | `SUBMITTED` → `UNDER_REVIEW` |
| POST | `/:id/approve` | ✓ (LIBRARY_STAFF/ADMIN) | `UNDER_REVIEW` → `APPROVED` |
| POST | `/:id/publish` | ✓ (LIBRARY_STAFF/ADMIN) | `APPROVED` → `PUBLISHED` |
| POST | `/:id/reject` | ✓ (LIBRARY_STAFF/ADMIN) | Requires `{ reason }`; → `REJECTED` |
| POST | `/:id/archive` | ✓ (LIBRARY_STAFF/ADMIN) | `PUBLISHED` → `ARCHIVED` |
| POST | `/:id/reprocess` | ✓ (LIBRARY_STAFF/ADMIN) | Manually retries a stuck/failed OCR job - reuses and re-dispatches the paper's most recent `document_processing_jobs` row (incrementing `attempts`) rather than creating a parallel one |
| DELETE | `/:id` | ✓ (ADMIN/SUPER_ADMIN) | Soft delete |
| GET | `/:id/download-url` | ✓ | Mints a short-lived signed URL; records a download |
| POST/DELETE | `/:id/bookmark` | ✓ | Toggle bookmark |

## Questions (`/api/questions`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/` | ✓ | List/filter by course/type/difficulty; options' `is_correct` stripped for non-staff |
| GET | `/:id` | ✓ | Same stripping rule |
| POST | `/` | ✓ (LECTURER/LIBRARY_STAFF/ADMIN) | Creates the question (+ options for MCQ/TRUE_FALSE, + an answer key for NUMERICAL) |
| PATCH | `/:id` | ✓ (author/staff) | Edit text/marks/difficulty/explanation |
| POST | `/:id/verify` | ✓ (LIBRARY_STAFF/ADMIN) | `{ approve: boolean }` → VERIFIED/REJECTED |
| DELETE | `/:id` | ✓ (author/staff) | Soft delete |

## Practice (`/api/practice`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/sessions` | ✓ | Caller's own sessions |
| POST | `/sessions` | ✓ | `{ courseId? , sourcePaperId?, questionCount, questionTypes?, difficulty? }` - picks a random set of VERIFIED questions |
| GET | `/sessions/:id` | ✓ | Session + snapshotted questions (no answer keys) + saved answers |
| POST | `/sessions/:id/answers` | ✓ | Upsert one answer; objective types are marked instantly by a DB trigger |
| POST | `/sessions/:id/pause` / `/resume` | ✓ | Calls `practice_pause_session`/`practice_resume_session` (RPCs); accumulates `time_spent_seconds` across cycles rather than a plain status flip |
| POST | `/sessions/:id/submit` | ✓ | Calls the `practice_submit_session` RPC; recomputes totals (scoped to the session's actual `practice_session_questions` snapshot only) and finalizes `time_spent_seconds`. Idempotent - resubmitting an already-`SUBMITTED` session is a safe no-op |
| POST | `/answers/:answerId/mark` | ✓ (LECTURER/LIBRARY_STAFF/ADMIN) | Manual marking for ESSAY/SHORT_ANSWER answers |

## Dashboards & analytics (`/api`)

| Method | Path | Auth |
|---|---|---|
| GET | `/student/dashboard` | STUDENT |
| GET | `/lecturer/dashboard` | LECTURER |
| GET | `/library/dashboard` | LIBRARY_STAFF |
| GET | `/admin/dashboard` | ADMIN/SUPER_ADMIN |
| GET | `/analytics` | ADMIN/SUPER_ADMIN/LIBRARY_STAFF |
| GET | `/analytics/trends?days=N` (day-bucketed uploads/views/downloads/practice-attempt counts for the last `days` days, 1-365, default 30, clamped both here and server-side, via `analytics_daily_trends()`) | ADMIN/SUPER_ADMIN/LIBRARY_STAFF |

## Notifications (`/api/notifications`)

| Method | Path | Auth |
|---|---|---|
| GET | `/` | ✓ |
| PATCH | `/:id/read` | ✓ |
| POST | `/read-all` | ✓ |

## Admin (`/api/admin`, all ADMIN/SUPER_ADMIN)

| Method | Path | Notes |
|---|---|---|
| GET | `/users` | Search/paginate |
| POST | `/staff` | Provisions a LECTURER/LIBRARY_STAFF/ADMIN/SUPER_ADMIN account (only SUPER_ADMIN can grant SUPER_ADMIN); returns a one-time temporary password |
| PATCH | `/users/:id/status` | ACTIVE/SUSPENDED/DEACTIVATED |
| POST | `/users/:id/roles` | Grant a role |
| DELETE | `/users/:id/roles/:role` | Revoke a role |
| GET | `/audit-logs` | Paginated |
| GET/PATCH | `/system-settings[/:key]` | Read all / update one |

## Internal (`/api/internal`, service-to-service only)

| Method | Path | Notes |
|---|---|---|
| POST | `/processing-callback` | Called by apps/document-service with `X-Internal-Secret`; never called by a browser |

## Health (`/api`)

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | Liveness |
| GET | `/health/ready` | Readiness (checks DB connectivity) |

## Errors

Every error response is `{ "error": { "code": string, "message": string, "details"?: unknown } }`
with a matching HTTP status (`401` unauthenticated, `403` forbidden,
`404` not found, `409` illegal state transition/conflict, `422`
validation, `429` rate limited, `500` unexpected). See
`apps/api/src/lib/errors.ts` and the central handler in `app.ts`.
