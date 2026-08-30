import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  WEB_APP_URL: z.string().url().default('http://localhost:5173'),

  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_DB_URL: z.string().min(1).optional(),
  SUPABASE_STORAGE_BUCKET: z.string().default('examination-papers'),
  STUDENT_AUTH_IDENTIFIER_DOMAIN: z.string().default('students.njala.auth.internal'),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  CORS_ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),

  SIGNED_URL_EXPIRY_SECONDS: z.coerce.number().int().positive().default(300),

  DOCUMENT_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  DOCUMENT_SERVICE_CALLBACK_SECRET: z.string().min(8),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration - see logged field errors above');
}

export const env = parsed.data;
export type Env = typeof env;
