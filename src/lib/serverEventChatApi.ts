import { supabase } from '@/lib/supabase';

export interface ServerEventChatMessage {
  id: string;
  event_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export async function fetchServerEventChatMessages(eventId: string): Promise<ServerEventChatMessage[]> {
  const { data, error } = await supabase
    .from('server_event_chat_messages')
    .select('id, event_id, author_id, body, created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as ServerEventChatMessage[];
}

export async function sendServerEventChatMessage(eventId: string, body: string): Promise<ServerEventChatMessage> {
  const trimmed = body.trim();
  if (!trimmed || trimmed.length > 2000) {
    throw new Error('Message must contain 1–2000 characters.');
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');

  const { data, error } = await supabase
    .from('server_event_chat_messages')
    .insert({ event_id: eventId, author_id: user.id, body: trimmed })
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
