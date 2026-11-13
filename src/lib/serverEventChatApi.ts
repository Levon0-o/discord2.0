import { supabase } from '@/lib/supabase';

export interface ServerEventChatMessage {
  id: string;
  event_id: string;
  author_id: string;
  body: string;
  reply_to_id: string | null;
  created_at: string;
}

export async function fetchServerEventChatMessages(eventId: string): Promise<ServerEventChatMessage[]> {
  const { data, error } = await supabase
    .from('server_event_chat_messages')
    .select('id, event_id, author_id, body, reply_to_id, created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as ServerEventChatMessage[];
}

export async function sendServerEventChatMessage(eventId: string, body: string, replyToId?: string | null): Promise<ServerEventChatMessage> {
  const trimmed = body.trim();
  if (!trimmed || trimmed.length > 2000) {
    throw new Error('Message must contain 1–2000 characters.');
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');

  const { data, error } = await supabase
    .from('server_event_chat_messages')
    .insert({ event_id: eventId, author_id: user.id, body: trimmed, reply_to_id: replyToId ?? null })
    .select('id, event_id, author_id, body, created_at')
    .single();
  if (error) throw error;
  return data as ServerEventChatMessage;
}

export async function deleteServerEventChatMessage(messageId: string): Promise<void> {
  const { error } = await supabase
    .from('server_event_chat_messages')
    .delete()
    .eq('id', messageId);
  if (error) throw error;
}


export interface ServerEventChatReaction {
  id: string;
  event_id: string;
  message_id: string;
  user_id: string;
  emoji: '👍' | '❤️' | '😂' | '😮' | '🎉';
  created_at: string;
}

export async function fetchServerEventChatReactions(eventId: string): Promise<ServerEventChatReaction[]> {
  const { data, error } = await supabase
    .from('server_event_chat_reactions')
    .select('id, event_id, message_id, user_id, emoji, created_at')
    .eq('event_id', eventId);
  if (error) throw error;
  return (data ?? []) as ServerEventChatReaction[];
}

export async function toggleServerEventChatReaction(
  eventId: string,
  messageId: string,
  emoji: ServerEventChatReaction['emoji'],
): Promise<void> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');

  const { data: existing, error: lookupError } = await supabase
    .from('server_event_chat_reactions')
    .select('id')
    .eq('message_id', messageId)
    .eq('user_id', user.id)
    .eq('emoji', emoji)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing) {
    const { error } = await supabase.from('server_event_chat_reactions').delete().eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('server_event_chat_reactions').insert({
      event_id: eventId,
      message_id: messageId,
      user_id: user.id,
      emoji,
    });
    if (error) throw error;
  }
}
