
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
