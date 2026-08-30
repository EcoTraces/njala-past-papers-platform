import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Exercises the real DB-write logic in documentProcessing.service.ts
 * (not just permission checks, unlike the RBAC HTTP-integration
 * suites) against a small in-memory fake of the two tables it touches,
 * plus a mocked global fetch standing in for apps/document-service.
 * This is what proves the Loop 07 fixes actually work: a dispatch
 * failure no longer leaves a job silently stuck at QUEUED forever, and
 * a transient failure is retried before giving up.
 */

type Row = Record<string, unknown>;

function makeFakeDb() {
  const tables = { document_processing_jobs: [] as Row[], examination_papers: [] as Row[] };
  let nextJobId = 1;

  function getTable(name: string): Row[] {
    if (name === 'document_processing_jobs' || name === 'examination_papers') return tables[name];
    throw new Error(`fake DB: unexpected table "${name}"`);
  }

  function applyFilters(rows: Row[], filters: Array<[string, unknown]>): Row[] {
    return rows.filter((r) => filters.every(([k, v]) => r[k] === v));
  }

  function selectBuilder(table: string) {
    const filters: Array<[string, unknown]> = [];
    let orderCol: string | null = null;
    let orderAscending = true;
    let limitN: number | null = null;

    const builder = {
      eq(col: string, val: unknown) {
        filters.push([col, val]);
        return builder;
      },
      order(col: string, opts?: { ascending?: boolean }) {
        orderCol = col;
        orderAscending = opts?.ascending ?? true;
        return builder;
      },
      limit(n: number) {
        limitN = n;
        return builder;
      },
      async maybeSingle() {
        let result = applyFilters(getTable(table), filters);
        if (orderCol) {
          const col = orderCol;
          result = [...result].sort((a, b) => {
            const av = String(a[col]);
            const bv = String(b[col]);
            return orderAscending ? av.localeCompare(bv) : bv.localeCompare(av);
          });
        }
        if (limitN != null) result = result.slice(0, limitN);
        return { data: result[0] ?? null, error: null };
      },
    };
    return builder;
  }

  return {
    tables,
    from(table: string) {
      return {
        insert: (values: Row) => ({
          select: () => ({
            async single() {
              const row: Row = { id: `job-${nextJobId++}`, attempts: 0, created_at: new Date(nextJobId).toISOString(), ...values };
              getTable(table).push(row);
              return { data: row, error: null };
            },
          }),
        }),
        select: () => selectBuilder(table),
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

vi.mock('../lib/supabase.js', () => ({ supabaseAdmin: fakeDb }));
vi.mock('./storage.service.js', () => ({ createSignedUrl: vi.fn(async (path: string) => `https://storage.example.com/signed/${path}`) }));

const { queueDocumentProcessing, reprocessPaper, autoRetryProcessingJob, shouldAutoRetry } = await import('./documentProcessing.service.js');
const { NotFoundError } = await import('../lib/errors.js');

function seedPaper(id: string, overrides: Row = {}): void {
  fakeDb.tables.examination_papers.push({ id, storage_path: `CSC101/test/${id}.pdf`, ocr_status: 'NOT_REQUIRED', ...overrides });
}

function jobsForPaper(paperId: string): Row[] {
  return fakeDb.tables.document_processing_jobs.filter((j) => j.paper_id === paperId);
}

function firstJobFor(paperId: string): Row {
  const job = jobsForPaper(paperId)[0];
  if (!job) throw new Error(`no job row found for paper ${paperId}`);
  return job;
}

describe('documentProcessing.service', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fakeDb.tables.document_processing_jobs.length = 0;
    fakeDb.tables.examination_papers.length = 0;
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('queueDocumentProcessing creates a QUEUED job and dispatches it in one successful call', async () => {
    seedPaper('paper-1');
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }));

    const jobId = await queueDocumentProcessing('paper-1', 'user-1');

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/jobs$/);
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ jobId, paperId: 'paper-1', fileUrl: 'https://storage.example.com/signed/CSC101/test/paper-1.pdf' });

    // A successful dispatch doesn't itself change status - the Python
    // service reports PROCESSING/COMPLETED/FAILED back asynchronously.
    const job = firstJobFor('paper-1');
    expect(job.status).toBe('QUEUED');
  });

  it('retries a transient dispatch failure once and succeeds without ever marking the job FAILED', async () => {
    seedPaper('paper-2');
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValueOnce(new Response(null, { status: 202 }));

    await queueDocumentProcessing('paper-2', 'user-1');

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const job = firstJobFor('paper-2');
    expect(job.status).toBe('QUEUED');
    const paper = fakeDb.tables.examination_papers.find((p) => p.id === 'paper-2');
    expect(paper?.ocr_status).toBe('QUEUED');
  });

  it('gives up after exhausting dispatch retries and marks the job/paper FAILED instead of leaving it silently stuck at QUEUED', async () => {
    seedPaper('paper-3');
    fetchMock.mockRejectedValue(new Error('document-service unreachable'));

    await queueDocumentProcessing('paper-3', 'user-1');

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3), { timeout: 5000 });
    const job = firstJobFor('paper-3');
    expect(job.status).toBe('FAILED');
    expect(String(job.error_message)).toContain('document-service unreachable');
    const paper = fakeDb.tables.examination_papers.find((p) => p.id === 'paper-3');
    expect(paper?.ocr_status).toBe('FAILED');
  }, 10000);

  it('reprocessPaper reuses the most recent job row, increments attempts, and re-dispatches', async () => {
    seedPaper('paper-4', { ocr_status: 'FAILED' });
    fakeDb.tables.document_processing_jobs.push({
      id: 'job-existing',
      paper_id: 'paper-4',
      status: 'FAILED',
      attempts: 1,
      error_message: 'previous failure',
      created_at: '2024-01-01T00:00:00Z',
    });
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }));

    const result = await reprocessPaper('paper-4', 'staff-1');

    expect(result.jobId).toBe('job-existing');
    expect(jobsForPaper('paper-4')).toHaveLength(1); // reused, not duplicated
    const job = firstJobFor('paper-4');
    expect(job.attempts).toBe(2);
    expect(job.error_message).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reprocessPaper creates a fresh job when the paper has never been processed before', async () => {
    seedPaper('paper-5');
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }));

    const result = await reprocessPaper('paper-5', 'staff-1');

    expect(jobsForPaper('paper-5')).toHaveLength(1);
    expect(firstJobFor('paper-5').id).toBe(result.jobId);
  });

  it('reprocessPaper rejects an unknown paper id', async () => {
    await expect(reprocessPaper('does-not-exist', 'staff-1')).rejects.toThrow(NotFoundError);
  });

  it('autoRetryProcessingJob re-queues the same job row and increments attempts', async () => {
    seedPaper('paper-6');
    fakeDb.tables.document_processing_jobs.push({ id: 'job-6', paper_id: 'paper-6', status: 'FAILED', attempts: 0 });
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }));

    await autoRetryProcessingJob('job-6', 'paper-6', 0);

    const job = firstJobFor('paper-6');
    expect(job.status).toBe('QUEUED');
    expect(job.attempts).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shouldAutoRetry stays true until the max-attempts boundary', () => {
    expect(shouldAutoRetry(0)).toBe(true);
    expect(shouldAutoRetry(1)).toBe(true);
    expect(shouldAutoRetry(2)).toBe(false);
    expect(shouldAutoRetry(5)).toBe(false);
  });
});
