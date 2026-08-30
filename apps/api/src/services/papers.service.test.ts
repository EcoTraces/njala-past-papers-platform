import { describe, expect, it } from 'vitest';
import { assertValidTransition } from './papers.service.js';
import { ConflictError } from '../lib/errors.js';

describe('assertValidTransition (paper workflow state machine)', () => {
  it('allows DRAFT -> SUBMITTED', () => {
    expect(() => assertValidTransition('DRAFT', 'SUBMITTED')).not.toThrow();
  });

  it('allows the full happy path through to PUBLISHED then ARCHIVED', () => {
    expect(() => assertValidTransition('SUBMITTED', 'UNDER_REVIEW')).not.toThrow();
    expect(() => assertValidTransition('UNDER_REVIEW', 'APPROVED')).not.toThrow();
    expect(() => assertValidTransition('APPROVED', 'PUBLISHED')).not.toThrow();
    expect(() => assertValidTransition('PUBLISHED', 'ARCHIVED')).not.toThrow();
  });

  it('allows rejection from SUBMITTED or UNDER_REVIEW, and resubmission from REJECTED', () => {
    expect(() => assertValidTransition('SUBMITTED', 'REJECTED')).not.toThrow();
    expect(() => assertValidTransition('UNDER_REVIEW', 'REJECTED')).not.toThrow();
    expect(() => assertValidTransition('REJECTED', 'DRAFT')).not.toThrow();
  });

  it('rejects skipping straight from DRAFT to PUBLISHED', () => {
    expect(() => assertValidTransition('DRAFT', 'PUBLISHED')).toThrow(ConflictError);
  });

  it('rejects skipping the review step from SUBMITTED to APPROVED', () => {
    expect(() => assertValidTransition('SUBMITTED', 'APPROVED')).toThrow(ConflictError);
  });

  it('rejects any transition out of a terminal ARCHIVED state', () => {
    expect(() => assertValidTransition('ARCHIVED', 'PUBLISHED')).toThrow(ConflictError);
    expect(() => assertValidTransition('ARCHIVED', 'DRAFT')).toThrow(ConflictError);
  });

  it('rejects moving a published paper back to draft', () => {
    expect(() => assertValidTransition('PUBLISHED', 'DRAFT')).toThrow(ConflictError);
  });
});
