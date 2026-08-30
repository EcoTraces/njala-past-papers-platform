import { describe, expect, it } from 'vitest';
import { APP_ROLES, PAPER_STATUSES, PAPER_STATUS_TRANSITIONS, ROLE_PERMISSIONS, roleHasPermission } from './enums.js';

describe('PAPER_STATUS_TRANSITIONS', () => {
  it('has an entry for every declared paper status', () => {
    for (const status of PAPER_STATUSES) {
      expect(PAPER_STATUS_TRANSITIONS).toHaveProperty(status);
    }
  });

  it('only ever points at other declared statuses', () => {
    for (const targets of Object.values(PAPER_STATUS_TRANSITIONS)) {
      for (const target of targets) {
        expect(PAPER_STATUSES).toContain(target);
      }
    }
  });

  it('has no forward path from the terminal ARCHIVED state', () => {
    expect(PAPER_STATUS_TRANSITIONS.ARCHIVED).toEqual([]);
  });

  it('never allows jumping directly from DRAFT to PUBLISHED', () => {
    expect(PAPER_STATUS_TRANSITIONS.DRAFT).not.toContain('PUBLISHED');
  });
});

describe('ROLE_PERMISSIONS', () => {
  it('has an entry for every declared role', () => {
    for (const role of APP_ROLES) {
      expect(ROLE_PERMISSIONS).toHaveProperty(role);
    }
  });

  it('never grants STUDENT any staff-only permission', () => {
    expect(roleHasPermission('STUDENT', 'papers.approve')).toBe(false);
    expect(roleHasPermission('STUDENT', 'users.manage')).toBe(false);
    expect(roleHasPermission('STUDENT', 'papers.upload')).toBe(false);
  });

  it('never grants LECTURER the library-only review/approve permissions', () => {
    expect(roleHasPermission('LECTURER', 'papers.approve')).toBe(false);
    expect(roleHasPermission('LECTURER', 'papers.review')).toBe(false);
  });

  it('grants SUPER_ADMIN every declared permission', () => {
    for (const permissions of Object.values(ROLE_PERMISSIONS)) {
      for (const permission of permissions) {
        expect(roleHasPermission('SUPER_ADMIN', permission)).toBe(true);
      }
    }
  });
});
