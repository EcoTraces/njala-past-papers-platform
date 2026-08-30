import pino from 'pino';
import { env } from '../config/env.js';

const pinoOptions: pino.LoggerOptions = {
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
      : undefined,
  base: { service: 'njala-api' },
  redact: ['req.headers.authorization', '*.password', '*.token'],
};

/** Standalone logger for use outside the request lifecycle (services, startup, shutdown). */
export const logger = pino(pinoOptions);

/**
 * Fastify constructs and owns its own logger instance from these
 * options (see app.ts) rather than us handing it a pre-built pino
 * instance - Fastify's TypeScript types for `logger` expect its own
 * options shape, not an arbitrary pino.Logger.
 */
export const fastifyLoggerOptions = pinoOptions;
