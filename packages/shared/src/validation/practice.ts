import { z } from 'zod';

export const createPracticeSessionSchema = z
  .object({
    courseId: z.string().uuid().optional(),
    sourcePaperId: z.string().uuid().optional(),
    questionCount: z.number().int().min(1).max(100).default(20),
    questionTypes: z.array(z.string()).optional(),
    difficulty: z.number().int().min(1).max(5).optional(),
  })
  .refine((data) => data.courseId || data.sourcePaperId, {
    message: 'Provide either a courseId or a sourcePaperId to build a practice session',
  });

export const submitAnswerSchema = z.object({
  questionId: z.string().uuid(),
  selectedOptionId: z.string().uuid().optional(),
  answerText: z.string().trim().max(5000).optional(),
  numericalAnswer: z.number().optional(),
});
export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>;

export const manualMarkSchema = z.object({
  marksAwarded: z.number().min(0),
  isCorrect: z.boolean().optional(),
});
