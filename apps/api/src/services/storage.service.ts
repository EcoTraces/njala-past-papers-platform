import { createHash, randomUUID } from 'node:crypto';
import { ALLOWED_PAPER_EXTENSIONS, ALLOWED_PAPER_MIME_TYPES, MAX_PAPER_UPLOAD_BYTES } from '@njala/shared';
import { supabaseAdmin } from '../lib/supabase.js';
import { env } from '../config/env.js';
import { ValidationError } from '../lib/errors.js';

const PDF_MAGIC_BYTES = Buffer.from('%PDF-', 'ascii');

export interface ValidatedUpload {
  buffer: Buffer;
  checksumSha256: string;
  sizeBytes: number;
  mimeType: string;
}

/**
 * Validates a candidate paper upload against four independent checks -
 * declared MIME type, filename extension, size limit, and a magic-byte
 * sniff of the actual content - so a renamed non-PDF can't slip through
 * by satisfying only one or two of them (e.g. a "report.pdf" that is
 * actually a script, or a real PDF renamed "report.pdf.exe"). The
 * filename is used only for this check and for display
 * (original_filename) - never as part of the storage path.
 */
export function validatePaperUpload(buffer: Buffer, declaredMimeType: string, originalFilename?: string): ValidatedUpload {
  if (buffer.length === 0) {
    throw new ValidationError('Uploaded file is empty');
  }
  if (buffer.length > MAX_PAPER_UPLOAD_BYTES) {
    throw new ValidationError(`File exceeds the ${MAX_PAPER_UPLOAD_BYTES / (1024 * 1024)}MB limit`);
  }
  if (!ALLOWED_PAPER_MIME_TYPES.includes(declaredMimeType as (typeof ALLOWED_PAPER_MIME_TYPES)[number])) {
    throw new ValidationError('Only PDF files are accepted');
  }
  if (originalFilename) {
    const lowerName = originalFilename.toLowerCase();
    const hasAllowedExtension = ALLOWED_PAPER_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    if (!hasAllowedExtension) {
      throw new ValidationError(`File name must end in ${ALLOWED_PAPER_EXTENSIONS.join(' or ')}`);
    }
  }
  if (!buffer.subarray(0, 5).equals(PDF_MAGIC_BYTES)) {
    throw new ValidationError('File content does not match a valid PDF (failed signature check)');
  }

  const checksumSha256 = createHash('sha256').update(buffer).digest('hex');

  return { buffer, checksumSha256, sizeBytes: buffer.length, mimeType: 'application/pdf' };
}

/** Generates a random, non-guessable object key - never derived from user input. */
export function generateStorageKey(courseCode: string): string {
  const datePrefix = new Date().toISOString().slice(0, 10);
  const safeCourseCode = courseCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'PAPER';
  return `${safeCourseCode}/${datePrefix}/${randomUUID()}.pdf`;
}

export async function uploadPaperFile(storagePath: string, buffer: Buffer): Promise<void> {
  const { error } = await supabaseAdmin.storage
    .from(env.SUPABASE_STORAGE_BUCKET)
    .upload(storagePath, buffer, { contentType: 'application/pdf', upsert: false });
  if (error) {
    throw new Error(`Failed to upload paper file: ${error.message}`);
  }
}

export async function createSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabaseAdmin.storage
    .from(env.SUPABASE_STORAGE_BUCKET)
    .createSignedUrl(storagePath, env.SIGNED_URL_EXPIRY_SECONDS);
  if (error || !data) {
    throw new Error(`Failed to create signed URL: ${error?.message ?? 'unknown error'}`);
  }
  return data.signedUrl;
}

export async function deletePaperFile(storagePath: string): Promise<void> {
  const { error } = await supabaseAdmin.storage.from(env.SUPABASE_STORAGE_BUCKET).remove([storagePath]);
  if (error) {
    throw new Error(`Failed to delete paper file: ${error.message}`);
  }
}
