import type { FastifyRequest } from 'fastify';
import { supabaseAdmin } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

interface AuditEventInput {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
  request?: FastifyRequest;
}

/**
 * Writes a security-relevant event. audit_logs has no client insert
 * RLS policy by design (see supabase/migrations/*_rls_policies.sql),
 * so this always goes through the service-role client. Failure to log
 * must never break the request it is auditing - errors are swallowed
 * and reported to structured logging instead.
 */
export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    await supabaseAdmin.from('audit_logs').insert({
      actor_id: input.actorId,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      ip_address: input.request?.ip ?? null,
      user_agent: input.request?.headers['user-agent'] ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (err) {
    logger.error({ err, action: input.action }, 'Failed to record audit event');
  }
}
