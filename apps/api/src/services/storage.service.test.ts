import { describe, expect, it } from 'vitest';
import { generateStorageKey, validatePaperUpload } from './storage.service.js';
import { ValidationError } from '../lib/errors.js';

const PDF_HEADER = Buffer.from('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n', 'binary');

describe('validatePaperUpload', () => {
  it('accepts a buffer that starts with the PDF magic bytes', () => {
    const buffer = Buffer.concat([PDF_HEADER, Buffer.from('rest of file')]);
    const result = validatePaperUpload(buffer, 'application/pdf');
    expect(result.mimeType).toBe('application/pdf');
    expect(result.sizeBytes).toBe(buffer.length);
    expect(result.checksumSha256).toHaveLength(64);
  });

  it('rejects a file whose content does not start with %PDF- even if declared as application/pdf', () => {
    const buffer = Buffer.from('this is definitely not a pdf');
    expect(() => validatePaperUpload(buffer, 'application/pdf')).toThrow(ValidationError);
  });

  it('rejects a non-PDF declared MIME type outright', () => {
    const buffer = Buffer.concat([PDF_HEADER, Buffer.from('x')]);
    expect(() => validatePaperUpload(buffer, 'image/png')).toThrow(ValidationError);
  });

  it('rejects an empty file', () => {
    expect(() => validatePaperUpload(Buffer.alloc(0), 'application/pdf')).toThrow(ValidationError);
  });

  it('rejects a file over the size limit', () => {
    const oversized = Buffer.concat([PDF_HEADER, Buffer.alloc(26 * 1024 * 1024)]);
    expect(() => validatePaperUpload(oversized, 'application/pdf')).toThrow(ValidationError);
  });

  it('produces different checksums for different content (duplicate detection depends on this)', () => {
    const a = validatePaperUpload(Buffer.concat([PDF_HEADER, Buffer.from('A')]), 'application/pdf');
    const b = validatePaperUpload(Buffer.concat([PDF_HEADER, Buffer.from('B')]), 'application/pdf');
    expect(a.checksumSha256).not.toBe(b.checksumSha256);
  });

  it('produces the same checksum for identical content (duplicate detection depends on this)', () => {
    const content = Buffer.concat([PDF_HEADER, Buffer.from('identical')]);
    const a = validatePaperUpload(Buffer.from(content), 'application/pdf');
    const b = validatePaperUpload(Buffer.from(content), 'application/pdf');
    expect(a.checksumSha256).toBe(b.checksumSha256);
  });
});

describe('generateStorageKey', () => {
  it('never uses the raw course code as the only path segment (must include a random component)', () => {
    const key1 = generateStorageKey('CSC101');
    const key2 = generateStorageKey('CSC101');
    expect(key1).not.toBe(key2);
    expect(key1.startsWith('CSC101/')).toBe(true);
    expect(key1.endsWith('.pdf')).toBe(true);
  });

  it('sanitizes non-alphanumeric characters out of the course code segment', () => {
    const key = generateStorageKey('../../etc/passwd');
    expect(key.startsWith('../')).toBe(false);
    expect(key).not.toContain('..');
    expect(key).not.toContain('/etc/');
  });

  it('falls back to a safe default when the course code sanitizes to nothing', () => {
    const key = generateStorageKey('???');
    expect(key.startsWith('PAPER/')).toBe(true);
  });
});
