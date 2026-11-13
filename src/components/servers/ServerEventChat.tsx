import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Check, MessageCircle, Pencil, Pin, Reply, Send, Trash2, X } from 'lucide-react';

import { supabase } from '@/lib/supabase';
import { deleteServerEventChatMessage, editServerEventChatMessage, fetchServerEventChatMessages, fetchServerEventChatPins, fetchServerEventChatReactions, sendServerEventChatMessage, setServerEventChatPin, toggleServerEventChatReaction, type ServerEventChatMessage, type ServerEventChatPin, type ServerEventChatReaction } from '@/lib/serverEventChatApi';
import type { MemberWithProfile } from '@/types/servers';

interface ServerEventChatProps {
  eventId: string;
  eventTitle: string;
  userId: string;
  members: MemberWithProfile[];
  onClose: () => void;
}

export function ServerEventChat({ eventId, eventTitle, userId, members, onClose }: ServerEventChatProps) {
  const [messages, setMessages] = useState<ServerEventChatMessage[]>([]);
  const [reactions, setReactions] = useState<ServerEventChatReaction[]>([]);
  const [pins, setPins] = useState<ServerEventChatPin[]>([]);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [body, setBody] = useState('');
  const [replyingTo, setReplyingTo] = useState<ServerEventChatMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollHeightRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [page, reactionRows] = await Promise.all([fetchServerEventChatMessages(eventId), fetchServerEventChatReactions(eventId)]);
        if (active) { setMessages(page.messages); setHasMore(page.hasMore); setReactions(reactionRows); }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Could not load event chat.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();

    const channel = supabase
      .channel('server-event-chat:' + eventId)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'server_event_chat_messages',
        filter: 'event_id=eq.' + eventId,
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const incoming = payload.new as ServerEventChatMessage;
          setMessages((current) => current.some((message) => message.id === incoming.id) ? current : [...current, incoming]);
        } else if (payload.eventType === 'UPDATE') {
          const incoming = payload.new as ServerEventChatMessage;
          setMessages((current) => current.map((message) => message.id === incoming.id ? incoming : message));
        } else if (payload.eventType === 'DELETE') {
          const removed = payload.old as { id?: string };
          if (removed.id) setMessages((current) => current.filter((message) => message.id !== removed.id));
        }
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'server_event_chat_reactions',
        filter: 'event_id=eq.' + eventId,
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const incoming = payload.new as ServerEventChatReaction;
          setReactions((current) => current.some((reaction) => reaction.id === incoming.id) ? current : [...current, incoming]);
        } else if (payload.eventType === 'DELETE') {
          const removed = payload.old as { id?: string };
          if (removed.id) setReactions((current) => current.filter((reaction) => reaction.id !== removed.id));
        }
      })
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [eventId]);

  useLayoutEffect(() => {
    const list = messageListRef.current;
    if (list && pendingScrollHeightRef.current !== null) {
      list.scrollTop += list.scrollHeight - pendingScrollHeightRef.current;
      pendingScrollHeightRef.current = null;
    }
  }, [messages]);

  useEffect(() => {
    if (!loadingOlder) bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, loadingOlder]);

  async function handleLoadOlder() {
    const oldest = messages[0];
    const list = messageListRef.current;
    if (!oldest || !list || loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    setError('');
    pendingScrollHeightRef.current = list.scrollHeight;
    try {
      const page = await fetchServerEventChatMessages(eventId, oldest.created_at);
      setMessages((current) => {
        const known = new Set(current.map((message) => message.id));
        return [...page.messages.filter((message) => !known.has(message.id)), ...current];
      });
      setHasMore(page.hasMore);
    } catch (err) {
      pendingScrollHeightRef.current = null;
      setError(err instanceof Error ? err.message : 'Could not load older messages.');
    } finally {
      setLoadingOlder(false);
    }
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      const created = await sendServerEventChatMessage(eventId, body, replyingTo?.id);
      setMessages((current) => current.some((message) => message.id === created.id) ? current : [...current, created]);
      setBody('');
      setReplyingTo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send message.');
    } finally {
      setSending(false);
    }
  }

  function startEditing(message: ServerEventChatMessage) {
    setEditingId(message.id);
    setEditBody(message.body);
    setReplyingTo(null);
  }

  async function handleEdit(messageId: string) {
    if (!editBody.trim()) return;
    setError('');
    try {
      const updated = await editServerEventChatMessage(messageId, editBody);
      setMessages((current) => current.map((message) => message.id === updated.id ? updated : message));
      setEditingId(null);
      setEditBody('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not edit message.');
    }
  }

  async function handleDelete(messageId: string) {
    setError('');
    try {
      await deleteServerEventChatMessage(messageId);
      setMessages((current) => current.filter((message) => message.id !== messageId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete message.');
    }
  }

  async function handlePin(messageId: string) {
    const pinned = pins.some((pin) => pin.message_id === messageId);
    setError('');
    try {
      await setServerEventChatPin(eventId, messageId, !pinned);
      const rows = await fetchServerEventChatPins(eventId);
      setPins(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update pinned messages.');
    }
  }

  async function handleReaction(messageId: string, emoji: ServerEventChatReaction['emoji']) {
    setError('');
    try {
      await toggleServerEventChatReaction(eventId, messageId, emoji);
      const rows = await fetchServerEventChatReactions(eventId);
      setReactions(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update reaction.');
    }
  }

  const canModerate = ['owner', 'admin', 'moderator'].includes(
    members.find((entry) => entry.user_id === userId)?.role ?? '',
  );
  const reactionOptions: ServerEventChatReaction['emoji'][] = ['👍', '❤️', '😂', '😮', '🎉'];

  return (
    <section className="overflow-hidden rounded-xl border border-primary-400/20 bg-ink-900/80">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <MessageCircle size={15} className="shrink-0 text-primary-300" />
          <div className="min-w-0"><p className="text-xs font-semibold text-ink-100">Event chat</p><p className="truncate text-[10px] text-ink-500">{eventTitle}</p></div>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setPinnedOpen((value) => !value)} className={'inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] transition ' + (pinnedOpen ? 'bg-primary-500/15 text-primary-200' : 'text-ink-400 hover:bg-white/[0.06] hover:text-ink-100')} aria-expanded={pinnedOpen}><Pin size={12} /> Pinned {pins.length}</button>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-ink-500 hover:bg-white/[0.06] hover:text-ink-100" aria-label="Close event chat"><X size={14} /></button>
        </div>
      </div>
      {pinnedOpen ? (
        <div className="border-b border-white/[0.07] bg-primary-500/[0.04] p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary-200"><Pin size={11} /> Pinned messages</p>
          {pins.length === 0 ? <p className="text-[10px] text-ink-500">No pinned messages yet.</p> : <div className="space-y-1.5">
            {pins.map((pin) => {
              const message = messages.find((item) => item.id === pin.message_id);
              if (!message) return null;
              const author = members.find((entry) => entry.user_id === message.author_id);
              const name = author?.profile?.display_name || author?.profile?.username || 'Server member';
              return <button key={pin.message_id} type="button" onClick={() => document.getElementById('event-chat-message-' + message.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })} className="block w-full rounded-md bg-white/[0.03] px-2.5 py-2 text-left hover:bg-white/[0.07]"><span className="block text-[10px] font-semibold text-ink-300">{name}</span><span className="block truncate text-[10px] text-ink-500">{message.body}</span></button>;
            })}
          </div>}
        </div>
      ) : null}
      <div ref={messageListRef} className="max-h-64 min-h-32 space-y-3 overflow-y-auto p-3">
        {hasMore ? <div className="pb-1 text-center"><button type="button" onClick={() => void handleLoadOlder()} disabled={loadingOlder} className="rounded-md border border-white/[0.08] px-3 py-1.5 text-[10px] text-ink-400 transition hover:border-primary-400/30 hover:text-primary-200 disabled:opacity-50">{loadingOlder ? 'Loading…' : 'Load older messages'}</button></div> : null}
        {loading ? <p className="py-8 text-center text-xs text-ink-500">Loading chat…</p> : messages.length === 0 ? <div className="py-8 text-center"><MessageCircle size={20} className="mx-auto mb-2 text-ink-600" /><p className="text-xs text-ink-400">No messages yet</p><p className="mt-1 text-[10px] text-ink-600">Start coordinating with event attendees.</p></div> : messages.map((message) => {
          const member = members.find((entry) => entry.user_id === message.author_id);
          const label = member?.profile?.display_name || member?.profile?.username || 'Server member';
          const own = message.author_id === userId;
          return (
            <article id={"event-chat-message-" + message.id} key={message.id} className="group flex items-start gap-2">
              {member?.profile?.avatar_url ? <img src={member.profile.avatar_url} alt="" className="mt-0.5 h-7 w-7 shrink-0 rounded-full object-cover" /> : <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-[10px] text-ink-300">{label.slice(0, 1).toUpperCase()}</span>}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2"><span className="text-[11px] font-semibold text-ink-200">{label}</span><time className="text-[9px] text-ink-600">{new Date(message.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</time></div>
                {message.reply_to_id ? (() => {
                  const parent = messages.find((item) => item.id === message.reply_to_id);
                  const parentMember = parent ? members.find((entry) => entry.user_id === parent.author_id) : undefined;
                  const parentName = parentMember?.profile?.display_name || parentMember?.profile?.username || 'Server member';
                  return parent ? (
                    <button
                      type="button"
                      onClick={() => document.getElementById('event-chat-message-' + parent.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                      className="mt-1 block max-w-full truncate rounded border-l-2 border-primary-400/50 bg-white/[0.03] px-2 py-1 text-left text-[10px] text-ink-400 hover:bg-white/[0.06]"
                    >
                      Replying to <span className="font-semibold text-ink-300">{parentName}</span>: {parent.body}
                    </button>
                  ) : <p className="mt-1 text-[10px] text-ink-600">Reply to a message that is no longer available</p>;
                })() : null}
                {editingId === message.id ? (
                  <div className="mt-1 space-y-1.5">
                    <textarea value={editBody} onChange={(event) => setEditBody(event.target.value)} maxLength={2000} rows={2} className="w-full rounded-md border border-primary-400/30 bg-ink-950 px-2 py-1.5 text-xs text-ink-100 outline-none focus:border-primary-400/60" />
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => void handleEdit(message.id)} className="inline-flex items-center gap-1 rounded bg-primary-500/15 px-2 py-1 text-[10px] text-primary-200 hover:bg-primary-500/25"><Check size={11} /> Save</button>
                      <button type="button" onClick={() => { setEditingId(null); setEditBody(''); }} className="rounded px-2 py-1 text-[10px] text-ink-500 hover:bg-white/[0.06]">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-5 text-ink-300">{message.body}</p>
                    {message.edited_at ? <span className="ml-1 text-[9px] text-ink-600">(edited)</span> : null}
                  </>
                )}
                {own && editingId !== message.id ? <button type="button" onClick={() => startEditing(message)} className="mt-1 mr-2 inline-flex items-center gap-1 text-[10px] text-ink-500 transition hover:text-primary-300"><Pencil size={10} /> Edit</button> : null}
                <button
                  type="button"
                  onClick={() => setReplyingTo(message)}
                  className="mt-1 inline-flex items-center gap-1 text-[10px] text-ink-500 transition hover:text-primary-300"
                >
                  <Reply size={11} /> Reply
                </button>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {reactionOptions.map((emoji) => {
                    const matching = reactions.filter((reaction) => reaction.message_id === message.id && reaction.emoji === emoji);
                    const selected = matching.some((reaction) => reaction.user_id === userId);
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => void handleReaction(message.id, emoji)}
                        aria-label={emoji + ' reaction, ' + matching.length + ' total'}
                        className={'rounded-md border px-1.5 py-0.5 text-[10px] transition ' + (selected ? 'border-primary-400/50 bg-primary-500/15 text-primary-100' : 'border-white/[0.07] text-ink-400 hover:border-white/20 hover:bg-white/[0.04]')}
                      >
                        {emoji} {matching.length > 0 ? matching.length : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
              {canModerate ? <button type="button" onClick={() => void handlePin(message.id)} className={'rounded p-1 transition hover:bg-primary-400/10 hover:text-primary-200 ' + (pins.some((pin) => pin.message_id === message.id) ? 'text-primary-300' : 'text-ink-600 opacity-0 group-hover:opacity-100')} aria-label={pins.some((pin) => pin.message_id === message.id) ? 'Unpin message' : 'Pin message'} title={pins.some((pin) => pin.message_id === message.id) ? 'Unpin message' : 'Pin message'}><Pin size={12} /></button> : null}
              {(own || canModerate) ? <button type="button" onClick={() => void handleDelete(message.id)} className="rounded p-1 text-ink-600 opacity-0 transition hover:bg-red-400/10 hover:text-red-300 group-hover:opacity-100" aria-label="Delete message"><Trash2 size={12} /></button> : null}
            </article>
          );
        })}
        <div ref={bottomRef} />
      </div>
      {error ? <p role="alert" className="border-t border-red-400/10 bg-red-400/[0.05] px-3 py-2 text-[10px] text-red-300">{error}</p> : null}
      {replyingTo ? (
        <div className="flex items-center justify-between gap-2 border-t border-white/[0.07] bg-primary-500/[0.05] px-3 py-2">
          <div className="min-w-0 text-[10px] text-ink-400">
            Replying to <span className="font-semibold text-primary-200">{members.find((entry) => entry.user_id === replyingTo.author_id)?.profile?.display_name || members.find((entry) => entry.user_id === replyingTo.author_id)?.profile?.username || 'Server member'}</span>
            <p className="truncate text-ink-500">{replyingTo.body}</p>
          </div>
          <button type="button" onClick={() => setReplyingTo(null)} className="shrink-0 rounded p-1 text-ink-500 hover:bg-white/[0.06] hover:text-ink-200" aria-label="Cancel reply"><X size={12} /></button>
        </div>
      ) : null}
      <form onSubmit={(event) => void handleSend(event)} className="flex items-end gap-2 border-t border-white/[0.07] p-2.5">
        <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} rows={2} placeholder="Message event attendees…" className="max-h-24 min-h-10 flex-1 resize-y rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-xs text-ink-100 outline-none placeholder:text-ink-600 focus:border-primary-400/50" />
        <button type="submit" disabled={sending || !body.trim()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-500 text-white transition hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send event message"><Send size={14} /></button>
      </form>
    </section>
  );
}
