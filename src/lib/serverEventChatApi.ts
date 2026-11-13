import { supabase } from '@/lib/supabase';

export interface ServerEventChatMessage {
  id: string;
  event_id: string;
  author_id: string;
  body: string;
  reply_to_id: string | null;
  created_at: string;
  edited_at: string | null;
  attachment_path: string | null;
}

const EVENT_CHAT_PAGE_SIZE = 50;
const EVENT_CHAT_ATTACHMENT_BUCKET = 'event-chat-attachments';
const EVENT_CHAT_ATTACHMENT_MAX_SIZE = 15 * 1024 * 1024;
const EVENT_CHAT_ATTACHMENT_TYPES = new Set(['image/jpeg','image/png','image/gif','image/webp','application/pdf','text/plain','text/csv']);

export async function fetchServerEventChatMessages(
  eventId: string,
  before?: string,
): Promise<{ messages: ServerEventChatMessage[]; hasMore: boolean }> {
  let query = supabase
    .from('server_event_chat_messages')
    .select('id, event_id, author_id, body, reply_to_id, created_at, edited_at, attachment_path')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
    .limit(EVENT_CHAT_PAGE_SIZE + 1);
  if (before) query = query.lt('created_at', before);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []) as ServerEventChatMessage[];
  const hasMore = rows.length > EVENT_CHAT_PAGE_SIZE;
  return { messages: rows.slice(0, EVENT_CHAT_PAGE_SIZE).reverse(), hasMore };
}

export async function searchServerEventChatMessages(eventId: string, searchTerm: string): Promise<ServerEventChatMessage[]> {
  const term = searchTerm.trim();
  if (term.length < 2) return [];
  const { data, error } = await supabase
    .from('server_event_chat_messages')
    .select('id, event_id, author_id, body, reply_to_id, created_at, edited_at, attachment_path')
    .eq('event_id', eventId)
    .ilike('body', '%' + term + '%')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as ServerEventChatMessage[];
}

export async function uploadServerEventChatAttachment(eventId: string, file: File): Promise<string> {
  if (!EVENT_CHAT_ATTACHMENT_TYPES.has(file.type)) throw new Error('Supported files: JPG, PNG, GIF, WEBP, PDF, TXT and CSV.');
  if (file.size <= 0 || file.size > EVENT_CHAT_ATTACHMENT_MAX_SIZE) throw new Error('Attachments must be smaller than 15 MB.');
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');
  const safeName = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(-100) || 'attachment';
  const path = eventId + '/' + user.id + '/' + crypto.randomUUID() + '-' + safeName;
  const { error } = await supabase.storage.from(EVENT_CHAT_ATTACHMENT_BUCKET).upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false });
  if (error) throw error;
  return path;
}

export async function getServerEventChatAttachmentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(EVENT_CHAT_ATTACHMENT_BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function removeServerEventChatAttachment(path: string): Promise<void> {
  const { error } = await supabase.storage.from(EVENT_CHAT_ATTACHMENT_BUCKET).remove([path]);
  if (error) throw error;
}
export async function sendServerEventChatMessage(eventId: string, body: string, replyToId?: string | null, attachmentPath?: string): Promise<ServerEventChatMessage> {
  const trimmed = body.trim();
  if ((!trimmed && !attachmentPath) || trimmed.length > 2000) {
    throw new Error('Add a message or attachment (message limit: 2000 characters).');
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');

  const { data, error } = await supabase
    .from('server_event_chat_messages')
    .insert({ event_id: eventId, author_id: user.id, body: trimmed, reply_to_id: replyToId ?? null, attachment_path: attachmentPath ?? null })
    .select('id, event_id, author_id, body, reply_to_id, created_at, edited_at, attachment_path')
    .single();
  if (error) throw error;
  return data as ServerEventChatMessage;
}

export async function editServerEventChatMessage(messageId: string, body: string): Promise<ServerEventChatMessage> {
  const trimmed = body.trim();
  if (!trimmed || trimmed.length > 2000) throw new Error('Message must contain 1–2000 characters.');
  const { data, error } = await supabase
    .from('server_event_chat_messages')
    .update({ body: trimmed })
    .eq('id', messageId)
    .select('id, event_id, author_id, body, reply_to_id, created_at, edited_at, attachment_path')
    .single();
  if (error) throw error;
  return data as ServerEventChatMessage;
}

export async function deleteServerEventChatMessage(messageId: string): Promise<void> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');
  const { data: message, error: fetchError } = await supabase.from('server_event_chat_messages').select('author_id, attachment_path').eq('id', messageId).single();
  if (fetchError) throw fetchError;
  const { error } = await supabase.from('server_event_chat_messages').delete().eq('id', messageId);
  if (error) throw error;
  if (message.author_id === user.id && message.attachment_path) await supabase.storage.from(EVENT_CHAT_ATTACHMENT_BUCKET).remove([message.attachment_path]);
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


export interface ServerEventChatPin {
  event_id: string;
  message_id: string;
  pinned_by: string;
  created_at: string;
}

export async function fetchServerEventChatPins(eventId: string): Promise<ServerEventChatPin[]> {
  const { data, error } = await supabase
    .from('server_event_chat_pins')
    .select('event_id, message_id, pinned_by, created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ServerEventChatPin[];
}

export async function setServerEventChatPin(
  eventId: string,
  messageId: string,
  pinned: boolean,
): Promise<void> {
  if (pinned) {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!user) throw new Error('You must be logged in.');
    const { error } = await supabase.from('server_event_chat_pins').insert({
      event_id: eventId,
      message_id: messageId,
      pinned_by: user.id,
    });
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('server_event_chat_pins')
      .delete()
      .eq('event_id', eventId)
      .eq('message_id', messageId);
    if (error) throw error;
  }
}


export interface ServerEventChatReadReceipt {
  event_id: string;
  user_id: string;
  last_read_at: string;
  updated_at: string;
}

export async function fetchServerEventChatReadReceipts(eventId: string): Promise<ServerEventChatReadReceipt[]> {
  const { data, error } = await supabase
    .from('server_event_chat_reads')
    .select('event_id, user_id, last_read_at, updated_at')
    .eq('event_id', eventId);
  if (error) throw error;
  return (data ?? []) as ServerEventChatReadReceipt[];
}

export async function markServerEventChatRead(eventId: string): Promise<ServerEventChatReadReceipt> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('server_event_chat_reads')
    .upsert({ event_id: eventId, user_id: user.id, last_read_at: now, updated_at: now }, { onConflict: 'event_id,user_id' })
    .select('event_id, user_id, last_read_at, updated_at')
    .single();
  if (error) throw error;
  return data as ServerEventChatReadReceipt;
}


export interface ServerEventChatSavedMessage {
  event_id: string;
  message_id: string;
  user_id: string;
  author_id: string;
  body: string;
  saved_at: string;
}

export async function fetchServerEventChatSavedMessages(eventId: string): Promise<ServerEventChatSavedMessage[]> {
  const { data, error } = await supabase
    .from('server_event_chat_saved_messages')
    .select('event_id, message_id, user_id, author_id, body, saved_at')
    .eq('event_id', eventId)
    .order('saved_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ServerEventChatSavedMessage[];
}

export async function toggleServerEventChatSavedMessage(eventId: string, messageId: string, saved: boolean): Promise<void> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');
  if (saved) {
    const { data: message, error: messageError } = await supabase
      .from('server_event_chat_messages')
      .select('author_id, body')
      .eq('id', messageId)
      .eq('event_id', eventId)
      .single();
    if (messageError) throw messageError;
    const { error } = await supabase.from('server_event_chat_saved_messages').insert({
      event_id: eventId,
      message_id: messageId,
      user_id: user.id,
      author_id: message.author_id,
      body: message.body,
    });
    if (error) throw error;
  } else {
    const { error } = await supabase.from('server_event_chat_saved_messages').delete().eq('event_id', eventId).eq('message_id', messageId).eq('user_id', user.id);
    if (error) throw error;
  }
}


export type ServerEventChatReportReason = 'spam' | 'harassment' | 'hate_or_discrimination' | 'inappropriate_content' | 'threats' | 'other';
export type ServerEventChatReportStatus = 'open' | 'resolved' | 'dismissed';

export interface ServerEventChatReport {
  id: string;
  event_id: string;
  message_id: string;
  reporter_id: string;
  reported_user_id: string;
  reason: ServerEventChatReportReason;
  details: string;
  message_body: string;
  status: ServerEventChatReportStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export async function fetchServerEventChatReports(eventId: string): Promise<ServerEventChatReport[]> {
  const { data, error } = await supabase
    .from('server_event_chat_reports')
    .select('id, event_id, message_id, reporter_id, reported_user_id, reason, details, message_body, status, reviewed_by, reviewed_at, created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ServerEventChatReport[];
}

export async function submitServerEventChatReport(
  message: ServerEventChatMessage,
  reason: ServerEventChatReportReason,
  details: string,
): Promise<void> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');
  if (message.author_id === user.id) throw new Error('You cannot report your own message.');
  const { error } = await supabase.from('server_event_chat_reports').insert({
    event_id: message.event_id,
    message_id: message.id,
    reporter_id: user.id,
    reported_user_id: message.author_id,
    reason,
    details: details.trim().slice(0, 500),
    message_body: message.body,
  });
  if (error) {
    if (error.code === '23505') throw new Error('You have already reported this message.');
    throw error;
  }
}

export async function reviewServerEventChatReport(reportId: string, status: Exclude<ServerEventChatReportStatus, 'open'>): Promise<void> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('You must be logged in.');
  const { error } = await supabase.from('server_event_chat_reports').update({
    status,
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
  }).eq('id', reportId);
  if (error) throw error;
}


export interface ServerEventChatNotificationPreference {
  event_id: string;
  user_id: string;
  muted_until: string | null;
  updated_at: string;
}

export async function fetchServerEventChatNotificationPreference(eventId: string): Promise<ServerEventChatNotificationPreference | null> {
  const { data, error } = await supabase
    .from('server_event_chat_notification_preferences')
    .select('event_id, user_id, muted_until, updated_at')
    .eq('event_id', eventId)
    .maybeSingle();
  if (error) throw error;
  return data as ServerEventChatNotificationPreference | null;
}

export async function setServerEventChatNotificationsMuted(eventId: string, duration: '1h' | '8h' | '24h' | 'forever' | 'off'): Promise<void> {
  if (duration === 'off') {
    const { error } = await supabase.from('server_event_chat_notification_preferences').delete().eq('event_id', eventId);
    if (error) throw error;
    return;
  }
  const mutedUntil = duration === 'forever'
    ? null
    : new Date(Date.now() + ({ '1h': 60, '8h': 480, '24h': 1440 }[duration] * 60_000)).toISOString();
  const { error } = await supabase.from('server_event_chat_notification_preferences').upsert({
    event_id: eventId,
    muted_until: mutedUntil,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'event_id,user_id' });
  if (error) throw error;
}


export interface ServerEventChatPollOption {
  id: string;
  label: string;
}

export interface ServerEventChatPoll {
  id: string;
  event_id: string;
  message_id: string;
  created_by: string;
  question: string;
  options: ServerEventChatPollOption[];
  allow_multiple: boolean;
  expires_at: string | null;
  closed_at: string | null;
  created_at: string;
}

export interface ServerEventChatPollVote {
  id: string;
  poll_id: string;
  option_id: string;
  user_id: string;
  created_at: string;
}

export async function fetchServerEventChatPolls(eventId: string): Promise<{ polls: ServerEventChatPoll[]; votes: ServerEventChatPollVote[] }> {
  const { data: polls, error: pollsError } = await supabase
    .from('server_event_chat_polls')
    .select('id, event_id, message_id, created_by, question, options, allow_multiple, expires_at, closed_at, created_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });
  if (pollsError) throw pollsError;
  const pollRows = (polls ?? []) as ServerEventChatPoll[];
  if (pollRows.length === 0) return { polls: [], votes: [] };
  const { data: votes, error: votesError } = await supabase
    .from('server_event_chat_poll_votes')
    .select('id, poll_id, option_id, user_id, created_at')
    .in('poll_id', pollRows.map((poll) => poll.id));
  if (votesError) throw votesError;
  return { polls: pollRows, votes: (votes ?? []) as ServerEventChatPollVote[] };
}

export async function createServerEventChatPoll(
  eventId: string,
  question: string,
  options: string[],
  allowMultiple: boolean,
  expiresAt: string | null,
): Promise<ServerEventChatPoll> {
  const { data, error } = await supabase.rpc('create_server_event_chat_poll', {
    p_event_id: eventId,
    p_question: question,
    p_options: options,
    p_allow_multiple: allowMultiple,
    p_expires_at: expiresAt,
  });
  if (error) throw error;
  const result = (data as { poll_id: string; message_id: string }[] | null)?.[0];
  if (!result?.poll_id) throw new Error('Poll was created but could not be loaded.');
  const { data: poll, error: pollError } = await supabase
    .from('server_event_chat_polls')
    .select('id, event_id, message_id, created_by, question, options, allow_multiple, expires_at, closed_at, created_at')
    .eq('id', result.poll_id)
    .single();
  if (pollError) throw pollError;
  return poll as ServerEventChatPoll;
}

export async function castServerEventChatPollVote(pollId: string, optionId: string, selected: boolean): Promise<void> {
  const { error } = await supabase.rpc('cast_server_event_chat_poll_vote', {
    p_poll_id: pollId,
    p_option_id: optionId,
    p_selected: selected,
  });
  if (error) throw error;
}

export async function closeServerEventChatPoll(pollId: string): Promise<void> {
  const { error } = await supabase.rpc('close_server_event_chat_poll', { p_poll_id: pollId });
  if (error) throw error;
}


export async function deleteServerEventChatPoll(pollId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_server_event_chat_poll', { p_poll_id: pollId });
  if (error) throw error;
}
