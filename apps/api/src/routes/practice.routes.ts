import type { FastifyInstance } from 'fastify';
import { createPracticeSessionSchema, submitAnswerSchema, manualMarkSchema } from '@njala/shared';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { NotFoundError, ValidationError } from '../lib/errors.js';
import { recordAuditEvent } from '../services/audit.service.js';
import { notifyUser } from '../services/notifications.service.js';

const MARK_ROLES = requireRole('LECTURER', 'LIBRARY_STAFF', 'ADMIN', 'SUPER_ADMIN');

export async function practiceRoutes(app: FastifyInstance): Promise<void> {
  app.get('/sessions', { preHandler: authenticate, schema: { tags: ['practice'] } }, async (request) => {
    const { data, error } = await request.db
      .from('practice_sessions')
      .select('*')
      .eq('user_id', request.user!.id)
      .order('started_at', { ascending: false });
    if (error) throw error;
    return { items: data };
  });

  app.post('/sessions', { preHandler: authenticate, schema: { tags: ['practice'], summary: 'Start a new practice session' } }, async (request, reply) => {
    const input = createPracticeSessionSchema.parse(request.body);

    let questionQuery = request.db.from('questions').select('id, marks').eq('verification_status', 'VERIFIED');
    if (input.courseId) questionQuery = questionQuery.eq('course_id', input.courseId);
    if (input.sourcePaperId) questionQuery = questionQuery.eq('source_paper_id', input.sourcePaperId);
    if (input.difficulty) questionQuery = questionQuery.eq('difficulty', input.difficulty);
    if (input.questionTypes?.length) questionQuery = questionQuery.in('question_type', input.questionTypes);

    const { data: candidates, error: candidatesError } = await questionQuery.limit(500);
    if (candidatesError) throw candidatesError;
    if (!candidates || candidates.length === 0) {
      throw new ValidationError('No verified questions match this practice session request');
    }

    const shuffled = [...candidates].sort(() => Math.random() - 0.5).slice(0, input.questionCount);
    const totalMarks = shuffled.reduce((sum, q) => sum + Number(q.marks), 0);

    const { data: session, error: sessionError } = await request.db
      .from('practice_sessions')
      .insert({
        user_id: request.user!.id,
        course_id: input.courseId ?? null,
        source_paper_id: input.sourcePaperId ?? null,
        total_questions: shuffled.length,
        total_marks: totalMarks,
      })
      .select()
      .single();
    if (sessionError) throw sessionError;

    const links = shuffled.map((q, idx) => ({ session_id: session.id, question_id: q.id, order_index: idx }));
    const { error: linksError } = await request.db.from('practice_session_questions').insert(links);
    if (linksError) throw linksError;

    reply.status(201);
    return session;
  });

  app.get('/sessions/:id', { preHandler: authenticate, schema: { tags: ['practice'] } }, async (request) => {
    const { id } = request.params as { id: string };
    const { data: session, error } = await request.db.from('practice_sessions').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    if (!session) throw new NotFoundError('Practice session');

    const { data: questionLinks, error: linksError } = await request.db
      .from('practice_session_questions')
      .select('order_index, questions(id, question_text, question_type, marks, section, question_number, question_options(id, option_label, option_text, order_index))')
      .eq('session_id', id)
      .order('order_index');
    if (linksError) throw linksError;

    const { data: answers, error: answersError } = await request.db
      .from('practice_answers')
      .select('question_id, selected_option_id, answer_text, numerical_answer, is_correct, marks_awarded, auto_marked')
      .eq('session_id', id);
    if (answersError) throw answersError;

    return { session, questions: questionLinks, answers };
  });

  app.post('/sessions/:id/answers', { preHandler: authenticate, schema: { tags: ['practice'], summary: 'Save/update an answer (auto-marked where possible)' } }, async (request) => {
    const { id } = request.params as { id: string };
    const input = submitAnswerSchema.parse(request.body);

    const { data: session, error: sessionError } = await request.db.from('practice_sessions').select('id, status').eq('id', id).maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) throw new NotFoundError('Practice session');
    if (session.status === 'SUBMITTED') throw new ValidationError('This session has already been submitted');

    const { data: answer, error } = await request.db
      .from('practice_answers')
      .upsert(
        {
          session_id: id,
          question_id: input.questionId,
          selected_option_id: input.selectedOptionId ?? null,
          answer_text: input.answerText ?? null,
          numerical_answer: input.numericalAnswer ?? null,
        },
        { onConflict: 'session_id,question_id' },
      )
      .select('question_id, is_correct, marks_awarded, auto_marked')
      .single();
    if (error) throw error;

    return answer;
  });

  app.post('/sessions/:id/pause', { preHandler: authenticate, schema: { tags: ['practice'], summary: 'Pause a session, accumulating time spent so far' } }, async (request) => {
    const { id } = request.params as { id: string };
    const { data, error } = await request.db.rpc('practice_pause_session', { p_session_id: id });
    if (error) throw error;
    return data;
  });

  app.post('/sessions/:id/resume', { preHandler: authenticate, schema: { tags: ['practice'], summary: 'Resume a paused session' } }, async (request) => {
    const { id } = request.params as { id: string };
    const { data, error } = await request.db.rpc('practice_resume_session', { p_session_id: id });
    if (error) throw error;
    return data;
  });

  app.post('/sessions/:id/submit', { preHandler: authenticate, schema: { tags: ['practice'], summary: 'Submit and score the session' } }, async (request) => {
    const { id } = request.params as { id: string };
    const { data, error } = await request.db.rpc('practice_submit_session', { p_session_id: id });
    if (error) throw error;
    await recordAuditEvent({ actorId: request.user!.id, action: 'practice.submit', entityType: 'practice_sessions', entityId: id, request });
    await notifyUser({
      userId: request.user!.id,
      type: 'PRACTICE_RESULT_READY',
      title: 'Your practice results are ready',
      relatedEntityType: 'practice_sessions',
      relatedEntityId: id,
    });
    return data;
  });

  // ---------------------------------------------------------------
  // Manual marking of essay/short-answer questions by staff.
  // ---------------------------------------------------------------
  app.post(
    '/answers/:answerId/mark',
    { preHandler: [authenticate, MARK_ROLES], schema: { tags: ['practice'], summary: 'Manually mark a subjective answer' } },
    async (request) => {
      const { answerId } = request.params as { answerId: string };
      const input = manualMarkSchema.parse(request.body);

      const { data, error } = await request.db
        .from('practice_answers')
        .update({
          marks_awarded: input.marksAwarded,
          is_correct: input.isCorrect ?? null,
          auto_marked: false,
          marked_by: request.user!.id,
          marked_at: new Date().toISOString(),
        })
        .eq('id', answerId)
        .select()
        .single();
      if (error) throw error;

      await recordAuditEvent({ actorId: request.user!.id, action: 'practice.manual_mark', entityType: 'practice_answers', entityId: answerId, request });
      return data;
    },
  );
}
