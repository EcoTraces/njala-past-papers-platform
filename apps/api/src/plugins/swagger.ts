import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { env } from '../config/env.js';

export async function registerSwagger(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Njala Past Papers & Exam Practice Platform API',
        description:
          'REST API for authentication, academic structure, examination paper workflow, ' +
          'the question bank, practice sessions, dashboards and administration.',
        version: '0.1.0',
      },
      servers: [{ url: env.API_PUBLIC_URL, description: env.NODE_ENV }],
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
      security: [{ bearerAuth: [] }],
      tags: [
        { name: 'auth', description: 'Authentication and session management' },
        { name: 'academic', description: 'Faculties, departments, programmes, courses, calendar' },
        { name: 'papers', description: 'Examination paper catalogue and workflow' },
        { name: 'questions', description: 'Question bank' },
        { name: 'practice', description: 'Practice sessions and marking' },
        { name: 'dashboards', description: 'Role-specific dashboards' },
        { name: 'admin', description: 'User and system administration' },
        { name: 'health', description: 'Service health checks' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/api/docs',
    uiConfig: { docExpansion: 'list' },
  });
}
