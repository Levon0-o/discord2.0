import { supabase } from '@/lib/supabase';

export interface NotificationItem {
  id: string;
  recipient_id: string;
  actor_id: string;
  type: 'follow' | 'like' | 'comment' | 'mention' | 'reply';
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
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return (data ?? []) as unknown as NotificationItem[];
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
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);

  if (error) throw error;
}
