
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

export async function getOrCreateDirectConversation(
  friendId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc(
    'get_or_create_direct_conversation',
    {
      p_friend_id: friendId,
    },
  );

  if (error) throw error;

  if (!data) {
    throw new Error('Could not open direct conversation.');
  }

  return data as string;
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

const DM_ATTACHMENT_BUCKET = 'dm-attachments';
const DM_ATTACHMENT_PREFIX = 'dm-attachment:';
const DM_ATTACHMENT_MAX_SIZE = 15 * 1024 * 1024;
const DM_ATTACHMENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
]);

export async function uploadDirectMessageAttachment(
  conversationId: string,
  file: File,
): Promise<string> {
  if (!DM_ATTACHMENT_TYPES.has(file.type)) {
    throw new Error('This file type is not supported.');
  }
  if (file.size <= 0 || file.size > DM_ATTACHMENT_MAX_SIZE) {
    throw new Error('Attachments must be smaller than 15 MB.');
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');

  const safeName = file.name
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-100) || 'attachment';
  const path = `${conversationId}/${user.id}/${crypto.randomUUID()}-${safeName}`;

  const { error } = await supabase.storage
    .from(DM_ATTACHMENT_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    });

  if (error) throw error;
  return path;
}

export async function getDirectMessageAttachmentUrl(
  storedValue: string,
): Promise<string> {
  if (!storedValue.startsWith(DM_ATTACHMENT_PREFIX)) {
    return storedValue;
  }

  const path = storedValue.slice(DM_ATTACHMENT_PREFIX.length);
  const { data, error } = await supabase.storage
    .from(DM_ATTACHMENT_BUCKET)
    .createSignedUrl(path, 60 * 60);

  if (error) throw error;
  return data.signedUrl;
}

export async function sendDirectMessage(
  conversationId: string,
  body: string,
  replyToId?: string,
  attachmentPath?: string,
): Promise<Message> {
  const trimmed = body.trim();

  if ((!trimmed && !attachmentPath) || trimmed.length > 4000) {
    throw new Error('Add a message or an attachment (message limit: 4000 characters).');
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
      image_url: attachmentPath ? `${DM_ATTACHMENT_PREFIX}${attachmentPath}` : null,
      reply_to_id: replyToId ?? null,
    })
    .select(
      'id, conversation_id, channel_id, author_id, reply_to_id, body, image_url, created_at, updated_at',
    )
    .single();

  if (error) throw error;

  return data as Message;
}



export async function updateDirectMessage(
  messageId: string,
  body: string,
): Promise<Message> {
  const trimmed = body.trim();

  if (!trimmed || trimmed.length > 4000) {
    throw new Error('Message must contain 1–4000 characters.');
  }

  const { data, error } = await supabase
    .from('messages')
    .update({ body: trimmed, updated_at: new Date().toISOString() })
    .eq('id', messageId)
    .select(
      'id, conversation_id, channel_id, author_id, reply_to_id, body, image_url, created_at, updated_at',
    )
    .single();

  if (error) throw error;
  return data as Message;
}

export async function deleteDirectMessage(messageId: string): Promise<void> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');

  const { data: message, error: fetchError } = await supabase
    .from('messages')
    .select('author_id, image_url, conversation_id')
    .eq('id', messageId)
    .single();

  if (fetchError) throw fetchError;

  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', messageId);

  if (error) throw error;

  // Only remove files owned by the current user. A moderator deleting
  // somebody else's message must not attempt to delete that user's object.
  if (
    message.author_id === user.id &&
    message.image_url?.startsWith(DM_ATTACHMENT_PREFIX)
  ) {
    const path = message.image_url.slice(DM_ATTACHMENT_PREFIX.length);
    const expectedPrefix = `${message.conversation_id ?? ''}/${user.id}/`;
    if (path.startsWith(expectedPrefix)) {
      // Message deletion is already complete; storage cleanup is best-effort.
      await supabase.storage.from(DM_ATTACHMENT_BUCKET).remove([path]);
    }
  }
}

export async function markConversationAsRead(
  conversationId: string,
): Promise<string> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');

  const readAt = new Date().toISOString();
  const { error } = await supabase
    .from('conversation_members')
    .update({ last_read_at: readAt })
    .eq('conversation_id', conversationId)
    .eq('user_id', user.id);

  if (error) throw error;
  return readAt;
}

export async function fetchUnreadMessageCount(
  conversationId: string,
  lastReadAt: string,
  userId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .neq('author_id', userId)
    .gt('created_at', lastReadAt);

  if (error) throw error;
  return count ?? 0;
}


export interface DirectMessageReaction {
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
}

export async function fetchMessageReactions(
  messageIds: string[],
): Promise<DirectMessageReaction[]> {
  if (messageIds.length === 0) return [];

  const { data, error } = await supabase
    .from('message_reactions')
    .select('message_id, user_id, emoji, created_at')
    .in('message_id', messageIds);

  if (error) throw error;
  return (data ?? []) as DirectMessageReaction[];
}

export async function addMessageReaction(
  messageId: string,
  emoji: string,
): Promise<DirectMessageReaction> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');

  const { data, error } = await supabase
    .from('message_reactions')
    .insert({ message_id: messageId, user_id: user.id, emoji })
    .select('message_id, user_id, emoji, created_at')
    .single();

  if (error) throw error;
  return data as DirectMessageReaction;
}

export async function removeMessageReaction(
  messageId: string,
  emoji: string,
): Promise<void> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');

  const { error } = await supabase
    .from('message_reactions')
    .delete()
    .eq('message_id', messageId)
    .eq('user_id', user.id)
    .eq('emoji', emoji);

  if (error) throw error;
}
