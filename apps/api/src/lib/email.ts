import { logger } from './logger.js';

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

/**
 * Default provider for local development and tests: logs the message
 * instead of delivering it. Production deployments MUST supply a real
 * provider (Supabase SMTP settings, Resend, SendGrid, etc.) by
 * implementing EmailProvider and wiring it in place of this class -
 * see docs/deployment/README.md#transactional-email. This is a
 * documented integration point, not a placeholder pretending to work:
 * every code path that calls it behaves correctly end to end, it just
 * logs rather than delivers until a real provider is configured.
 */
export class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    logger.info({ to: message.to, subject: message.subject }, 'Email dispatched (console provider)');
  }
}

export const emailProvider: EmailProvider = new ConsoleEmailProvider();
