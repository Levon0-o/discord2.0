
import { supabase } from '@/lib/supabase';
import type { Message } from '@/types/messages';

const CHANNEL_MESSAGE_LIMIT = 100;

export async function fetchChannelMessages(
  channelId: string,
  before?: Message,
): Promise<Message[]> {
  let query = supabase
    .from('messages')
    .select(
      'id, conversation_id, channel_id, author_id, reply_to_id, thread_id, body, image_url, created_at, updated_at',
    )
    .eq('channel_id', channelId)
    .is('thread_id', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(CHANNEL_MESSAGE_LIMIT);

  if (before) {
    query = query.or(
      `created_at.lt.${before.created_at},and(created_at.eq.${before.created_at},id.lt.${before.id})`,
    );
  }

  const { data, error } = await query;

  if (error) throw error;

  return ((data ?? []) as Message[]).reverse();
}

const CHANNEL_ATTACHMENT_BUCKET = 'channel-attachments';
const CHANNEL_ATTACHMENT_PREFIX = 'channel-attachment:';
const CHANNEL_ATTACHMENT_MAX_SIZE = 15 * 1024 * 1024;
const CHANNEL_ATTACHMENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
]);

export async function uploadChannelMessageAttachment(channelId: string, file: File): Promise<string> {
  if (!CHANNEL_ATTACHMENT_TYPES.has(file.type)) {
    throw new Error('Supported files: JPG, PNG, GIF, WEBP, PDF, TXT and CSV.');
  }
  if (file.size <= 0 || file.size > CHANNEL_ATTACHMENT_MAX_SIZE) {
    throw new Error('Attachments must be smaller than 15 MB.');
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');

  const safeName = file.name.normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-100) || 'attachment';
  const path = `${channelId}/${user.id}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from(CHANNEL_ATTACHMENT_BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function getChannelMessageAttachmentUrl(storedValue: string): Promise<string> {
  if (!storedValue.startsWith(CHANNEL_ATTACHMENT_PREFIX)) return storedValue;
  const path = storedValue.slice(CHANNEL_ATTACHMENT_PREFIX.length);
  const { data, error } = await supabase.storage.from(CHANNEL_ATTACHMENT_BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function sendChannelMessage(
  channelId: string,
  body: string,
  replyToId?: string,
  attachmentPath?: string,
  threadId?: string,
): Promise<Message> {
  const trimmed = body.trim();
  if ((!trimmed && !attachmentPath) || trimmed.length > 4000) {
    throw new Error('Add a message or attachment (message limit: 4000 characters).');
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');

  const { data, error } = await supabase.from('messages').insert({
    channel_id: channelId,
    author_id: user.id,
    body: trimmed,
    image_url: attachmentPath ? `${CHANNEL_ATTACHMENT_PREFIX}${attachmentPath}` : null,
    reply_to_id: threadId ?? replyToId ?? null,
    thread_id: threadId ?? null,
  }).select(
    'id, conversation_id, channel_id, author_id, reply_to_id, thread_id, body, image_url, created_at, updated_at',
  ).single();

  if (error) throw error;
  return data as Message;
}

export async function fetchChannelThreadMessages(threadId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, conversation_id, channel_id, author_id, reply_to_id, thread_id, body, image_url, created_at, updated_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as Message[];
}

export async function editMessage(
  messageId: string,
  body: string,
): Promise<Message> {
  const trimmed = body.trim();

  if (!trimmed || trimmed.length > 4000) {
    throw new Error('Message must contain 1–4000 characters.');
  }

  const { data, error } = await supabase
    .from('messages')
    .update({ body: trimmed })
    .eq('id', messageId)
    .select(
      'id, conversation_id, channel_id, author_id, reply_to_id, body, image_url, created_at, updated_at',
    )
    .single();

  if (error) throw error;

  return data as Message;
}

export async function deleteMessage(messageId: string): Promise<void> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');

  const { data: message, error: fetchError } = await supabase
    .from('messages')
    .select('author_id, channel_id, image_url')
    .eq('id', messageId)
    .single();
  if (fetchError) throw fetchError;

  const { error } = await supabase.from('messages').delete().eq('id', messageId);
  if (error) throw error;

  if (message.author_id === user.id && message.image_url?.startsWith(CHANNEL_ATTACHMENT_PREFIX)) {
    const path = message.image_url.slice(CHANNEL_ATTACHMENT_PREFIX.length);
    const expectedPrefix = `${message.channel_id ?? ''}/${user.id}/`;
    if (path.startsWith(expectedPrefix)) {
      await supabase.storage.from(CHANNEL_ATTACHMENT_BUCKET).remove([path]);
    }
  }
}


export interface ChannelMessageReaction {
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export interface PinnedChannelMessage {
  channel_id: string;
  message_id: string;
  pinned_by: string;
  pinned_at: string;
}

export async function fetchChannelReactions(messageIds: string[]): Promise<ChannelMessageReaction[]> {
  if (!messageIds.length) return [];
  const { data, error } = await supabase
    .from('message_reactions')
    .select('message_id, user_id, emoji, created_at')
    .in('message_id', messageIds);
  if (error) throw error;
  return (data ?? []) as ChannelMessageReaction[];
}

export async function toggleChannelReaction(messageId: string, emoji: string, active: boolean): Promise<void> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');
  const result = active
    ? await supabase.from('message_reactions').delete().eq('message_id', messageId).eq('user_id', user.id).eq('emoji', emoji)
    : await supabase.from('message_reactions').insert({ message_id: messageId, user_id: user.id, emoji });
  if (result.error) throw result.error;
}

export async function fetchPinnedChannelMessages(channelId: string): Promise<PinnedChannelMessage[]> {
  const { data, error } = await supabase
    .from('channel_pinned_messages')
    .select('channel_id, message_id, pinned_by, pinned_at')
    .eq('channel_id', channelId)
    .order('pinned_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as PinnedChannelMessage[];
}

export async function toggleChannelPin(channelId: string, messageId: string, pinned: boolean): Promise<void> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');
  const result = pinned
    ? await supabase.from('channel_pinned_messages').delete().eq('channel_id', channelId).eq('message_id', messageId)
    : await supabase.from('channel_pinned_messages').insert({ channel_id: channelId, message_id: messageId, pinned_by: user.id });
  if (result.error) throw result.error;
}


export async function searchChannelMessages(channelId: string, searchTerm: string): Promise<Message[]> {
  const term = searchTerm.trim();
  if (!term) return [];
  const { data, error } = await supabase
    .from('messages')
    .select('id, conversation_id, channel_id, author_id, reply_to_id, body, image_url, created_at, updated_at')
     .eq('channel_id', channelId)
    .is('thread_id', null)
    .ilike('body', `%${term}%`)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return ((data ?? []) as Message[]).reverse();
}


export interface ChannelNotificationPreference {
  channel_id: string;
  user_id: string;
  is_muted: boolean;
  muted_until: string | null;
  updated_at: string;
}

export async function fetchChannelNotificationPreference(
  channelId: string,
): Promise<ChannelNotificationPreference | null> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');

  const { data, error } = await supabase
    .from('channel_notification_preferences')
    .select('channel_id, user_id, is_muted, muted_until, updated_at')
    .eq('channel_id', channelId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  return data as ChannelNotificationPreference | null;
}

export async function setChannelNotificationsMuted(
  channelId: string,
  mutedUntil: string | null,
): Promise<ChannelNotificationPreference> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');

  const { data, error } = await supabase
    .from('channel_notification_preferences')
    .upsert({
      channel_id: channelId,
      user_id: user.id,
      is_muted: true,
      muted_until: mutedUntil,
    }, { onConflict: 'channel_id,user_id' })
    .select('channel_id, user_id, is_muted, muted_until, updated_at')
    .single();
  if (error) throw error;
  return data as ChannelNotificationPreference;
}

export async function unmuteChannelNotifications(channelId: string): Promise<void> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');

  const { error } = await supabase
    .from('channel_notification_preferences')
    .delete()
    .eq('channel_id', channelId)
    .eq('user_id', user.id);
  if (error) throw error;
}


export interface SavedChannelMessage {
  channel_id: string;
  message_id: string;
  user_id: string;
  saved_at: string;
}

export async function fetchSavedChannelMessages(channelId: string): Promise<SavedChannelMessage[]> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');
  const { data, error } = await supabase
    .from('channel_saved_messages')
    .select('channel_id, message_id, user_id, saved_at')
    .eq('channel_id', channelId)
    .eq('user_id', user.id)
    .order('saved_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as SavedChannelMessage[];
}

export async function toggleSavedChannelMessage(
  channelId: string,
  messageId: string,
  saved: boolean,
): Promise<void> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');
  const result = saved
    ? await supabase.from('channel_saved_messages').delete()
        .eq('channel_id', channelId).eq('message_id', messageId).eq('user_id', user.id)
    : await supabase.from('channel_saved_messages').insert({
        channel_id: channelId, message_id: messageId, user_id: user.id,
      });
  if (result.error) throw result.error;
}


export async function fetchChannelThreadCounts(messageIds: string[]): Promise<Record<string, number>> {
  if (!messageIds.length) return {};
  const { data, error } = await supabase
    .from('messages')
    .select('thread_id')
    .in('thread_id', messageIds);
  if (error) throw error;
  return (data ?? []).reduce<Record<string, number>>((counts, row) => {
    if (row.thread_id) counts[row.thread_id] = (counts[row.thread_id] ?? 0) + 1;
    return counts;
  }, {});
}
