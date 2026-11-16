import { supabase } from '@/lib/supabase';

export const VISIBLE_NOTIFICATION_TYPES = [
  'follow',
  'like',
  'comment',
  'mention',
  'reply',
  'event_rsvp',
  'event_update',
  'event_reminder_24h',
  'event_reminder_1h',
  'event_reminder_15m',
] as const;

export type NotificationType = (typeof VISIBLE_NOTIFICATION_TYPES)[number];

export interface NotificationPreference {
  notification_type: NotificationType;
  enabled: boolean;
}

export async function fetchNotificationPreferences(): Promise<NotificationPreference[]> {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('notification_type, enabled');
  if (error) throw error;
  return (data ?? []) as NotificationPreference[];
}

export async function saveNotificationPreference(
  notificationType: NotificationType,
  enabled: boolean,
): Promise<void> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');

  const { error } = await supabase
    .from('notification_preferences')
    .upsert({
      user_id: user.id,
      notification_type: notificationType,
      enabled,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,notification_type' });
  if (error) throw error;
}

export interface NotificationItem {
  id: string;
  recipient_id: string;
  actor_id: string;
  type: (typeof VISIBLE_NOTIFICATION_TYPES)[number];
  entity_id: string;
  created_at: string;
  read_at: string | null;
  actor: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

export async function fetchNotifications(): Promise<NotificationItem[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, recipient_id, actor_id, type, entity_id, created_at, read_at, actor:profiles!notifications_actor_id_fkey(username, display_name, avatar_url)')
    .in('type', [...VISIBLE_NOTIFICATION_TYPES])
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  const preferences = await fetchNotificationPreferences();
  const disabled = new Set(preferences.filter((item) => !item.enabled).map((item) => item.notification_type));
  return ((data ?? []) as unknown as NotificationItem[]).filter((item) => !disabled.has(item.type));
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .is('read_at', null);

  if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<void> {
  const preferences = await fetchNotificationPreferences();
  const disabled = new Set(preferences.filter((item) => !item.enabled).map((item) => item.notification_type));
  const enabledTypes = VISIBLE_NOTIFICATION_TYPES.filter((type) => !disabled.has(type));
  if (enabledTypes.length === 0) return;

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .in('type', [...enabledTypes])
    .is('read_at', null);

  if (error) throw error;
}
