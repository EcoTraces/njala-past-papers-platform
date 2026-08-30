import type { NotificationType } from '@njala/shared';
import { supabaseAdmin } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

/** Notifications are system-generated only (no client insert policy). */
export async function notifyUser(input: NotifyInput): Promise<void> {
  try {
    await supabaseAdmin.from('notifications').insert({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? '',
      related_entity_type: input.relatedEntityType ?? null,
      related_entity_id: input.relatedEntityId ?? null,
    });
  } catch (err) {
    logger.error({ err, userId: input.userId, type: input.type }, 'Failed to create notification');
  }
}
