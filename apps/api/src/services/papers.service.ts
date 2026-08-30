import type { SupabaseClient } from '@supabase/supabase-js';
import { PAPER_STATUS_TRANSITIONS, type PaperStatus } from '@njala/shared';
import { supabaseAdmin } from '../lib/supabase.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../lib/errors.js';

export async function assertLecturerOwnsCourse(lecturerId: string, courseId: string): Promise<void> {
  const { data } = await supabaseAdmin
    .from('course_lecturers')
    .select('course_id')
    .eq('course_id', courseId)
    .eq('lecturer_id', lecturerId)
    .maybeSingle();
  if (!data) {
    throw new ForbiddenError('You are not authorized to manage papers for this course');
  }
}

export function assertValidTransition(from: PaperStatus, to: PaperStatus): void {
  const allowed = PAPER_STATUS_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new ConflictError(`Cannot move a paper from ${from} to ${to}`, { from, to, allowed });
  }
}

/**
 * Performs a status transition inside a single logical operation:
 * updates examination_papers.status and appends a paper_reviews row.
 * Uses the caller's own RLS-scoped client (db) for the update, so
 * Postgres RLS is the final authority on whether the transition is
 * allowed, on top of the explicit role checks already done in the
 * route handler.
 */
export async function transitionPaperStatus(
  db: SupabaseClient,
  paperId: string,
  reviewerId: string,
  to: PaperStatus,
  comment?: string,
): Promise<Record<string, unknown>> {
  const { data: paper, error: fetchError } = await db
    .from('examination_papers')
    .select('id, status')
    .eq('id', paperId)
    .maybeSingle();

  if (fetchError || !paper) throw new NotFoundError('Examination paper');

  const from = paper.status as PaperStatus;
  assertValidTransition(from, to);

  const updates: Record<string, unknown> = { status: to };
  if (to === 'PUBLISHED') updates.publication_date = new Date().toISOString();
  if (to === 'ARCHIVED') updates.archive_date = new Date().toISOString();
  if (to === 'UNDER_REVIEW' || to === 'APPROVED' || to === 'REJECTED') updates.verified_by = reviewerId;

  const { data: updated, error: updateError } = await db
    .from('examination_papers')
    .update(updates)
    .eq('id', paperId)
    .select()
    .single();

  if (updateError || !updated) {
    throw new ForbiddenError('You are not authorized to change this paper\'s status');
  }

  await db.from('paper_reviews').insert({
    paper_id: paperId,
    reviewer_id: reviewerId,
    from_status: from,
    to_status: to,
    comment: comment ?? null,
  });

  return updated;
}
