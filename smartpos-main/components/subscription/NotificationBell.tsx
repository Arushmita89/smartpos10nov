'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, X, BellRing, Truck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface Notif {
  id: string;
  type: string | null;
  title: string | null;
  message: string | null;
  is_read: boolean;
  created_at: string;
  source?: 'subscription' | 'order';
}

export default function NotificationBell() {
  const { restaurant, subscription } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [orderNotifications, setOrderNotifications] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const restaurantId = restaurant?.restaurant_id;
  const canNotify = !!restaurantId && !subscription?.isLocked;

  const load = async () => {
    if (!restaurantId) return;
    try {
      const res = await fetch(
        `/api/subscription/notifications?restaurantId=${encodeURIComponent(
          restaurantId
        )}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(
        Array.isArray(data.notifications)
          ? data.notifications.map((n: Notif) => ({
              ...n,
              source: 'subscription' as const,
            }))
          : []
      );
    } catch {
      // ignore notification load errors
    }
  };

  const loadOrderNotifications = async () => {
    if (!restaurantId) return;
    try {
      const res = await fetch(
        `/api/order-notifications?restaurantId=${encodeURIComponent(
          restaurantId
        )}`
      );
      if (!res.ok) return;
      const data = await res.json();
      setOrderNotifications(
        Array.isArray(data.notifications)
          ? data.notifications.map((n: Notif) => ({
              ...n,
              source: 'order' as const,
            }))
          : []
      );
    } catch {
      // ignore notification load errors
    }
  };

  useEffect(() => {
    if (!canNotify) return;
    load();
    loadOrderNotifications();
    const interval = setInterval(() => {
      load();
      loadOrderNotifications();
    }, 60000);
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => {
      clearInterval(interval);
      document.removeEventListener('mousedown', onDocClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, canNotify]);

  const allNotifications = useMemo(
    () =>
      [...notifications, ...orderNotifications].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [notifications, orderNotifications]
  );

  const unread = allNotifications.filter((n) => !n.is_read).length;

  const markAllRead = async () => {
    if (!restaurantId) return;
    try {
      await Promise.all([
        fetch('/api/subscription/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ restaurantId, markAll: true }),
        }),
        fetch('/api/order-notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ restaurantId, markAll: true }),
        }),
      ]);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setOrderNotifications((prev) =>
        prev.map((n) => ({ ...n, is_read: true }))
      );
    } catch {
      // ignore
    }
  };

  const goToSubscription = async () => {
    await markAllRead();
    setOpen(false);
    router.push('/subscription');
  };

  if (!canNotify) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        {unread > 0 ? (
          <BellRing className="h-5 w-5 text-amber-500" />
        ) : (
          <Bell className="h-5 w-5" />
        )}
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="font-semibold text-sm text-gray-900">
              Notifications
              {unread > 0 && (
                <span className="ml-2 text-xs font-medium text-red-500">
                  {unread} unread
                </span>
              )}
            </p>
            <div className="flex items-center gap-3">
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs font-medium text-blue-600 hover:underline"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Close notifications"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {allNotifications.length === 0 && (
              <p className="text-sm text-gray-500 p-4 text-center">
                No notifications
              </p>
            )}
            {allNotifications.map((n) => (
              <div
                key={`${n.source || 'subscription'}-${n.id}`}
                className={`px-4 py-3 border-b border-gray-50 ${
                  n.is_read ? '' : 'bg-blue-50'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {n.source === 'order' && (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                      <Truck className="mr-0.5 h-3 w-3" />
                      Delivery
                    </span>
                  )}
                  <p className="text-sm font-medium text-gray-900">{n.title}</p>
                </div>
                <p className="text-xs text-gray-600 mt-0.5">{n.message}</p>
                <p className="text-[10px] text-gray-400 mt-1">
                  {new Date(n.created_at).toLocaleString('en-IN')}
                </p>
              </div>
            ))}
          </div>

          {notifications.length > 0 && (
            <button
              onClick={goToSubscription}
              className="w-full px-4 py-3 text-sm font-medium text-blue-600 hover:bg-blue-50 text-center"
            >
              Manage subscription →
            </button>
          )}
        </div>
      )}
    </div>
  );
}
