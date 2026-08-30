import type { FastifyReply, FastifyRequest } from 'fastify';
import { roleHasPermission, type AppRole, type Permission } from '@njala/shared';
import { ForbiddenError, UnauthorizedError } from '../lib/errors.js';

/**
 * Requires the caller to hold at least one of the given roles. Never
 * trusts anything from the request body/query - roles come only from
 * request.user, which authenticate() populated from the database.
 */
export function requireRole(...roles: AppRole[]) {
  return async function requireRoleHandler(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!request.user) throw new UnauthorizedError();
    const authorized = request.user.roles.some((r) => roles.includes(r));
    if (!authorized) {
      throw new ForbiddenError(`This action requires one of: ${roles.join(', ')}`);
    }
  };
}

export function requirePermission(permission: Permission) {
  return async function requirePermissionHandler(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    if (!request.user) throw new UnauthorizedError();
    const authorized = request.user.roles.some((role) => roleHasPermission(role, permission));
    if (!authorized) {
      throw new ForbiddenError(`This action requires the "${permission}" permission`);
    }
  };
}

export function isStaffRole(roles: AppRole[]): boolean {
  return roles.some((r) => ['LECTURER', 'LIBRARY_STAFF', 'ADMIN', 'SUPER_ADMIN'].includes(r));
}

export function isAdminRole(roles: AppRole[]): boolean {
  return roles.some((r) => ['ADMIN', 'SUPER_ADMIN'].includes(r));
}
