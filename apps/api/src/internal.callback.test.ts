import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * HTTP-level tests for POST /api/internal/processing-callback, the
 * trust boundary between apps/document-service and this API (see
 * SECURITY.md). Drives the real Fastify app with app.inject() against
 * a small in-memory fake of the two tables the callback touches, so
 * these assert genuine DB-state transitions (PROCESSING wiring,
 * automatic retry of a recoverable failure) rather than just that a
 * handler function was called.
 */

type Row = Record<string, unknown>;

function makeFakeDb() {
  const tables = { document_processing_jobs: [] as Row[], examination_papers: [] as Row[] };

  function getTable(name: string): Row[] {
    if (name === 'document_processing_jobs' || name === 'examination_papers') return tables[name];
    throw new Error(`fake DB: unexpected table "${name}"`);
  }

  function applyFilters(rows: Row[], filters: Array<[string, unknown]>): Row[] {
    return rows.filter((r) => filters.every(([k, v]) => r[k] === v));
  }

  return {
    tables,
    from(table: string) {
      return {
        select: () => {
          const filters: Array<[string, unknown]> = [];
          const builder = {
            eq(col: string, val: unknown) {
              filters.push([col, val]);
              return builder;
            },
            async maybeSingle() {
              const result = applyFilters(getTable(table), filters);
              return { data: result[0] ?? null, error: null };
            },
          };
          return builder;
        },
        update: (patch: Row) => ({
          async eq(col: string, val: unknown) {
            const matched = applyFilters(getTable(table), [[col, val]]);
            matched.forEach((row) => Object.assign(row, patch));
            return { data: matched, error: null };
          },
        }),
      };
    },
  };
}

const fakeDb = makeFakeDb();

vi.mock('./lib/supabase.js', () => ({ supabaseAdmin: fakeDb, supabaseAnon: fakeDb, supabaseForUser: () => fakeDb }));
vi.mock('./services/storage.service.js', () => ({ createSignedUrl: vi.fn(async (path: string) => `https://storage.example.com/signed/${path}`) }));

const { buildApp } = await import('./app.js');
const { env } = await import('./config/env.js');

function seedJob(overrides: Row): void {
  fakeDb.tables.document_processing_jobs.push({ id: '11111111-1111-1111-1111-111111111111', paper_id: '22222222-2222-2222-2222-222222222222', status: 'QUEUED', attempts: 0, ...overrides });
}

function seedPaper(overrides: Row = {}): void {
  fakeDb.tables.examination_papers.push({ id: '22222222-2222-2222-2222-222222222222', storage_path: 'CSC101/test/paper-1.pdf', ocr_status: 'QUEUED', ...overrides });
}

function firstJob(): Row {
  const job = fakeDb.tables.document_processing_jobs[0];
  if (!job) throw new Error('no job row seeded');
  return job;
}

function firstPaper(): Row {
  const paper = fakeDb.tables.examination_papers[0];
  if (!paper) throw new Error('no paper row seeded');
  return paper;
}

describe('POST /api/internal/processing-callback', () => {
  let app: FastifyInstance;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    fakeDb.tables.document_processing_jobs.length = 0;
    fakeDb.tables.examination_papers.length = 0;
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function post(body: Record<string, unknown>, secret = env.DOCUMENT_SERVICE_CALLBACK_SECRET) {
    return app.inject({
      method: 'POST',
      url: '/api/internal/processing-callback',
      headers: { 'content-type': 'application/json', 'x-internal-secret': secret },
      payload: body,
    });
  }

  it('rejects a request with the wrong (or missing) internal secret', async () => {
    seedJob({});
    seedPaper();
    const res = await post({ jobId: '11111111-1111-1111-1111-111111111111', paperId: '22222222-2222-2222-2222-222222222222', status: 'COMPLETED' }, 'wrong-secret');
    expect(res.statusCode).toBe(401);
  });

  it('rejects an unknown job/paper combination (defense against a forged jobId)', async () => {
    const res = await post({ jobId: '99999999-9999-9999-9999-999999999999', paperId: '22222222-2222-2222-2222-222222222222', status: 'COMPLETED' });
    expect(res.statusCode).toBe(422);
  });

  it('PROCESSING sets started_at and moves both the job and the paper into a genuine PROCESSING state', async () => {
    seedJob({});
    seedPaper();
    const res = await post({ jobId: '11111111-1111-1111-1111-111111111111', paperId: '22222222-2222-2222-2222-222222222222', status: 'PROCESSING' });
    expect(res.statusCode).toBe(204);

    const job = firstJob();
    expect(job.status).toBe('PROCESSING');
    expect(job.started_at).toBeTruthy();
    const paper = firstPaper();
    expect(paper.ocr_status).toBe('PROCESSING');
  });

  it('COMPLETED writes the extracted text/page count onto the paper and marks the job done', async () => {
    seedJob({});
    seedPaper();
    const res = await post({ jobId: '11111111-1111-1111-1111-111111111111', paperId: '22222222-2222-2222-2222-222222222222', status: 'COMPLETED', extractedText: 'Question 1: ...', pageCount: 3, ocrUsed: true });
    expect(res.statusCode).toBe(204);

    const job = firstJob();
    expect(job.status).toBe('COMPLETED');
    const paper = firstPaper();
    expect(paper.ocr_status).toBe('COMPLETED');
    expect(paper.extracted_text).toBe('Question 1: ...');
    expect(paper.page_count).toBe(3);
  });

  it('a recoverable FAILED report below the retry cap is automatically re-queued and re-dispatched, not left FAILED', async () => {
    seedJob({ attempts: 0 });
    seedPaper();
    const res = await post({ jobId: '11111111-1111-1111-1111-111111111111', paperId: '22222222-2222-2222-2222-222222222222', status: 'FAILED', errorMessage: 'timed out', recoverable: true });
    expect(res.statusCode).toBe(204);

    const job = firstJob();
    expect(job.status).toBe('QUEUED');
    expect(job.attempts).toBe(1);
    const paper = firstPaper();
    expect(paper.ocr_status).toBe('QUEUED');
    expect(fetchMock).toHaveBeenCalledTimes(1); // re-dispatched to the document-processing service
  });

  it('a recoverable FAILED report that has already exhausted the retry cap is left permanently FAILED', async () => {
    seedJob({ attempts: 2 }); // already at MAX_AUTO_REPROCESS_ATTEMPTS
    seedPaper();
    const res = await post({ jobId: '11111111-1111-1111-1111-111111111111', paperId: '22222222-2222-2222-2222-222222222222', status: 'FAILED', errorMessage: 'timed out again', recoverable: true });
    expect(res.statusCode).toBe(204);

    const job = firstJob();
    expect(job.status).toBe('FAILED');
    const paper = firstPaper();
    expect(paper.ocr_status).toBe('FAILED');
    expect(fetchMock).not.toHaveBeenCalled(); // no more automatic retries
  });

  it('a non-recoverable FAILED report (e.g. a corrupt PDF) is left FAILED immediately, even on the very first attempt', async () => {
    seedJob({ attempts: 0 });
    seedPaper();
    const res = await post({ jobId: '11111111-1111-1111-1111-111111111111', paperId: '22222222-2222-2222-2222-222222222222', status: 'FAILED', errorMessage: 'Could not open PDF', recoverable: false });
    expect(res.statusCode).toBe(204);

    const job = firstJob();
    expect(job.status).toBe('FAILED');
    expect(job.error_message).toBe('Could not open PDF');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
