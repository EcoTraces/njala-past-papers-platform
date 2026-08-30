import { z } from 'zod';
import { APP_ROLES, PROGRAMME_LEVELS } from '../constants/enums.js';
import { studentIdSchema } from './auth.js';

export const createStaffAccountSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().email(),
  staffId: z.string().trim().min(2).max(30),
  role: z.enum(['LECTURER', 'LIBRARY_STAFF', 'ADMIN', 'SUPER_ADMIN']),
  departmentId: z.string().uuid().optional(),
});

export const updateUserStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']),
  reason: z.string().trim().max(500).optional(),
});

export const assignRoleSchema = z.object({
  role: z.enum(APP_ROLES),
});

export const userSearchQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  role: z.enum(APP_ROLES).optional(),
  status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const facultyInputSchema = z.object({
  name: z.string().trim().min(2).max(150),
  code: z.string().trim().min(2).max(20).toUpperCase(),
  description: z.string().trim().max(1000).optional(),
});

export const departmentInputSchema = z.object({
  facultyId: z.string().uuid(),
  name: z.string().trim().min(2).max(150),
  code: z.string().trim().min(2).max(20).toUpperCase(),
  description: z.string().trim().max(1000).optional(),
});

export const programmeInputSchema = z.object({
  departmentId: z.string().uuid(),
  name: z.string().trim().min(2).max(150),
  code: z.string().trim().min(2).max(30).toUpperCase(),
  level: z.enum(PROGRAMME_LEVELS).default('UNDERGRADUATE'),
  durationYears: z.number().int().min(1).max(8).default(4),
});

export const courseInputSchema = z.object({
  departmentId: z.string().uuid(),
  programmeId: z.string().uuid().optional(),
  code: z.string().trim().min(2).max(20).toUpperCase(),
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).optional(),
  yearLevel: z.number().int().min(1).max(8).optional(),
  creditUnits: z.number().int().min(1).max(20).optional(),
});

export const academicYearInputSchema = z.object({
  name: z.string().trim().regex(/^\d{4}\/\d{4}$/, 'Expected format YYYY/YYYY'),
  startDate: z.string().date(),
  endDate: z.string().date(),
  isCurrent: z.boolean().default(false),
});

export const semesterInputSchema = z.object({
  academicYearId: z.string().uuid(),
  name: z.string().trim().min(2).max(30),
  startDate: z.string().date(),
  endDate: z.string().date(),
  isCurrent: z.boolean().default(false),
});

export { studentIdSchema };
