import { randomInt } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { createStaffAccountSchema, updateUserStatusSchema, assignRoleSchema, userSearchQuerySchema } from '@njala/shared';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/authorize.js';
import { recordAuditEvent } from '../services/audit.service.js';
import { notifyUser } from '../services/notifications.service.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../lib/errors.js';

const ADMIN_ROLES = requireRole('ADMIN', 'SUPER_ADMIN');

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authenticate);
  app.addHook('preHandler', ADMIN_ROLES);

  app.get('/users', { schema: { tags: ['admin'] } }, async (request) => {
    const query = userSearchQuerySchema.parse(request.query);
    let dbQuery = request.db.from('profiles').select('id, student_id, staff_id, full_name, status, created_at, user_roles(roles(name))', { count: 'exact' });
    if (query.status) dbQuery = dbQuery.eq('status', query.status);
    if (query.q) dbQuery = dbQuery.or(`full_name.ilike.%${query.q}%,student_id.ilike.%${query.q}%,staff_id.ilike.%${query.q}%`);

    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;
    const { data, error, count } = await dbQuery.range(from, to).order('created_at', { ascending: false });
    if (error) throw error;
    return { items: data, total: count ?? 0, page: query.page, pageSize: query.pageSize };
  });

  /**
   * Provisions a privileged (LECTURER/LIBRARY_STAFF/ADMIN/SUPER_ADMIN)
   * account. This is the ONLY way such accounts come into existence -
   * there is no public sign-up path for them. Only a SUPER_ADMIN may
   * provision another SUPER_ADMIN.
   */
  app.post('/staff', { schema: { tags: ['admin'], summary: 'Provision a privileged staff account' } }, async (request, reply) => {
    const input = createStaffAccountSchema.parse(request.body);

    if (input.role === 'SUPER_ADMIN' && !request.user!.roles.includes('SUPER_ADMIN')) {
      throw new ForbiddenError('Only a SUPER_ADMIN may provision another SUPER_ADMIN account');
    }

    const { data: existing } = await supabaseAdmin.from('profiles').select('id').eq('staff_id', input.staffId).maybeSingle();
    if (existing) throw new ConflictError('This staff ID is already registered');

    const temporaryPassword = generateTemporaryPassword();
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: input.email,
      password: temporaryPassword,
      email_confirm: true,
    });
    if (createError || !created?.user) {
      throw new ValidationError(createError?.message ?? 'Could not create staff account');
    }

    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: created.user.id,
      staff_id: input.staffId,
      full_name: input.fullName,
      contact_email: input.email,
      department_id: input.departmentId ?? null,
      status: 'ACTIVE',
      created_by: request.user!.id,
    });
    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw new ValidationError(`Could not create profile: ${profileError.message}`);
    }

    const { data: role } = await supabaseAdmin.from('roles').select('id').eq('name', input.role).single();
    await supabaseAdmin.from('user_roles').insert({ user_id: created.user.id, role_id: role!.id, granted_by: request.user!.id });

    await recordAuditEvent({ actorId: request.user!.id, action: 'user.create_staff', entityType: 'profiles', entityId: created.user.id, request, metadata: { role: input.role } });

    reply.status(201);
    return { id: created.user.id, email: input.email, temporaryPassword, message: 'Share the temporary password with the user through a secure channel; they should change it on first login.' };
  });

  app.patch('/users/:id/status', { schema: { tags: ['admin'] } }, async (request) => {
    const { id } = request.params as { id: string };
    const input = updateUserStatusSchema.parse(request.body);

    const { data, error } = await supabaseAdmin.from('profiles').update({ status: input.status }).eq('id', id).select().single();
    if (error) throw error;
    if (!data) throw new NotFoundError('User');

    await recordAuditEvent({ actorId: request.user!.id, action: 'user.status_change', entityType: 'profiles', entityId: id, request, metadata: { status: input.status, reason: input.reason } });
    await notifyUser({ userId: id, type: 'ACCOUNT_STATUS_CHANGE', title: `Your account status changed to ${input.status}`, body: input.reason ?? '' });
    return data;
  });

  app.post('/users/:id/roles', { schema: { tags: ['admin'] } }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const input = assignRoleSchema.parse(request.body);

    if (input.role === 'SUPER_ADMIN' && !request.user!.roles.includes('SUPER_ADMIN')) {
      throw new ForbiddenError('Only a SUPER_ADMIN may grant the SUPER_ADMIN role');
    }

    const { data: role } = await request.db.from('roles').select('id').eq('name', input.role).single();
    const { error } = await request.db.from('user_roles').insert({ user_id: id, role_id: role!.id, granted_by: request.user!.id });
    if (error) throw error;

    await recordAuditEvent({ actorId: request.user!.id, action: 'user.role_grant', entityType: 'profiles', entityId: id, request, metadata: { role: input.role } });
    reply.status(201);
    return { userId: id, role: input.role };
  });

  app.delete('/users/:id/roles/:role', { schema: { tags: ['admin'] } }, async (request, reply) => {
    const { id, role } = request.params as { id: string; role: string };

    if (role === 'SUPER_ADMIN' && !request.user!.roles.includes('SUPER_ADMIN')) {
      throw new ForbiddenError('Only a SUPER_ADMIN may revoke the SUPER_ADMIN role');
    }

    const { data: roleRow } = await request.db.from('roles').select('id').eq('name', role).single();
    const { error } = await request.db.from('user_roles').delete().eq('user_id', id).eq('role_id', roleRow!.id);
    if (error) throw error;

    await recordAuditEvent({ actorId: request.user!.id, action: 'user.role_revoke', entityType: 'profiles', entityId: id, request, metadata: { role } });
    reply.status(204);
  });

  app.get('/audit-logs', { schema: { tags: ['admin'] } }, async (request) => {
    const { page = '1', pageSize = '50' } = request.query as { page?: string; pageSize?: string };
    const p = Math.max(1, Number(page));
    const size = Math.min(200, Math.max(1, Number(pageSize)));
    const from = (p - 1) * size;
    const to = from + size - 1;

    const { data, error, count } = await request.db
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);
    if (error) throw error;
    return { items: data, total: count ?? 0, page: p, pageSize: size };
  });

  app.get('/system-settings', { schema: { tags: ['admin'] } }, async (request) => {
    const { data, error } = await request.db.from('system_settings').select('*');
    if (error) throw error;
    return { items: data };
  });

  app.patch('/system-settings/:key', { schema: { tags: ['admin'] } }, async (request) => {
    const { key } = request.params as { key: string };
    const { value } = request.body as { value: unknown };
    const { data, error } = await request.db
      .from('system_settings')
      .update({ value, updated_by: request.user!.id })
      .eq('key', key)
      .select()
      .single();
    if (error) throw error;
    await recordAuditEvent({ actorId: request.user!.id, action: 'system_settings.update', entityType: 'system_settings', entityId: key, request, metadata: { value } });
    return data;
  });
}

function generateTemporaryPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let out = '';
  for (let i = 0; i < 16; i += 1) {
    out += chars[randomInt(chars.length)];
  }
  return out;
}
