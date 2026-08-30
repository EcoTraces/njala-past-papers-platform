# Product Requirements Document

## Problem

Students preparing for university examinations struggle to find
reliable past examination papers. Copies circulate informally, are
often mislabeled, incomplete, or outdated, and there is no way to
practice against them in a structured, marked way.

## Product

**Njala Past Papers & Exam Practice Platform**: a centralized, secure
platform where authorized university personnel upload, verify, and
publish past examination papers, and students discover, view/download,
and practice against them.

## Users and roles

| Role | Who | Core needs |
|---|---|---|
| STUDENT | Enrolled students | Find papers for their courses, practice, track progress |
| LECTURER | Academic staff | Upload papers for their own courses, author practice questions |
| LIBRARY_STAFF | Library/records staff | Verify metadata, run the approval workflow, catalogue papers |
| ADMIN | Institutional administrators | Manage users, roles, academic structure, system settings |
| SUPER_ADMIN | Platform owner | Everything ADMIN can do, plus granting/revoking ADMIN itself |

Privileged roles (LECTURER/LIBRARY_STAFF/ADMIN/SUPER_ADMIN) are never
self-registered - only provisioned by an existing ADMIN/SUPER_ADMIN
through the admin API. Only SUPER_ADMIN can grant SUPER_ADMIN.

## Core user journeys (implemented)

1. **Student sign-up and login.** A student registers with their
   Student ID, programme, and a password. Self-registration cannot
   verify a Student ID against the institution's real roster, so the
   account is created `PENDING` and must be activated by a
   LIBRARY_STAFF/ADMIN before it can log in (see "account activation"
   in SECURITY.md) - the student sees a clear "awaiting activation"
   screen in the meantime rather than a broken app. Once active, they
   log in with Student ID + password thereafter. See ARCHITECTURE.md
   for how this maps onto Supabase Auth, which requires an
   email-shaped identifier.
2. **Discover papers.** Search/filter by course, faculty, department,
   academic year, semester, and examination type; full-text search
   across title and OCR-extracted content; sort by recency or
   popularity.
3. **View and download a paper.** Signed, time-limited URLs; every
   view/download is recorded (for analytics and audit).
4. **Bookmark and revisit** papers.
5. **Upload and publish a paper (lecturer/library staff).** Draft ->
   submit -> under review -> approved -> published -> archived, or
   rejected with a reason at submission/review. Every transition is
   authorized by role and, for lecturers, by course assignment.
6. **Author and verify questions (lecturer/library staff/admin).**
   Multiple choice, true/false, short answer, essay, numerical, or
   mixed; library staff/admin verify or reject before a question
   enters the pool students can practice with.
7. **Practice (student).** Build a session from a course (or a specific
   paper's question pool), answer, save progress, submit. Objective
   question types (multiple choice, true/false, numerical-within-
   tolerance) are marked deterministically by a database trigger the
   moment an answer is saved; essay/short-answer questions are marked
   manually by staff afterward and the session's score is recomputed.
8. **Dashboards** tailored to each role (student: recent papers/
   bookmarks/attempts; lecturer: own papers/courses/question bank
   stats; library: review queue/recent decisions/processing failures;
   admin: platform-wide counts and shortcuts).
9. **Admin management.** Provision staff accounts, suspend/reactivate
   users, grant/revoke roles, manage faculties/departments/programmes/
   courses/academic years/semesters, read audit logs.
10. **Document processing.** Every uploaded PDF is queued for text
    extraction; if it looks scanned (too little embedded text per
    page), it's OCR'd automatically. The result becomes searchable and
    is stored on the paper record.

## Non-functional requirements

- **Security-first**: private storage, signed URLs, RBAC enforced
  server-side and at the database (RLS), audit logging of
  security-relevant actions, no privilege escalation path from a lower
  role to a higher one.
- **Defense in depth**: frontend guard -> API authorization -> Postgres
  RLS, each independently correct.
- **Async processing**: OCR/text extraction never blocks the upload
  request.
- **Deterministic marking** for objective question types; explicit,
  labeled human marking for subjective ones - no undisclosed
  auto-grading of essays.
- **Portable architecture**: academic structure (faculty/department/
  programme/course) is normalized and not hardcoded to Njala, so a
  second institution is a data problem, not a rewrite.

## Out of scope for this build (see ROADMAP.md)

Live production deployment (requires real Supabase/Render/Vercel
accounts and secrets only the operator can provide), outbound
transactional email delivery (a pluggable interface exists;
`ConsoleEmailProvider` is the default and must be swapped for a real
provider in production), a dedicated PDF.js canvas viewer (the current
viewer uses the browser's native PDF rendering via a signed URL in an
iframe, which is a real, working viewer but doesn't do in-app page
thumbnails/search-within-PDF), and broader analytics/reporting beyond
the dashboards and `/api/analytics` implemented today.
