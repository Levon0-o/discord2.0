
import { supabase } from '@/lib/supabase';
import type { Message } from '@/types/messages';

const CHANNEL_MESSAGE_LIMIT = 100;

export async function fetchChannelMessages(
  channelId: string,
): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select(
      'id, conversation_id, channel_id, author_id, reply_to_id, body, image_url, created_at, updated_at',
    )
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(CHANNEL_MESSAGE_LIMIT);

  if (error) throw error;

  return ((data ?? []) as Message[]).reverse();
}

export async function sendChannelMessage(
  channelId: string,
  body: string,
): Promise<Message> {
  const trimmed = body.trim();

  if (!trimmed) {
    throw new Error('Message body cannot be empty.');
  }

  if (trimmed.length > 4000) {
    throw new Error('Message body must be 4000 characters or fewer.');
  }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      channel_id: channelId,
      body: trimmed,
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

  if (!trimmed) {
    throw new Error('Message body cannot be empty.');
  }

  if (trimmed.length > 4000) {
    throw new Error('Message body must be 4000 characters or fewer.');
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
