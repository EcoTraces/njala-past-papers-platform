import type { FastifyInstance } from 'fastify';
import { z, type AnyZodObject } from 'zod';
import {
  facultyInputSchema,
  departmentInputSchema,
  programmeInputSchema,
  courseInputSchema,
  academicYearInputSchema,
  semesterInputSchema,
} from '@njala/shared';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { recordAuditEvent } from '../services/audit.service.js';
import { BadRequestError, NotFoundError } from '../lib/errors.js';

const ADMIN_ONLY = requireRole('ADMIN', 'SUPER_ADMIN');

/**
 * Generic, table-backed CRUD registrar so the academic structure
 * endpoints (which all share the same read-all / admin-write shape)
 * don't repeat five near-identical handlers.
 */
function registerCrud(
  app: FastifyInstance,
  opts: {
    path: string;
    table: string;
    tag: string;
    schema: AnyZodObject;
    select?: string;
    orderBy?: string;
    softDelete?: boolean;
    parents?: Array<{ field: string; table: string; label: string; softDelete?: boolean }>;
  },
) {
  const select = opts.select ?? '*';
  const orderBy = opts.orderBy ?? 'name';
  const softDelete = opts.softDelete ?? true;

  app.get(opts.path, { preHandler: authenticate, schema: { tags: [opts.tag] } }, async (request) => {
    let query = request.db.from(opts.table).select(select);
    if (softDelete) query = query.is('deleted_at', null);
    const { data, error } = await query.order(orderBy, { nullsFirst: false });
    if (error) throw error;
    return { items: data };
  });

  app.get(`${opts.path}/:id`, { preHandler: authenticate, schema: { tags: [opts.tag] } }, async (request) => {
    const { id } = request.params as { id: string };
    const { data, error } = await request.db.from(opts.table).select(select).eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) throw new NotFoundError(opts.tag);
    return data;
  });

  app.post(opts.path, { preHandler: [authenticate, ADMIN_ONLY], schema: { tags: [opts.tag] } }, async (request, reply) => {
    for (const parent of opts.parents ?? []) {
      const body = request.body && typeof request.body === 'object' ? request.body as Record<string, unknown> : {};
      const id = body[parent.field];
      if (typeof id !== 'string' || !z.string().uuid().safeParse(id).success) {
        throw new BadRequestError(`Invalid ${parent.label.toLowerCase()}`);
      }
      let parentQuery = request.db.from(parent.table).select('id').eq('id', id);
      if (parent.softDelete) parentQuery = parentQuery.is('deleted_at', null);
      const { data, error: parentError } = await parentQuery.maybeSingle();
      if (parentError) throw parentError;
      if (!data) throw new BadRequestError(`${parent.label} not found`);
    }

    const input = opts.schema.parse(request.body);
    const { data, error } = await request.db.from(opts.table).insert(toSnakeCase(input)).select().single();
    if (error) {
      if (error.code === '23503' && opts.parents?.length) {
        throw new BadRequestError(`Invalid ${opts.parents[0]!.label.toLowerCase()}`);
      }
      throw error;
    }
    await recordAuditEvent({ actorId: request.user!.id, action: `${opts.table}.create`, entityType: opts.table, entityId: data.id, request });
    reply.status(201);
    return data;
  });

  app.patch(`${opts.path}/:id`, { preHandler: [authenticate, ADMIN_ONLY], schema: { tags: [opts.tag] } }, async (request) => {
    const { id } = request.params as { id: string };
    const input = opts.schema.partial().parse(request.body);
    const { data, error } = await request.db.from(opts.table).update(toSnakeCase(input)).eq('id', id).select().single();
    if (error) throw error;
    await recordAuditEvent({ actorId: request.user!.id, action: `${opts.table}.update`, entityType: opts.table, entityId: id, request });
    return data;
  });

  app.delete(`${opts.path}/:id`, { preHandler: [authenticate, ADMIN_ONLY], schema: { tags: [opts.tag] } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { error } = softDelete
      ? await request.db.from(opts.table).update({ deleted_at: new Date().toISOString() }).eq('id', id)
      : await request.db.from(opts.table).delete().eq('id', id);
    if (error) throw error;
    await recordAuditEvent({ actorId: request.user!.id, action: `${opts.table}.delete`, entityType: opts.table, entityId: id, request });
    reply.status(204);
  });
}

function toSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    out[key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)] = value;
  }
  return out;
}

export async function academicRoutes(app: FastifyInstance): Promise<void> {
  registerCrud(app, { path: '/faculties', table: 'faculties', tag: 'academic', schema: facultyInputSchema });
  registerCrud(app, {
    path: '/departments', table: 'departments', tag: 'academic', schema: departmentInputSchema,
    parents: [{ field: 'facultyId', table: 'faculties', label: 'Faculty', softDelete: true }],
  });
  registerCrud(app, {
    path: '/programmes', table: 'programmes', tag: 'academic', schema: programmeInputSchema,
    parents: [{ field: 'departmentId', table: 'departments', label: 'Department', softDelete: true }],
  });
  registerCrud(app, {
    path: '/courses', table: 'courses', tag: 'academic', schema: courseInputSchema, orderBy: 'code',
    parents: [
      { field: 'departmentId', table: 'departments', label: 'Department', softDelete: true },
      { field: 'programmeId', table: 'programmes', label: 'Programme', softDelete: true },
    ],
  });
  registerCrud(app, {
    path: '/academic-years',
    table: 'academic_years',
    tag: 'academic',
    schema: academicYearInputSchema,
    orderBy: 'start_date',
    softDelete: false,
  });
  registerCrud(app, {
    path: '/semesters',
    table: 'semesters',
    tag: 'academic',
    schema: semesterInputSchema,
    orderBy: 'start_date',
    softDelete: false,
    parents: [{ field: 'academicYearId', table: 'academic_years', label: 'Academic year' }],
  });

  // Courses a lecturer is authorized to manage - used to drive "My Courses".
  app.get('/courses/mine', { preHandler: authenticate, schema: { tags: ['academic'] } }, async (request) => {
    const { data, error } = await request.db
      .from('course_lecturers')
      .select('courses(*)')
      .eq('lecturer_id', request.user!.id);
    if (error) throw error;
    return { items: (data ?? []).map((row) => (row as unknown as { courses: unknown }).courses) };
  });
}
