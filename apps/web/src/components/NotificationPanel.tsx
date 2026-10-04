import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ArrowUpRight, Bell, Check, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotificationCenter, type NotificationItem } from '../hooks/useNotifications';
import { notificationPath, relativeNotificationTime } from '../lib/notificationUtils';

export function NotificationPanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }): JSX.Element {
  const navigate = useNavigate();
  const { items, isLoading, isError, refetch, markRead, markAllRead } = useNotificationCenter();
  const [actionError, setActionError] = useState<string | null>(null);

  async function openNotification(notification: NotificationItem): Promise<void> {
    setActionError(null);
    try {
      if (!notification.is_read) await markRead(notification.id);
      onOpenChange(false);
      navigate(notificationPath(notification));
    } catch {
      setActionError('Unable to update this notification. Please try again.');
    }
  }

  async function readAll(): Promise<void> {
    setActionError(null);
    try {
      await markAllRead();
    } catch {
      setActionError('Unable to mark notifications as read. Please try again.');
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-950/35" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[82dvh] flex-col rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-[7.5rem] sm:w-[min(24rem,calc(100vw-2rem))] sm:rounded-xl"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <Dialog.Title className="text-base font-semibold text-slate-900">Notifications</Dialog.Title>
              <Dialog.Description className="sr-only">Recent updates for your account</Dialog.Description>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Mark all as read"
                className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-brand-700 hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-600"
                onClick={() => void readAll()}
                disabled={!items.some((item) => !item.is_read)}
              >
                <Check size={16} aria-hidden="true" />
                <span className="hidden sm:inline">Mark all as read</span>
                <span className="sm:hidden">Read all</span>
              </button>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-brand-600"
                  aria-label="Close notifications"
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </Dialog.Close>
            </div>
          </div>
          {actionError && <p role="alert" className="mx-4 mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {isLoading ? (
              <div role="status" aria-label="Loading notifications" className="divide-y divide-slate-100 px-4">
                {[0, 1, 2, 3].map((item) => (
                  <div key={item} className="flex gap-3 py-4">
                    <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-slate-200 motion-safe:animate-pulse motion-reduce:animate-none" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="h-3 w-2/3 rounded bg-slate-200 motion-safe:animate-pulse motion-reduce:animate-none" />
                      <div className="h-3 w-full rounded bg-slate-100 motion-safe:animate-pulse motion-reduce:animate-none" />
                    </div>
                  </div>
                ))}
              </div>
            ) : isError ? (
              <div className="space-y-3 px-4 py-8 text-center">
                <p role="alert" className="text-sm text-red-700">Notifications could not be loaded.</p>
                <button type="button" className="btn-secondary min-h-11" onClick={() => void refetch()}>Try again</button>
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <Bell className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium text-slate-700">You're all caught up</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-label={`${item.is_read ? '' : 'Unread: '}${item.title}`}
                      className="flex min-h-16 w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 motion-reduce:transition-none"
                      onClick={() => void openNotification(item)}
                    >
                      <span className="mt-1.5 w-3 shrink-0">
                        {!item.is_read && <span className="block h-2.5 w-2.5 rounded-full bg-brand-600" aria-label="Unread" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-900">{item.title}</span>
                          {item.related_entity_id && <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />}
                        </span>
                        {item.body && <span className="mt-1 line-clamp-2 block text-sm text-slate-600">{item.body}</span>}
                        <time dateTime={item.created_at} className="mt-1 block text-xs text-slate-500">{relativeNotificationTime(item.created_at)}</time>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="border-t border-slate-200 px-4 py-2 text-center">
            <button
              type="button"
              className="min-h-11 text-sm font-medium text-brand-700 hover:underline focus-visible:ring-2 focus-visible:ring-brand-600"
              onClick={() => {
                onOpenChange(false);
                navigate('/app/notifications');
              }}
            >
              View all notifications
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
