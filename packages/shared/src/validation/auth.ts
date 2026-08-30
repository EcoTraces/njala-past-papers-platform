import { z } from 'zod';

/**
 * Student IDs are normalized (uppercased, whitespace-stripped) before
 * being persisted or matched. Keep this regex loose enough to cover
 * Njala's real format variety but tight enough to reject junk input.
 */
export const studentIdSchema = z
  .string()
  .trim()
  .min(4)
  .max(20)
  .regex(/^[A-Za-z0-9/-]+$/, 'Student ID may only contain letters, numbers, "-" and "/"')
  .transform((value) => value.toUpperCase());

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const studentLoginSchema = z.object({
  studentId: studentIdSchema,
  password: z.string().min(1),
});

export const staffLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const studentSignupSchema = z.object({
  studentId: studentIdSchema,
  fullName: z.string().trim().min(2).max(120),
  password: passwordSchema,
  programmeId: z.string().uuid(),
  entryYear: z.number().int().min(2000).max(2100),
  contactEmail: z.string().email().optional(),
});

export const passwordResetRequestSchema = z.object({
  studentId: studentIdSchema.optional(),
  email: z.string().email().optional(),
}).refine((data) => data.studentId || data.email, {
  message: 'Provide either a student ID or an email address',
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1),
  newPassword: passwordSchema,
});

export type StudentLoginInput = z.infer<typeof studentLoginSchema>;
export type StaffLoginInput = z.infer<typeof staffLoginSchema>;
export type StudentSignupInput = z.infer<typeof studentSignupSchema>;
