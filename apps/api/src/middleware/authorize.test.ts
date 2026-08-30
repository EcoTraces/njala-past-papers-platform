import { describe, expect, it } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { isAdminRole, isStaffRole, requirePermission, requireRole } from './authorize.js';
import { UnauthorizedError, ForbiddenError } from '../lib/errors.js';

function fakeRequest(roles: string[] | undefined): FastifyRequest {
  return {
    user: roles ? { id: 'u1', studentId: null, staffId: null, fullName: 'Test', status: 'ACTIVE', roles, accessToken: 't' } : undefined,
  } as unknown as FastifyRequest;
}

describe('requireRole', () => {
  it('rejects an unauthenticated request', async () => {
    const handler = requireRole('ADMIN');
    await expect(handler(fakeRequest(undefined), {} as never)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('rejects a user without any of the required roles', async () => {
    const handler = requireRole('ADMIN', 'SUPER_ADMIN');
    await expect(handler(fakeRequest(['STUDENT']), {} as never)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('allows a user holding one of several accepted roles', async () => {
    const handler = requireRole('LIBRARY_STAFF', 'ADMIN', 'SUPER_ADMIN');
    await expect(handler(fakeRequest(['LIBRARY_STAFF']), {} as never)).resolves.toBeUndefined();
  });

  it('never trusts a role that is not present on request.user', async () => {
    // A STUDENT-only user must never pass an ADMIN check, no matter
    // what the caller might have put in the request body/query - the
    // handler only ever looks at request.user.roles.
    const handler = requireRole('ADMIN');
    await expect(handler(fakeRequest(['STUDENT']), {} as never)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('requirePermission', () => {
  it('grants access when the role includes the permission', async () => {
    const handler = requirePermission('papers.approve');
    await expect(handler(fakeRequest(['LIBRARY_STAFF']), {} as never)).resolves.toBeUndefined();
  });

  it('denies access when no held role includes the permission', async () => {
    const handler = requirePermission('papers.approve');
    await expect(handler(fakeRequest(['STUDENT']), {} as never)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('denies a LECTURER the library-only papers.approve permission', async () => {
    const handler = requirePermission('papers.approve');
    await expect(handler(fakeRequest(['LECTURER']), {} as never)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('isStaffRole / isAdminRole', () => {
  it('treats STUDENT as neither staff nor admin', () => {
    expect(isStaffRole(['STUDENT'])).toBe(false);
    expect(isAdminRole(['STUDENT'])).toBe(false);
  });

  it('treats LECTURER/LIBRARY_STAFF as staff but not admin', () => {
    expect(isStaffRole(['LECTURER'])).toBe(true);
    expect(isAdminRole(['LECTURER'])).toBe(false);
    expect(isStaffRole(['LIBRARY_STAFF'])).toBe(true);
    expect(isAdminRole(['LIBRARY_STAFF'])).toBe(false);
  });

  it('treats ADMIN/SUPER_ADMIN as both staff and admin', () => {
    expect(isStaffRole(['ADMIN'])).toBe(true);
    expect(isAdminRole(['ADMIN'])).toBe(true);
    expect(isAdminRole(['SUPER_ADMIN'])).toBe(true);
  });
});
