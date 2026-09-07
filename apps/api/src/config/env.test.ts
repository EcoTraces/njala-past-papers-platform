import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * env.ts validates process.env at import time (a module-level
 * `safeParse` call, not an exported function), so exercising both the
 * pass and fail paths needs a fresh module instance per case - same
 * `vi.resetModules()` + dynamic import pattern used for the Fastify
 * app elsewhere in this suite.
 */

const REQUIRED_BASE_ENV = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  DOCUMENT_SERVICE_CALLBACK_SECRET: 'a-real-secret-value',
};

const ORIGINAL_ENV = { ...process.env };

function resetEnv(): void {
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, ORIGINAL_ENV);
}

describe('env config (HTTPS-in-production enforcement)', () => {
  afterEach(() => {
    resetEnv();
    vi.resetModules();
  });

  it('rejects a production config with a plain-http CORS origin', async () => {
    resetEnv();
    Object.assign(process.env, REQUIRED_BASE_ENV, {
      NODE_ENV: 'production',
      API_PUBLIC_URL: 'https://api.example.com',
      WEB_APP_URL: 'https://app.example.com',
      CORS_ALLOWED_ORIGINS: 'http://app.example.com',
    });
    await expect(import('./env.js')).rejects.toThrow('Invalid environment configuration');
  });

  it('rejects a production config with a plain-http API_PUBLIC_URL or WEB_APP_URL', async () => {
    resetEnv();
    Object.assign(process.env, REQUIRED_BASE_ENV, {
      NODE_ENV: 'production',
      API_PUBLIC_URL: 'http://api.example.com',
      WEB_APP_URL: 'https://app.example.com',
      CORS_ALLOWED_ORIGINS: 'https://app.example.com',
    });
    await expect(import('./env.js')).rejects.toThrow('Invalid environment configuration');
  });

  it('accepts a fully-https production config', async () => {
    resetEnv();
    Object.assign(process.env, REQUIRED_BASE_ENV, {
      NODE_ENV: 'production',
      API_PUBLIC_URL: 'https://api.example.com',
      WEB_APP_URL: 'https://app.example.com',
      CORS_ALLOWED_ORIGINS: 'https://app.example.com,https://admin.example.com',
    });
    const { env } = await import('./env.js');
    expect(env.CORS_ALLOWED_ORIGINS).toEqual(['https://app.example.com', 'https://admin.example.com']);
  });

  it('does not enforce https in development (local http origins stay valid)', async () => {
    resetEnv();
    Object.assign(process.env, REQUIRED_BASE_ENV, {
      NODE_ENV: 'development',
      CORS_ALLOWED_ORIGINS: 'http://localhost:5173',
    });
    const { env } = await import('./env.js');
    expect(env.CORS_ALLOWED_ORIGINS).toEqual(['http://localhost:5173']);
  });
});
