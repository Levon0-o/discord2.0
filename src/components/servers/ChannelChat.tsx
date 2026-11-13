
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Hash, MessageSquare, Paperclip, RefreshCw, Send } from 'lucide-react';
import {
  fetchChannelMessages,
  sendChannelMessage,
} from '@/lib/messagesApi';
import type { Message } from '@/types/messages';
import type { MemberWithProfile } from '@/types/servers';

interface ChannelChatProps {
  channelId: string;
  channelName: string;
  channelTopic?: string;
  members: MemberWithProfile[];
}

export function ChannelChat({
  channelId,
  channelName,
  channelTopic,
  members,
}: ChannelChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState('');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const shouldScrollToBottomRef = useRef(true);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      shouldScrollToBottomRef.current = true;
      const result = await fetchChannelMessages(channelId);
      setMessages(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not load messages.',
      );
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    let active = true;

    async function loadUser() {
      const { supabase } = await import('@/lib/supabase');
      const { data } = await supabase.auth.getUser();

      if (active) setUserId(data.user?.id ?? '');
    }

    void loadUser();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

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
      const message = await sendChannelMessage(channelId, messageText);
      shouldScrollToBottomRef.current = true;
      setMessages((current) => [...current, message]);
      setMessageText('');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not send message.',
      );
    } finally {
      setSending(false);
    }
  }

  async function handleLoadOlder() {
    if (!messages.length || loadingOlder) return;

    setLoadingOlder(true);
    setError('');

    try {
      const older = await fetchChannelMessages(channelId, messages[0]);
      setMessages((current) => [...older, ...current]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not load older messages.',
      );
    } finally {
      setLoadingOlder(false);
    }
  }

  const membersById = new Map(
    members.map((member) => [member.user_id, member]),
  );

  return (
    <section className="panel flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-2 border-b border-white/[0.06] px-5 py-3.5">
        <Hash size={18} className="text-ink-400" />
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-ink-100">
            {channelName}
          </h2>
          {channelTopic ? (
            <p className="truncate text-xs text-ink-500">
              {channelTopic}
            </p>
          ) : null}
        </div>
      </header>

      {error ? (
        <p
          role="alert"
          className="shrink-0 border-b border-red-400/20 bg-red-400/10 px-4 py-2 text-sm text-red-300"
        >
          {error}
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {messages.length >= 100 ? (
          <div className="mb-5 text-center">
            <button
              type="button"
              onClick={() => void handleLoadOlder()}
              disabled={loadingOlder}
              className="rounded-lg border border-white/10 px-4 py-2 text-xs text-ink-400 transition hover:bg-white/[0.05] disabled:opacity-50"
            >
              {loadingOlder ? 'Loading...' : 'Load older messages'}
            </button>
          </div>
        ) : null}

        {!loading && messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <MessageSquare size={36} className="mb-3 text-ink-600" />
            <p className="font-semibold text-ink-300">No messages yet</p>
            <p className="mt-1 text-sm text-ink-500">
              Start the conversation in #{channelName}.
            </p>
          </div>
        ) : null}

        {loading ? (
          <div className="flex h-full items-center justify-center">
            <RefreshCw size={22} className="animate-spin text-primary-300" />
          </div>
        ) : (
          <div>
            {messages.map((message, index) => {
              const author = membersById.get(message.author_id);
              const displayName =
                author?.profile?.display_name ||
                author?.profile?.username ||
                'Unknown user';

              const date = new Date(message.created_at);
              const previousMessage = messages[index - 1];

              const previousDate = previousMessage
                ? new Date(previousMessage.created_at)
                : null;

              const timeDifference = previousDate
                ? date.getTime() - previousDate.getTime()
                : Infinity;

              const isGrouped =
                !!previousMessage &&
                previousMessage.author_id === message.author_id &&
                date.toDateString() === previousDate!.toDateString() &&
                timeDifference >= 0 &&
                timeDifference <= 15 * 60 * 1000;

              return (
                <article
                  key={message.id}
                  className={`flex gap-3 ${index === 0 ? 'mt-0' : isGrouped ? 'mt-1' : 'mt-4'}`}
                >
                  <div className="flex w-9 shrink-0 justify-center">
                    {isGrouped ? (
                      <span className="pt-1 text-[9px] text-transparent hover:text-ink-500">
                        {date.toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-primary-500/20 text-sm font-bold text-primary-200">
                        {author?.profile?.avatar_url ? (
                          <img
                            src={author.profile.avatar_url}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          displayName.slice(0, 1).toUpperCase()
                        )}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    {!isGrouped && (
                      <div className="mb-1 flex flex-wrap items-baseline gap-2">
                        <span className="text-sm font-semibold text-ink-100">
                          {message.author_id === userId ? 'You' : displayName}
                        </span>
                        {author?.custom_roles?.[0] && (
                          <span
                            className="rounded-md border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-semibold"
                            style={{ color: author.custom_roles[0].color }}
                            title={author.custom_roles[0].name}
                          >
                            {author.custom_roles[0].icon ? `${author.custom_roles[0].icon} ` : ''}
                            {author.custom_roles[0].name}
                          </span>
                        )}
                        <time className="text-[11px] text-ink-500">
                          {date.toLocaleString()}
                        </time>
                      </div>
                    )}

                    <p className="whitespace-pre-wrap break-words text-sm leading-6 text-ink-300">
                      {message.body}
                    </p>
                  </div>
                </article>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <form
        onSubmit={handleSend}
        className="shrink-0 border-t border-white/[0.06] p-4"
      >
        <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-ink-900 px-3 py-2 focus-within:border-primary-400/50">
          <button
            type="button"
            disabled
            title="File uploads are coming later"
            className="text-ink-600"
          >
            <Paperclip size={19} />
          </button>

          <input
            value={messageText}
            onChange={(event) => setMessageText(event.target.value)}
            placeholder={`Message #${channelName}`}
            maxLength={4000}
            disabled={sending || loading}
            className="min-w-0 flex-1 bg-transparent py-2 text-sm text-ink-100 outline-none placeholder:text-ink-600"
          />

          <button
            type="submit"
            disabled={!messageText.trim() || sending || loading}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-500 text-white transition hover:bg-primary-400 disabled:opacity-40"
            aria-label="Send message"
          >
            {sending ? (
              <RefreshCw size={17} className="animate-spin" />
            ) : (
              <Send size={17} />
            )}
          </button>
        </div>
        <p className="mt-2 text-[10px] text-ink-600">
          Maximum message length: 4000 characters
        </p>
      </form>
    </section>
  );
}
