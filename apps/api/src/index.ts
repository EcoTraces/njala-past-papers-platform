import { buildApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';

async function main(): Promise<void> {
  const app = await buildApp();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Shutting down');
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    logger.info({ port: env.PORT, docs: `${env.API_PUBLIC_URL}/api/docs` }, 'API listening');
  } catch (err) {
    logger.error({ err }, 'Failed to start API');
    process.exit(1);
  }
}

void main();
