import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

const mocks = vi.hoisted(() => {
  const existingFacultyId = '11111111-1111-4111-8111-111111111111';
  let facultyExists = false;
  const inserted: Array<{ table: string; value: Record<string, unknown> }> = [];

  const db = {
    from(table: string) {
      return {
        select() {
          let id = '';
          const builder = {
            eq(_column: string, value: string) {
              id = value;
              return builder;
            },
            is() {
              return builder;
            },
            async maybeSingle() {
              return {
                data: table === 'faculties' && facultyExists && id === existingFacultyId ? { id } : null,
                error: null,
              };
            },
          };
          return builder;
        },
        insert(value: Record<string, unknown>) {
          inserted.push({ table, value });
          const builder = {
            select() {
              return builder;
            },
            async single() {
              return { data: { id: '22222222-2222-4222-8222-222222222222', ...value }, error: null };
            },
          };
          return builder;
        },
      };
    },
  };

  return {
    db,
    inserted,
    existingFacultyId,
    setFacultyExists(value: boolean) {
      facultyExists = value;
    },
  };
});

vi.mock('./lib/supabase.js', () => ({
  supabaseAdmin: mocks.db,
  supabaseAnon: mocks.db,
  supabaseForUser: () => mocks.db,
}));
vi.mock('./middleware/authenticate.js', () => ({
  authenticate: async (request: { user?: unknown; db?: unknown }) => {
    request.user = { id: '40000000-0000-0000-0000-000000000001', roles: ['ADMIN'] };
    request.db = mocks.db;
  },
}));
vi.mock('./services/audit.service.js', () => ({ recordAuditEvent: async () => undefined }));

const { buildApp } = await import('./app.js');

describe('academic parent references', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 400 for a missing faculty id', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/departments',
      payload: { name: 'Science', code: 'SCI' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { message: 'Invalid faculty' } });
  });

  it('returns 400 for a malformed faculty id', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/departments',
      payload: { facultyId: 'not-a-uuid', name: 'Science', code: 'SCI' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { message: 'Invalid faculty' } });
  });

  it('returns 400 when the faculty does not exist', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/departments',
      payload: { facultyId: mocks.existingFacultyId, name: 'Science', code: 'SCI' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { message: 'Faculty not found' } });
  });

  it('inserts the selected faculty id after confirming that parent exists', async () => {
    mocks.setFacultyExists(true);
    mocks.inserted.length = 0;

    const response = await app.inject({
      method: 'POST',
      url: '/api/departments',
      payload: { facultyId: mocks.existingFacultyId, name: 'Science', code: 'SCI' },
    });

    expect(response.statusCode).toBe(201);
    expect(mocks.inserted).toContainEqual({
      table: 'departments',
      value: { faculty_id: mocks.existingFacultyId, name: 'Science', code: 'SCI' },
    });
  });
});
