import type { FastifyInstance } from 'fastify';
import { questionInputSchema, questionSearchQuerySchema } from '@njala/shared';
import { authenticate } from '../middleware/authenticate.js';
import { isStaffRole, requireRole } from '../middleware/authorize.js';
import { recordAuditEvent } from '../services/audit.service.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';

const AUTHOR_ROLES = requireRole('LECTURER', 'LIBRARY_STAFF', 'ADMIN', 'SUPER_ADMIN');
const VERIFY_ROLES = requireRole('LIBRARY_STAFF', 'ADMIN', 'SUPER_ADMIN');

export async function questionsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: authenticate, schema: { tags: ['questions'] } }, async (request) => {
    const query = questionSearchQuerySchema.parse(request.query);
    let dbQuery = request.db
      .from('questions')
      .select('*, question_options(id, option_label, option_text, order_index, is_correct)', { count: 'exact' });
    if (query.courseId) dbQuery = dbQuery.eq('course_id', query.courseId);
    if (query.questionType) dbQuery = dbQuery.eq('question_type', query.questionType);
    if (query.difficulty) dbQuery = dbQuery.eq('difficulty', query.difficulty);

    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;
    const { data, error, count } = await dbQuery.range(from, to).order('created_at', { ascending: false });
    if (error) throw error;
    const staff = isStaffRole(request.user!.roles);
    return { items: staff ? data ?? [] : stripAnswers(data ?? []), total: count ?? 0, page: query.page, pageSize: query.pageSize };
  });

  app.get('/:id', { preHandler: authenticate, schema: { tags: ['questions'] } }, async (request) => {
    const { id } = request.params as { id: string };
    const { data, error } = await request.db
      .from('questions')
      .select('*, question_options(id, option_label, option_text, order_index, is_correct)')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundError('Question');
    const staff = isStaffRole(request.user!.roles);
    return staff ? data : stripAnswers([data])[0];
  });

  app.post('/', { preHandler: [authenticate, AUTHOR_ROLES], schema: { tags: ['questions'] } }, async (request, reply) => {
    const input = questionInputSchema.parse(request.body);

    const { data: question, error } = await request.db
      .from('questions')
      .insert({
        source_paper_id: input.sourcePaperId ?? null,
        course_id: input.courseId,
        section: input.section ?? null,
        question_number: input.questionNumber ?? null,
        question_text: input.questionText,
        question_type: input.questionType,
        marks: input.marks,
        difficulty: input.difficulty,
        explanation: input.explanation ?? null,
        expected_answer: input.expectedAnswer ?? null,
        numerical_tolerance: input.numericalTolerance ?? null,
        author_id: request.user!.id,
      })
      .select()
      .single();
    if (error) throw error;

    if (input.options?.length) {
      const rows = input.options.map((o, idx) => ({
        question_id: question.id,
        option_label: o.optionLabel,
        option_text: o.optionText,
        is_correct: o.isCorrect,
        order_index: idx,
      }));
      const { error: optionsError } = await request.db.from('question_options').insert(rows);
      if (optionsError) throw optionsError;
    }

    if (input.questionType === 'NUMERICAL' && input.expectedAnswer) {
      const { error: keyError } = await request.db
        .from('answer_keys')
        .insert({ question_id: question.id, correct_answer_text: input.expectedAnswer, created_by: request.user!.id });
      if (keyError) throw keyError;
    }

    await recordAuditEvent({ actorId: request.user!.id, action: 'question.create', entityType: 'questions', entityId: question.id, request });
    reply.status(201);
    return question;
  });

  app.patch('/:id', { preHandler: [authenticate, AUTHOR_ROLES], schema: { tags: ['questions'] } }, async (request) => {
    const { id } = request.params as { id: string };
    const input = questionInputSchema.partial().parse(request.body);
    const patch: Record<string, unknown> = {};
    if (input.questionText) patch.question_text = input.questionText;
    if (input.marks) patch.marks = input.marks;
    if (input.difficulty) patch.difficulty = input.difficulty;
    if (input.explanation) patch.explanation = input.explanation;

    const { data, error } = await request.db.from('questions').update(patch).eq('id', id).select().single();
    if (error) throw error;
    await recordAuditEvent({ actorId: request.user!.id, action: 'question.update', entityType: 'questions', entityId: id, request });
    return data;
  });

  app.post('/:id/verify', { preHandler: [authenticate, VERIFY_ROLES], schema: { tags: ['questions'] } }, async (request) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { approve?: boolean };
    if (typeof body.approve !== 'boolean') throw new ValidationError('"approve" (boolean) is required');

    const { data, error } = await request.db
      .from('questions')
      .update({ verification_status: body.approve ? 'VERIFIED' : 'REJECTED', verified_by: request.user!.id })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    await recordAuditEvent({
      actorId: request.user!.id,
      action: body.approve ? 'question.verify' : 'question.reject',
      entityType: 'questions',
      entityId: id,
      request,
    });
    return data;
  });

  app.delete('/:id', { preHandler: [authenticate, AUTHOR_ROLES], schema: { tags: ['questions'] } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { error } = await request.db.from('questions').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    await recordAuditEvent({ actorId: request.user!.id, action: 'question.delete', entityType: 'questions', entityId: id, request });
    reply.status(204);
  });
}

/**
 * question_options carries is_correct straight from Postgres. RLS
 * already restricts which rows are readable, but as a second layer we
 * strip is_correct here for anyone who isn't staff/the question's
 * author, so a STUDENT client never receives the answer inline with
 * the question during an active practice attempt.
 */
function stripAnswers(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return rows.map((row) => {
    const options = row.question_options as Array<Record<string, unknown>> | undefined;
    if (!options) return row;
    return { ...row, question_options: options.map(({ is_correct: _isCorrect, ...rest }) => rest) };
  });
}
