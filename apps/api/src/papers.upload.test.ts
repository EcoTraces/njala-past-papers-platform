import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

const mocks = vi.hoisted(() => {
  const inserted: Array<Record<string, unknown>> = [];
  const course = {
    id: '11111111-1111-4111-8111-111111111111',
    code: 'CSC101',
    department_id: '22222222-2222-4222-8222-222222222222',
    faculty: { faculty_id: '33333333-3333-4333-8333-333333333333' },
  };

  const db = {
    from(table: string) {
      if (table === 'courses') {
        return {
          select() {
            return {
              eq() {
                return { single: async () => ({ data: course, error: null }) };
              },
            };
          },
        };
      }
      if (table === 'examination_papers') {
        return {
          insert(value: Record<string, unknown>) {
            inserted.push(value);
            return {
              select() {
                return { single: async () => ({ data: { id: '44444444-4444-4444-8444-444444444444', ...value }, error: null }) };
              },
            };
          },
        };
      }
      throw new Error(`Unexpected database table: ${table}`);
    },
  };

  return { db, inserted, course };
});

vi.mock('./lib/supabase.js', () => ({
  supabaseAdmin: mocks.db,
  supabaseAnon: mocks.db,
  supabaseForUser: () => mocks.db,
}));
vi.mock('./middleware/authenticate.js', () => ({
  authenticate: async (request: { user?: unknown; db?: unknown }) => {
    request.user = { id: '20000000-0000-0000-0000-000000000001', roles: ['LECTURER'] };
    request.db = mocks.db;
  },
}));
vi.mock('./services/storage.service.js', () => ({
  generateStorageKey: () => 'papers/CSC101/test.pdf',
  uploadPaperFile: async () => undefined,
  deletePaperFile: async () => undefined,
  validatePaperUpload: (buffer: Buffer) => ({
    buffer,
    sizeBytes: buffer.length,
    mimeType: 'application/pdf',
    checksumSha256: 'test-checksum',
  }),
  createSignedUrl: async () => 'https://example.test/paper.pdf',
}));
vi.mock('./services/documentProcessing.service.js', () => ({
  queueDocumentProcessing: async () => undefined,
  reprocessPaper: async () => undefined,
}));
vi.mock('./services/audit.service.js', () => ({ recordAuditEvent: async () => undefined }));
vi.mock('./services/notifications.service.js', () => ({ notifyUser: async () => undefined }));

const { buildApp } = await import('./app.js');

function multipartUpload(): string {
  const boundary = 'upload-test-boundary';
  const fields: Record<string, string> = {
    title: 'CSC101 final examination',
    courseId: mocks.course.id,
    academicYearId: '55555555-5555-4555-8555-555555555555',
    semesterId: '66666666-6666-4666-8666-666666666666',
    examinationType: 'END_OF_SEMESTER',
    paperType: 'THEORY',
    filename: 'paper.pdf',
  };
  const parts = Object.entries(fields).map(([name, value]) =>
    `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
  );
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="paper.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-test\r\n`);
  parts.push(`--${boundary}--\r\n`);
  return parts.join('');
}

describe('POST /api/papers', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows a lecturer to upload a paper for a course without a course assignment', async () => {
    mocks.inserted.length = 0;
    const response = await app.inject({
      method: 'POST',
      url: '/api/papers',
      headers: {
        authorization: 'Bearer lecturer-token',
        'content-type': 'multipart/form-data; boundary=upload-test-boundary',
      },
      payload: multipartUpload(),
    });

    expect(response.statusCode).toBe(201);
    expect(mocks.inserted[0]).toMatchObject({
      course_id: mocks.course.id,
      uploaded_by: '20000000-0000-0000-0000-000000000001',
      status: 'DRAFT',
    });
  });
});
