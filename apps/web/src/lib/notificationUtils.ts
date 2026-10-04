import type { NotificationItem } from '../hooks/useNotifications';

export function relativeNotificationTime(value: string, now = Date.now()): string {
  const seconds = Math.round((new Date(value).getTime() - now) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  for (const [unit, divisor] of units) {
    if (Math.abs(seconds) >= divisor) return formatter.format(Math.round(seconds / divisor), unit);
  }
  return formatter.format(seconds, 'second');
}

export function notificationPath(notification: NotificationItem): string {
  if (!notification.related_entity_id) return '/app/notifications';
  if (notification.related_entity_type === 'examination_papers') return `/app/papers/${notification.related_entity_id}`;
  if (notification.related_entity_type === 'practice_sessions') return `/app/practice/${notification.related_entity_id}/results`;
  return '/app/notifications';
}
