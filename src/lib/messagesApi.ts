
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
      'id, conversation_id, channel_id, author_id, reply_to_id, body, image_url, created_at, updated_at',
    )
    .eq('channel_id', channelId)
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

export async function sendChannelMessage(
  channelId: string,
  body: string,
  replyToId?: string,
): Promise<Message> {
  const trimmed = body.trim();

  if (!trimmed || trimmed.length > 4000) {
    throw new Error('Message must contain 1–4000 characters.');
  }

  const { data: { user }, error: authError } =
    await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');

  const { data, error } = await supabase
    .from('messages')
    .insert({
      channel_id: channelId,
      author_id: user.id,
      body: trimmed,
      reply_to_id: replyToId ?? null,
    })
    .select(
      'id, conversation_id, channel_id, author_id, reply_to_id, body, image_url, created_at, updated_at',
    )
    .single();

  if (error) throw error;

  return data as Message;
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
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', messageId);

  if (error) throw error;
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
