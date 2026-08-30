import { z } from 'zod';
import { QUESTION_TYPES } from '../constants/enums.js';

export const questionOptionInputSchema = z.object({
  optionLabel: z.string().trim().min(1).max(10),
  optionText: z.string().trim().min(1).max(2000),
  isCorrect: z.boolean().default(false),
});

export const questionInputSchema = z
  .object({
    sourcePaperId: z.string().uuid().optional(),
    courseId: z.string().uuid(),
    section: z.string().trim().max(50).optional(),
    questionNumber: z.string().trim().max(20).optional(),
    questionText: z.string().trim().min(3).max(5000),
    questionType: z.enum(QUESTION_TYPES),
    marks: z.number().positive().max(100),
    difficulty: z.number().int().min(1).max(5).default(3),
    explanation: z.string().trim().max(3000).optional(),
    expectedAnswer: z.string().trim().max(3000).optional(),
    numericalTolerance: z.number().nonnegative().optional(),
    options: z.array(questionOptionInputSchema).optional(),
  })
  .superRefine((data, ctx) => {
    if (['MULTIPLE_CHOICE', 'TRUE_FALSE'].includes(data.questionType)) {
      if (!data.options || data.options.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Multiple choice / true-false questions need at least 2 options',
          path: ['options'],
        });
      } else if (!data.options.some((o) => o.isCorrect)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Exactly one option must be marked correct',
          path: ['options'],
        });
      }
    }
    if (data.questionType === 'NUMERICAL' && !data.expectedAnswer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Numerical questions require an expected answer',
        path: ['expectedAnswer'],
      });
    }
  });

export type QuestionInput = z.infer<typeof questionInputSchema>;

export const questionSearchQuerySchema = z.object({
  courseId: z.string().uuid().optional(),
  questionType: z.enum(QUESTION_TYPES).optional(),
  difficulty: z.coerce.number().int().min(1).max(5).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
