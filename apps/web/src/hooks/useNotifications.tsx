import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useAuth } from './useAuth';
import { api } from '../lib/apiClient';
import { supabase } from '../lib/supabaseClient';

export interface NotificationItem {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  related_entity_type: string | null;
  related_entity_id: string | null;
  created_at: string;
}

interface NotificationResponse {
  items: NotificationItem[];
  unreadCount: number;
}

interface NotificationContextValue extends NotificationResponse {
  isLoading: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  toast: NotificationItem | null;
  dismissToast: () => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }): JSX.Element {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['notifications', user?.id] as const, [user?.id]);
  const [toast, setToast] = useState<NotificationItem | null>(null);

  const query = useQuery({
    queryKey,
    queryFn: () => api.get<NotificationResponse>('/notifications'),
    enabled: Boolean(user?.id),
  });

  useEffect(() => {
    if (!user?.id) {
      setToast(null);
      return;
    }

    let channel: RealtimeChannel | null = null;
    let reconnectTimer: number | undefined;
    let toastTimer: number | undefined;
    let retryCount = 0;
    let disposed = false;

    const mergeInsert = (notification: NotificationItem) => {
      queryClient.setQueryData<NotificationResponse>(queryKey, (current) => {
        const notifications = current ?? { items: [], unreadCount: 0 };
        if (notifications.items.some((item) => item.id === notification.id)) return notifications;
        return {
          items: [notification, ...notifications.items].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 20),
          unreadCount: notifications.unreadCount + (notification.is_read ? 0 : 1),
        };
      });
      setToast(notification);
      if (toastTimer !== undefined) window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => setToast(null), 5000);
    };

    const mergeUpdate = (notification: NotificationItem) => {
      let wasPresent = false;
      queryClient.setQueryData<NotificationResponse>(queryKey, (current) => {
        if (!current) return current;
        const previous = current.items.find((item) => item.id === notification.id);
        wasPresent = Boolean(previous);
        if (!previous) return current;
        return {
          items: current.items.map((item) => item.id === notification.id ? notification : item),
          unreadCount: Math.max(0, current.unreadCount + (previous.is_read === notification.is_read ? 0 : notification.is_read ? -1 : 1)),
        };
      });
      if (!wasPresent) void queryClient.invalidateQueries({ queryKey });
    };

    const connect = () => {
      if (disposed) return;
      const nextChannel = supabase
        .channel(`notifications:${user.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        }, (payload) => mergeInsert(payload.new as NotificationItem))
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        }, (payload) => mergeUpdate(payload.new as NotificationItem))
      channel = nextChannel;
      nextChannel.subscribe((status) => {
          if (disposed) return;
          if (status === 'SUBSCRIBED') {
            if (channel !== nextChannel) return;
            const reconnected = retryCount > 0;
            retryCount = 0;
            if (reconnected) void queryClient.invalidateQueries({ queryKey });
            return;
          }
          if (status !== 'CHANNEL_ERROR' && status !== 'TIMED_OUT' && status !== 'CLOSED') return;
          if (channel !== nextChannel) return;

          channel = null;
          void supabase.removeChannel(nextChannel);
          if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
          const delay = Math.min(1000 * 2 ** retryCount, 30_000);
          retryCount += 1;
          reconnectTimer = window.setTimeout(connect, delay);
        });
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer !== undefined) window.clearTimeout(reconnectTimer);
      if (toastTimer !== undefined) window.clearTimeout(toastTimer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [queryClient, queryKey, user?.id]);

  const markRead = useCallback(async (id: string) => {
    await api.patch(`/notifications/${id}/read`);
    queryClient.setQueryData<NotificationResponse>(queryKey, (current) => {
      if (!current) return current;
      const notification = current.items.find((item) => item.id === id);
      if (!notification || notification.is_read) return current;
      return {
        items: current.items.map((item) => item.id === id ? { ...item, is_read: true } : item),
        unreadCount: Math.max(0, current.unreadCount - 1),
      };
    });
  }, [queryClient, queryKey]);

  const markAllRead = useCallback(async () => {
    await api.post('/notifications/read-all');
    queryClient.setQueryData<NotificationResponse>(queryKey, (current) => current
      ? { items: current.items.map((item) => ({ ...item, is_read: true })), unreadCount: 0 }
      : current);
  }, [queryClient, queryKey]);

  const dismissToast = useCallback(() => setToast(null), []);

  const value = useMemo<NotificationContextValue>(() => ({
    items: query.data?.items ?? [],
    unreadCount: query.data?.unreadCount ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    markRead,
    markAllRead,
    toast,
    dismissToast,
  }), [query.data, query.isLoading, query.isError, query.refetch, markRead, markAllRead, toast, dismissToast]);

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotificationCenter(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotificationCenter must be used within NotificationsProvider');
  return context;
}
