import { useCallback, useEffect, useState } from 'react';
import { Bell, Heart, MessageCircle, UserPlus, CheckCheck, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from '@/lib/notificationsApi';

function notificationCopy(item: NotificationItem) {
  const actor = item.actor?.display_name || item.actor?.username || 'Someone';
  if (item.type === 'follow') return { title: actor, detail: 'started following you', Icon: UserPlus };
  if (item.type === 'like') return { title: actor, detail: 'liked your post', Icon: Heart };
  return { title: actor, detail: 'commented on your post', Icon: MessageCircle };
}

export function NotificationsSection() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const rows = await fetchNotifications();
      setItems(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load notifications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data.user) return;
      channel = supabase
        .channel(`notifications:${data.user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${data.user.id}`,
          },
          () => { void load(); }
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [load]);

  const handleMarkAll = async () => {
    setBusy(true);
    try {
      await markAllNotificationsRead();
      setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark notifications as read.');
    } finally {
      setBusy(false);
    }
  };

  const handleMarkOne = async (item: NotificationItem) => {
    if (item.read_at) return;
    try {
      await markNotificationRead(item.id);
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update notification.');
    }
  };

  const unreadCount = items.filter((item) => !item.read_at).length;

  return (
    <section className="mx-auto w-full max-w-3xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-500/15 ring-1 ring-primary-400/20">
            <Bell size={22} className="text-primary-300" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink-50">Notifications</h1>
            <p className="text-sm text-ink-400">
              {unreadCount ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}` : 'You are all caught up'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleMarkAll()}
          disabled={busy || unreadCount === 0}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm font-medium text-ink-200 transition hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCheck size={16} />}
          Mark all read
        </button>
      </header>

      {error && (
        <div role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-900/60">
        {loading ? (
          <div className="flex items-center justify-center gap-3 px-6 py-16 text-sm text-ink-400">
            <Loader2 size={18} className="animate-spin" /> Loading notifications…
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.04] text-ink-400">
              <Bell size={24} />
            </div>
            <h2 className="text-base font-semibold text-ink-100">No notifications yet</h2>
            <p className="mt-1 max-w-sm text-sm text-ink-400">When someone follows you, likes your post or comments on it, you will see it here.</p>
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {items.map((item) => {
              const copy = notificationCopy(item);
              const Icon = copy.Icon;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => void handleMarkOne(item)}
                    className={`flex w-full items-center gap-4 px-4 py-4 text-left transition hover:bg-white/[0.035] sm:px-5 ${item.read_at ? '' : 'bg-primary-500/[0.055]'}`}
                  >
                    <div className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink-800 ring-1 ring-white/10">
                      {item.actor?.avatar_url ? (
                        <img src={item.actor.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-sm font-semibold text-ink-200">
                          {(copy.title[0] || '?').toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink-100">
                        <span className="font-semibold">{copy.title}</span>{' '}
                        <span className="text-ink-300">{copy.detail}</span>
                      </p>
                      <p className="mt-1 text-xs text-ink-500">{new Date(item.created_at).toLocaleString()}</p>
                    </div>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.045] text-primary-300">
                      <Icon size={17} />
                    </span>
                    {!item.read_at && <span aria-label="Unread" className="h-2 w-2 shrink-0 rounded-full bg-primary-400" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
