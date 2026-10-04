import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useNotificationCenter } from '../../hooks/useNotifications';
import { notificationPath, relativeNotificationTime } from '../../lib/notificationUtils';

export function Notifications(): JSX.Element {
  const navigate = useNavigate();
  const { items, isLoading, isError, refetch, markRead, markAllRead } = useNotificationCenter();
  const [error, setError] = useState<string | null>(null);

  async function openNotification(id: string, path: string): Promise<void> {
    setError(null);
    try {
      await markRead(id);
      navigate(path);
    } catch {
      setError('Unable to update this notification. Please try again.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-900">Notifications</h1>
        <button type="button" className="btn-secondary min-h-11" disabled={!items.some((item) => !item.is_read)} onClick={() => {
          setError(null);
          void markAllRead().catch(() => setError('Unable to mark notifications as read. Please try again.'));
        }}>Mark all as read</button>
      </div>

      {error && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {isLoading ? (
        <div role="status" aria-label="Loading notifications" className="space-y-3">
          {[0, 1, 2].map((item) => <div key={item} className="card h-20 animate-pulse bg-slate-100 motion-reduce:animate-none" />)}
        </div>
      ) : isError ? (
        <div className="card space-y-3 text-center">
          <p role="alert" className="text-sm text-red-700">Notifications could not be loaded.</p>
          <button type="button" className="btn-secondary min-h-11" onClick={() => void refetch()}>Try again</button>
        </div>
      ) : items.length === 0 ? (
        <div className="card py-10 text-center">
          <Bell className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-slate-700">You're all caught up</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {items.map((notification) => (
            <li key={notification.id}>
              <button
                type="button"
                className={`flex min-h-16 w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-slate-50 motion-reduce:transition-none ${notification.is_read ? '' : 'bg-brand-50'}`}
                onClick={() => void openNotification(notification.id, notificationPath(notification))}
              >
                <span className="mt-1.5 w-3 shrink-0">
                  {!notification.is_read && <span className="block h-2.5 w-2.5 rounded-full bg-brand-600" aria-label="Unread" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-slate-900">{notification.title}</span>
                  {notification.body && <span className="mt-0.5 block text-sm text-slate-600">{notification.body}</span>}
                  <time dateTime={notification.created_at} className="mt-1 block text-xs text-slate-500">{relativeNotificationTime(notification.created_at)}</time>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
