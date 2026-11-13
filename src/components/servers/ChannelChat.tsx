import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Hash, MessageSquare, Paperclip, RefreshCw, Send, Reply, Pencil,
  Trash2, Pin, X, Check, Copy,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  fetchChannelMessages, sendChannelMessage, editMessage, deleteMessage,
  fetchChannelReactions, toggleChannelReaction, fetchPinnedChannelMessages,
  toggleChannelPin,
  type ChannelMessageReaction, type PinnedChannelMessage,
} from '@/lib/messagesApi';
import type { Message } from '@/types/messages';
import type { MemberWithProfile } from '@/types/servers';

interface ChannelChatProps {
  channelId: string;
  channelName: string;
  channelTopic?: string;
  members: MemberWithProfile[];
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉'] as const;

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ChannelChat({ channelId, channelName, channelTopic, members }: ChannelChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState('');
  const [reactions, setReactions] = useState<ChannelMessageReaction[]>([]);
  const [pinned, setPinned] = useState<PinnedChannelMessage[]>([]);
  const [showPins, setShowPins] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [busyMessageId, setBusyMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const shouldScrollToBottomRef = useRef(true);

  const membersById = useMemo(() => new Map(members.map((member) => [member.user_id, member])), [members]);
  const messagesById = useMemo(() => new Map(messages.map((message) => [message.id, message])), [messages]);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      shouldScrollToBottomRef.current = true;
      const result = await fetchChannelMessages(channelId);
      setMessages(result);
      setHasMore(result.length === 100);
      const [reactionRows, pinRows] = await Promise.all([
        fetchChannelReactions(result.map((message) => message.id)),
        fetchPinnedChannelMessages(channelId),
      ]);
      setReactions(reactionRows);
      setPinned(pinRows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load channel messages.');
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active) setUserId(data.user?.id ?? '');
    });
    return () => { active = false; };
  }, []);

  useEffect(() => { void loadMessages(); }, [loadMessages]);

  useEffect(() => {
    const channel = supabase.channel(`channel-chat:${channelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `channel_id=eq.${channelId}` }, (payload) => {
        const next = payload.new as Message;
        const old = payload.old as Partial<Message>;
        if (payload.eventType === 'INSERT' && next?.id) {
          setMessages((current) => current.some((item) => item.id === next.id) ? current : [...current, next]);
          if (next.author_id !== userId) shouldScrollToBottomRef.current = true;
        } else if (payload.eventType === 'UPDATE' && next?.id) {
          setMessages((current) => current.map((item) => item.id === next.id ? next : item));
        } else if (payload.eventType === 'DELETE' && old?.id) {
          setMessages((current) => current.filter((item) => item.id !== old.id));
          setReactions((current) => current.filter((item) => item.message_id !== old.id));
          setPinned((current) => current.filter((item) => item.message_id !== old.id));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, (payload) => {
        const next = payload.new as ChannelMessageReaction;
        const old = payload.old as Partial<ChannelMessageReaction>;
        if (payload.eventType === 'INSERT' && next?.message_id) {
          setReactions((current) => current.some((item) => item.message_id === next.message_id && item.user_id === next.user_id && item.emoji === next.emoji) ? current : [...current, next]);
        } else if (payload.eventType === 'DELETE' && old?.message_id) {
          setReactions((current) => current.filter((item) => !(item.message_id === old.message_id && item.user_id === old.user_id && item.emoji === old.emoji)));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'channel_pinned_messages', filter: `channel_id=eq.${channelId}` }, (payload) => {
        const next = payload.new as PinnedChannelMessage;
        const old = payload.old as Partial<PinnedChannelMessage>;
        if (payload.eventType === 'INSERT' && next?.message_id) {
          setPinned((current) => current.some((item) => item.message_id === next.message_id) ? current : [next, ...current]);
        } else if (payload.eventType === 'DELETE' && old?.message_id) {
          setPinned((current) => current.filter((item) => item.message_id !== old.message_id));
        }
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [channelId, userId]);

  useEffect(() => {
    if (!shouldScrollToBottomRef.current) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    shouldScrollToBottomRef.current = false;
  }, [messages]);

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!messageText.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      const message = await sendChannelMessage(channelId, messageText, replyingTo?.id);
      shouldScrollToBottomRef.current = true;
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      setMessageText('');
      setReplyingTo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send message.');
    } finally {
      setSending(false);
    }
  }

  async function handleLoadOlder() {
    if (!messages.length || loadingOlder || !hasMore) return;
    const container = scrollContainerRef.current;
    const previousHeight = container?.scrollHeight ?? 0;
    setLoadingOlder(true);
    try {
      const older = await fetchChannelMessages(channelId, messages[0]);
      setMessages((current) => {
        const ids = new Set(current.map((item) => item.id));
        return [...older.filter((item) => !ids.has(item.id)), ...current];
      });
      setHasMore(older.length === 100);
      requestAnimationFrame(() => {
        if (container) container.scrollTop = container.scrollHeight - previousHeight;
      });
      const extra = await fetchChannelReactions(older.map((message) => message.id));
      setReactions((current) => [...current, ...extra.filter((item) => !current.some((existing) => existing.message_id === item.message_id && existing.user_id === item.user_id && existing.emoji === item.emoji))]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load older messages.');
    } finally {
      setLoadingOlder(false);
    }
  }

  async function handleReaction(messageId: string, emoji: string) {
    const active = reactions.some((item) => item.message_id === messageId && item.user_id === userId && item.emoji === emoji);
    try {
      await toggleChannelReaction(messageId, emoji, active);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update reaction.');
    }
  }

  async function handlePin(messageId: string) {
    const isPinned = pinned.some((item) => item.message_id === messageId);
    setBusyMessageId(messageId);
    try {
      await toggleChannelPin(channelId, messageId, isPinned);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update pinned messages.');
    } finally {
      setBusyMessageId(null);
    }
  }

  async function handleEdit(messageId: string) {
    if (!editingText.trim()) return;
    setBusyMessageId(messageId);
    try {
      const updated = await editMessage(messageId, editingText);
      setMessages((current) => current.map((item) => item.id === messageId ? updated : item));
      setEditingId(null);
      setEditingText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not edit message.');
    } finally {
      setBusyMessageId(null);
    }
  }

  async function handleDelete(messageId: string) {
    if (!window.confirm('Delete this message?')) return;
    setBusyMessageId(messageId);
    try {
      await deleteMessage(messageId);
      setMessages((current) => current.filter((item) => item.id !== messageId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete message.');
    } finally {
      setBusyMessageId(null);
    }
  }

  const pinnedMessages = pinned.map((item) => messagesById.get(item.message_id)).filter((item): item is Message => Boolean(item));

  return (
    <section className="panel flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.06] px-5 py-3.5">
        <div className="flex min-w-0 items-center gap-2">
          <Hash size={18} className="text-ink-400" />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-ink-100">{channelName}</h2>
            {channelTopic ? <p className="truncate text-xs text-ink-500">{channelTopic}</p> : null}
          </div>
        </div>
        <button type="button" onClick={() => setShowPins((value) => !value)} className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition ${showPins ? 'border-primary-400/40 bg-primary-500/10 text-primary-200' : 'border-white/[0.08] text-ink-400 hover:bg-white/[0.05]'}`}>
          <Pin size={13} /> Pins <span>{pinned.length}</span>
        </button>
      </header>

      {showPins ? (
        <div className="max-h-40 shrink-0 overflow-y-auto border-b border-white/[0.06] bg-ink-950/50 p-3">
          {pinnedMessages.length ? pinnedMessages.map((message) => (
            <button key={message.id} type="button" onClick={() => { setShowPins(false); messageRefs.current[message.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} className="mb-1 block w-full truncate rounded-lg px-2 py-1.5 text-left text-xs text-ink-300 hover:bg-white/[0.05]">
              <Pin size={11} className="mr-1 inline text-primary-300" />{message.body || 'Attachment'}
            </button>
          )) : <p className="text-xs text-ink-500">No pinned messages in this channel yet.</p>}
        </div>
      ) : null}

      {error ? <p role="alert" className="shrink-0 border-b border-red-400/20 bg-red-400/10 px-4 py-2 text-sm text-red-300">{error}</p> : null}

      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
        {hasMore && !loading ? (
          <div className="mb-5 text-center">
            <button type="button" onClick={() => void handleLoadOlder()} disabled={loadingOlder} className="rounded-lg border border-white/10 px-4 py-2 text-xs text-ink-400 transition hover:bg-white/[0.05] disabled:opacity-50">
              {loadingOlder ? 'Loading…' : 'Load older messages'}
            </button>
          </div>
        ) : null}
        {!loading && messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <MessageSquare size={36} className="mb-3 text-ink-600" />
            <p className="font-semibold text-ink-300">No messages yet</p>
            <p className="mt-1 text-sm text-ink-500">Start the conversation in #{channelName}.</p>
          </div>
        ) : null}
        {loading ? <div className="flex h-full items-center justify-center"><RefreshCw size={22} className="animate-spin text-primary-300" /></div> : (
          <div>
            {messages.map((message, index) => {
              const author = membersById.get(message.author_id);
              const displayName = author?.profile?.display_name || author?.profile?.username || 'Unknown user';
              const previous = messages[index - 1];
              const date = new Date(message.created_at);
              const previousDate = previous ? new Date(previous.created_at) : null;
              const grouped = Boolean(previous && previous.author_id === message.author_id && previousDate?.toDateString() === date.toDateString() && date.getTime() - previousDate!.getTime() <= 15 * 60 * 1000);
              const messageReactions = reactions.filter((item) => item.message_id === message.id);
              const isPinned = pinned.some((item) => item.message_id === message.id);
              const isMine = message.author_id === userId;
              const replyTarget = message.reply_to_id ? messagesById.get(message.reply_to_id) : null;
              const groupedReactions = QUICK_REACTIONS.map((emoji) => ({ emoji, users: messageReactions.filter((item) => item.emoji === emoji) })).filter((item) => item.users.length);
              return (
                <article key={message.id} ref={(node) => { messageRefs.current[message.id] = node; }} className={`group relative rounded-xl px-2 py-2 transition-colors hover:bg-white/[0.025] ${index === 0 ? 'mt-0' : grouped ? 'mt-0.5' : 'mt-4'}`}>
                  <div className="flex gap-3">
                    <div className="flex w-9 shrink-0 justify-center">
                      {grouped ? <span className="pt-1 text-[9px] text-transparent group-hover:text-ink-500">{formatTime(message.created_at)}</span> : (
                        <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-primary-500/20 text-sm font-bold text-primary-200">
                          {author?.profile?.avatar_url ? <img src={author.profile.avatar_url} alt="" className="h-full w-full object-cover" /> : displayName.slice(0, 1).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {!grouped ? <div className="mb-1 flex flex-wrap items-baseline gap-2">
                        <span className="text-sm font-semibold text-ink-100">{isMine ? 'You' : displayName}</span>
                        {author?.custom_roles?.[0] ? <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: author.custom_roles[0].color }}>{author.custom_roles[0].icon ? `${author.custom_roles[0].icon} ` : ''}{author.custom_roles[0].name}</span> : null}
                        <time className="text-[11px] text-ink-500">{formatTime(message.created_at)}</time>
                        {message.updated_at !== message.created_at ? <span className="text-[10px] text-ink-600">(edited)</span> : null}
                        {isPinned ? <Pin size={11} className="text-primary-300" /> : null}
                      </div> : null}
                      {replyTarget ? <button type="button" onClick={() => messageRefs.current[replyTarget.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' })} className="mb-1 block max-w-full truncate rounded-md border-l-2 border-primary-400/60 bg-white/[0.035] px-2 py-1 text-left text-[11px] text-ink-400 hover:text-ink-200">↳ {replyTarget.body || 'Attachment'}</button> : null}
                      {editingId === message.id ? (
                        <div className="space-y-2">
                          <textarea value={editingText} onChange={(event) => setEditingText(event.target.value)} maxLength={4000} rows={2} className="w-full resize-y rounded-lg border border-primary-400/30 bg-ink-950 px-3 py-2 text-sm text-ink-100 outline-none focus:border-primary-400/60" />
                          <div className="flex gap-1.5">
                            <button type="button" onClick={() => void handleEdit(message.id)} disabled={busyMessageId === message.id || !editingText.trim()} className="inline-flex items-center gap-1 rounded-md bg-primary-500/15 px-2 py-1 text-xs text-primary-200 disabled:opacity-50"><Check size={12} /> Save</button>
                            <button type="button" onClick={() => { setEditingId(null); setEditingText(''); }} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-400 hover:bg-white/[0.05]"><X size={12} /> Cancel</button>
                          </div>
                        </div>
                      ) : <p className="whitespace-pre-wrap break-words text-sm leading-6 text-ink-300">{message.body}</p>}
                      {groupedReactions.length ? <div className="mt-1.5 flex flex-wrap gap-1">{groupedReactions.map(({ emoji, users }) => <button key={emoji} type="button" onClick={() => void handleReaction(message.id, emoji)} className={`rounded-full border px-2 py-0.5 text-xs transition ${users.some((item) => item.user_id === userId) ? 'border-primary-400/40 bg-primary-500/10 text-primary-200' : 'border-white/[0.08] bg-ink-900/70 text-ink-300 hover:border-white/20'}`}>{emoji} {users.length}</button>)}</div> : null}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1 opacity-100 transition-opacity sm:absolute sm:right-2 sm:top-2 sm:mt-0 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                        <button type="button" title="Reply" onClick={() => setReplyingTo(message)} className="rounded-md border border-white/[0.08] bg-ink-950/95 p-1.5 text-ink-400 hover:text-primary-200"><Reply size={13} /></button>
                        <button type="button" title="Pin / unpin" disabled={busyMessageId === message.id} onClick={() => void handlePin(message.id)} className={`rounded-md border border-white/[0.08] bg-ink-950/95 p-1.5 ${isPinned ? 'text-primary-200' : 'text-ink-400 hover:text-primary-200'}`}><Pin size={13} /></button>
                        {isMine ? <>
                          <button type="button" title="Edit" onClick={() => { setEditingId(message.id); setEditingText(message.body); }} className="rounded-md border border-white/[0.08] bg-ink-950/95 p-1.5 text-ink-400 hover:text-primary-200"><Pencil size={13} /></button>
                          <button type="button" title="Delete" disabled={busyMessageId === message.id} onClick={() => void handleDelete(message.id)} className="rounded-md border border-red-400/15 bg-ink-950/95 p-1.5 text-red-300/80 hover:text-red-200"><Trash2 size={13} /></button>
                        </> : null}
                        <button type="button" title="Copy message" onClick={() => void navigator.clipboard?.writeText(message.body)} className="rounded-md border border-white/[0.08] bg-ink-950/95 p-1.5 text-ink-400 hover:text-ink-200"><Copy size={13} /></button>
                        {QUICK_REACTIONS.map((emoji) => <button key={emoji} type="button" title={`React ${emoji}`} onClick={() => void handleReaction(message.id, emoji)} className="rounded-md border border-white/[0.08] bg-ink-950/95 px-1.5 py-1 text-xs hover:border-primary-400/40">{emoji}</button>)}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="shrink-0 border-t border-white/[0.06] p-3 sm:p-4">
        {replyingTo ? <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border-l-2 border-primary-400 bg-ink-900 px-3 py-2">
          <div className="min-w-0"><p className="text-[10px] font-semibold text-primary-300">Replying to {replyingTo.author_id === userId ? 'yourself' : membersById.get(replyingTo.author_id)?.profile?.display_name || membersById.get(replyingTo.author_id)?.profile?.username || 'member'}</p><p className="truncate text-xs text-ink-400">{replyingTo.body || 'Attachment'}</p></div>
          <button type="button" onClick={() => setReplyingTo(null)} className="rounded-md p-1 text-ink-500 hover:text-ink-200" aria-label="Cancel reply"><X size={15} /></button>
        </div> : null}
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-ink-900 px-3 py-2 focus-within:border-primary-400/50">
          <button type="button" disabled title="File uploads are coming later" className="text-ink-600"><Paperclip size={19} /></button>
          <input value={messageText} onChange={(event) => setMessageText(event.target.value)} placeholder={`Message #${channelName}`} maxLength={4000} disabled={sending || loading} className="min-w-0 flex-1 bg-transparent py-2 text-sm text-ink-100 outline-none placeholder:text-ink-600" />
          <button type="submit" disabled={!messageText.trim() || sending || loading} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-500 text-white transition hover:bg-primary-400 disabled:opacity-40" aria-label="Send message">{sending ? <RefreshCw size={17} className="animate-spin" /> : <Send size={17} />}</button>
        </div>
        <p className="mt-2 text-[10px] text-ink-600">Enter to send · Maximum 4000 characters</p>
      </form>
    </section>
  );
}
