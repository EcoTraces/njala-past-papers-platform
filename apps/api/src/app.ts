import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { randomUUID } from 'node:crypto';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { AppError } from './lib/errors.js';
import { registerSwagger } from './plugins/swagger.js';
import { authRoutes } from './routes/auth.routes.js';
import { academicRoutes } from './routes/academic.routes.js';
import { papersRoutes } from './routes/papers.routes.js';
import { questionsRoutes } from './routes/questions.routes.js';
import { practiceRoutes } from './routes/practice.routes.js';
import { dashboardRoutes } from './routes/dashboard.routes.js';
import { adminRoutes } from './routes/admin.routes.js';
import { internalRoutes } from './routes/internal.routes.js';
import { healthRoutes } from './routes/health.routes.js';
import { supabaseAnon } from './lib/supabase.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger,
    genReqId: () => randomUUID(),
    trustProxy: true,
  });

  // Default, unauthenticated Supabase client for the request; swapped
  // for a user-scoped one by the authenticate() middleware.
  app.decorateRequest('db', null);
  app.addHook('onRequest', async (request) => {
    request.db = supabaseAnon;
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  });

  await app.register(cors, {
    origin: env.CORS_ALLOWED_ORIGINS,
    credentials: true,
  });

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW_MS,
    allowList: [], // health checks still count; deliberate, keeps the limiter honest
  });

  await app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  });

  await registerSwagger(app);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      request.log.warn({ err: error, code: error.code }, 'Handled application error');
      reply.status(error.statusCode).send({
        error: { code: error.code, message: error.message, details: error.details },
      });
      return;
    }

    if ('validation' in error && error.validation) {
      reply.status(422).send({
        error: { code: 'VALIDATION_ERROR', message: error.message, details: error.validation },
      });
      return;
    }

    request.log.error({ err: error }, 'Unhandled error');
    reply.status(500).send({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Route ${request.method} ${request.url} not found` } });
  });

  await app.register(healthRoutes, { prefix: '/api' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(academicRoutes, { prefix: '/api' });
  await app.register(papersRoutes, { prefix: '/api/papers' });
  await app.register(questionsRoutes, { prefix: '/api/questions' });
  await app.register(practiceRoutes, { prefix: '/api/practice' });
  await app.register(dashboardRoutes, { prefix: '/api' });
  await app.register(adminRoutes, { prefix: '/api/admin' });
  await app.register(internalRoutes, { prefix: '/api/internal' });

  return app;
}
