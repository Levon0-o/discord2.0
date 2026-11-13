import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MessageCircle, Send, Trash2, X } from 'lucide-react';

import { supabase } from '@/lib/supabase';
import { deleteServerEventChatMessage, fetchServerEventChatMessages, sendServerEventChatMessage, type ServerEventChatMessage } from '@/lib/serverEventChatApi';
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
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const rows = await fetchServerEventChatMessages(eventId);
        if (active) setMessages(rows);
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
        } else if (payload.eventType === 'DELETE') {
          const removed = payload.old as { id?: string };
          if (removed.id) setMessages((current) => current.filter((message) => message.id !== removed.id));
        }
      })
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [eventId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      const created = await sendServerEventChatMessage(eventId, body);
      setMessages((current) => current.some((message) => message.id === created.id) ? current : [...current, created]);
      setBody('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send message.');
    } finally {
      setSending(false);
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

  return (
    <section className="overflow-hidden rounded-xl border border-primary-400/20 bg-ink-900/80">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <MessageCircle size={15} className="shrink-0 text-primary-300" />
          <div className="min-w-0"><p className="text-xs font-semibold text-ink-100">Event chat</p><p className="truncate text-[10px] text-ink-500">{eventTitle}</p></div>
        </div>
        <button type="button" onClick={onClose} className="rounded-md p-1.5 text-ink-500 hover:bg-white/[0.06] hover:text-ink-100" aria-label="Close event chat"><X size={14} /></button>
      </div>
      <div className="max-h-64 min-h-32 space-y-3 overflow-y-auto p-3">
        {loading ? <p className="py-8 text-center text-xs text-ink-500">Loading chat…</p> : messages.length === 0 ? <div className="py-8 text-center"><MessageCircle size={20} className="mx-auto mb-2 text-ink-600" /><p className="text-xs text-ink-400">No messages yet</p><p className="mt-1 text-[10px] text-ink-600">Start coordinating with event attendees.</p></div> : messages.map((message) => {
          const member = members.find((entry) => entry.user_id === message.author_id);
          const label = member?.profile?.display_name || member?.profile?.username || 'Server member';
          const own = message.author_id === userId;
          return (
            <article key={message.id} className="group flex items-start gap-2">
              {member?.profile?.avatar_url ? <img src={member.profile.avatar_url} alt="" className="mt-0.5 h-7 w-7 shrink-0 rounded-full object-cover" /> : <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-[10px] text-ink-300">{label.slice(0, 1).toUpperCase()}</span>}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2"><span className="text-[11px] font-semibold text-ink-200">{label}</span><time className="text-[9px] text-ink-600">{new Date(message.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</time></div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-5 text-ink-300">{message.body}</p>
              </div>
              {(own || ['owner', 'admin', 'moderator'].includes(member?.role ?? '')) ? <button type="button" onClick={() => void handleDelete(message.id)} className="rounded p-1 text-ink-600 opacity-0 transition hover:bg-red-400/10 hover:text-red-300 group-hover:opacity-100" aria-label="Delete message"><Trash2 size={12} /></button> : null}
            </article>
          );
        })}
        <div ref={bottomRef} />
      </div>
      {error ? <p role="alert" className="border-t border-red-400/10 bg-red-400/[0.05] px-3 py-2 text-[10px] text-red-300">{error}</p> : null}
      <form onSubmit={(event) => void handleSend(event)} className="flex items-end gap-2 border-t border-white/[0.07] p-2.5">
        <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} rows={2} placeholder="Message event attendees…" className="max-h-24 min-h-10 flex-1 resize-y rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-xs text-ink-100 outline-none placeholder:text-ink-600 focus:border-primary-400/50" />
        <button type="submit" disabled={sending || !body.trim()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-500 text-white transition hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send event message"><Send size={14} /></button>
      </form>
    </section>
  );
}
