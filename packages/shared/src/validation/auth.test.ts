import { describe, expect, it } from 'vitest';
import { passwordSchema, studentIdSchema, studentLoginSchema } from './auth.js';

describe('studentIdSchema', () => {
  it('normalizes to uppercase', () => {
    expect(studentIdSchema.parse('nj2021cs0142')).toBe('NJ2021CS0142');
  });

  it('trims surrounding whitespace', () => {
    expect(studentIdSchema.parse('  NJ2021CS0142  ')).toBe('NJ2021CS0142');
  });

  it('accepts slashes and hyphens (common institutional formats)', () => {
    expect(studentIdSchema.parse('NJ/2021/CS/0142')).toBe('NJ/2021/CS/0142');
  });

  it('rejects a student ID containing spaces internally', () => {
    expect(() => studentIdSchema.parse('NJ 2021 CS')).toThrow();
  });

  it('rejects a student ID with script-injection-shaped content', () => {
    expect(() => studentIdSchema.parse('<script>alert(1)</script>')).toThrow();
  });

  it('rejects an empty string', () => {
    expect(() => studentIdSchema.parse('')).toThrow();
  });
});

describe('passwordSchema', () => {
  it('accepts a password with upper, lower and a digit', () => {
    expect(() => passwordSchema.parse('Abcdefg1')).not.toThrow();
  });

  it('rejects a password shorter than 8 characters', () => {
    expect(() => passwordSchema.parse('Ab1defg')).toThrow();
  });

  it('rejects a password with no digit', () => {
    expect(() => passwordSchema.parse('Abcdefgh')).toThrow();
  });

  it('rejects a password with no uppercase letter', () => {
    expect(() => passwordSchema.parse('abcdefg1')).toThrow();
  });
});

describe('studentLoginSchema', () => {
  it('normalizes the student ID as part of the composite schema', () => {
    const result = studentLoginSchema.parse({ studentId: 'nj2021cs0142', password: 'anything' });
    expect(result.studentId).toBe('NJ2021CS0142');
  });
});
