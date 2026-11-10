
import { supabase } from '@/lib/supabase';
import type { Message } from '@/types/messages';

const MESSAGE_LIMIT = 100;

export interface DirectConversation {
  id: string;
  kind: string;
  title: string | null;
  created_by: string;
  last_message_at: string | null;
  created_at: string;
}

export interface DirectConversationMember {
  conversation_id: string;
  user_id: string;
  joined_at: string;
  last_read_at: string | null;
}

export async function fetchMyConversations(): Promise<DirectConversation[]> {
  const { data: { user }, error: authError } =
    await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');

  const { data: memberships, error: membershipError } = await supabase
    .from('conversation_members')
    .select('conversation_id')
    .eq('user_id', user.id);

  if (membershipError) throw membershipError;

  const ids = (memberships ?? []).map((item) => item.conversation_id);

  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from('conversations')
    .select('id, kind, title, created_by, last_message_at, created_at')
    .in('id', ids)
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (error) throw error;

  return (data ?? []) as DirectConversation[];
}

export async function fetchConversationMembers(
  conversationId: string,
): Promise<DirectConversationMember[]> {
  const { data, error } = await supabase
    .from('conversation_members')
    .select('conversation_id, user_id, joined_at, last_read_at')
    .eq('conversation_id', conversationId);

  if (error) throw error;

  return (data ?? []) as DirectConversationMember[];
}

export async function fetchDirectMessages(
  conversationId: string,
  before?: Message,
): Promise<Message[]> {
  let query = supabase
    .from('messages')
    .select(
      'id, conversation_id, channel_id, author_id, reply_to_id, body, image_url, created_at, updated_at',
    )
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(MESSAGE_LIMIT);

  if (before) {
    query = query.or(
      `created_at.lt.${before.created_at},and(created_at.eq.${before.created_at},id.lt.${before.id})`,
    );
  }

  const { data, error } = await query;

  if (error) throw error;

  return ((data ?? []) as Message[]).reverse();
}

export async function sendDirectMessage(
  conversationId: string,
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
      conversation_id: conversationId,
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
