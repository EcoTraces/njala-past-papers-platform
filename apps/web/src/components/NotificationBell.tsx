import { useState } from 'react';
import { Bell } from 'lucide-react';
import { useNotificationCenter } from '../hooks/useNotifications';
import { NotificationPanel } from './NotificationPanel';

export function NotificationBell(): JSX.Element {
  const { unreadCount, toast, dismissToast } = useNotificationCenter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-brand-600"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span aria-hidden="true" className="absolute right-0.5 top-0.5 min-w-5 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-5 text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      <NotificationPanel open={open} onOpenChange={setOpen} />
      {toast && !open && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 left-4 right-4 z-30 flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-lg transition-opacity motion-reduce:transition-none sm:left-auto sm:right-4 sm:w-80"
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">New notification</p>
            <p className="mt-1 truncate text-sm text-slate-600">{toast.title}</p>
          </div>
          <button type="button" aria-label="Dismiss notification" onClick={dismissToast} className="min-h-11 min-w-11 rounded-md text-slate-500 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-brand-600">
            <span aria-hidden="true">×</span>
          </button>
        </div>
      )}
    </>
  );
}
