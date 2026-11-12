
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Hash,
  Send,
  Users,
  MessageSquare,
  RefreshCw,
  ChevronDown,
  Paperclip,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchMyServers,
  fetchChannels,
  fetchServerMembers,
} from '@/lib/serversApi';
import {
  fetchChannelMessages,
  sendChannelMessage,
} from '@/lib/messagesApi';
import type {
  Channel,
  MemberWithProfile,
  ServerWithMeta,
} from '@/types/servers';
import type { Message } from '@/types/messages';

export function MessagesSection() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? '';

  const [servers, setServers] = useState<ServerWithMeta[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);

  const [serverId, setServerId] = useState('');
  const [channelId, setChannelId] = useState('');
  const [messageText, setMessageText] = useState('');

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState('');

  const refreshServers = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setError('');

    try {
      const result = await fetchMyServers(userId);
      setServers(result);

      if (result.length > 0) {
        setServerId((current) => current || result[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load servers.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refreshServers();
  }, [refreshServers]);

  useEffect(() => {
    if (!serverId) return;

    let active = true;

    async function loadServerData() {
      setChannels([]);
      setMembers([]);
      setMessages([]);
      setChannelId('');

      try {
        const [channelResult, memberResult] = await Promise.all([
          fetchChannels(serverId),
          fetchServerMembers(serverId),
        ]);

        if (!active) return;

        setChannels(channelResult);
        setMembers(memberResult);

        if (channelResult.length > 0) {
          setChannelId(channelResult[0].id);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : 'Could not load server.');
        }
      }
    }

    void loadServerData();

    return () => {
      active = false;
    };
  }, [serverId]);

  const loadMessages = useCallback(async () => {
    if (!channelId) return;

    setError('');

    try {
      const result = await fetchChannelMessages(channelId);
      setMessages(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load messages.');
    }
  }, [channelId]);

  useEffect(() => {
    setMessages([]);
    void loadMessages();
  }, [loadMessages]);

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!channelId || !messageText.trim() || sending) return;

    setSending(true);
    setError('');

    try {
      const message = await sendChannelMessage(channelId, messageText);
      setMessages((current) => [...current, message]);
      setMessageText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send message.');
    } finally {
      setSending(false);
    }
  }

  async function handleLoadOlder() {
    if (!channelId || messages.length === 0 || loadingOlder) return;

    setLoadingOlder(true);
    setError('');

    try {
      const older = await fetchChannelMessages(channelId, messages[0]);
      setMessages((current) => [...older, ...current]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load older messages.');
    } finally {
      setLoadingOlder(false);
    }
  }

  const activeServer = servers.find((server) => server.id === serverId);
  const activeChannel = channels.find((channel) => channel.id === channelId);

  const membersById = new Map(
    members.map((member) => [member.user_id, member]),
  );

  const groupedChannels = channels.reduce<Record<string, Channel[]>>(
    (groups, channel) => {
      const category = channel.category || 'General';
      if (!groups[category]) groups[category] = [];
      groups[category].push(channel);
      return groups;
    },
    {},
  );

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[520px] overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-950">
      <aside className="flex w-60 shrink-0 flex-col border-r border-white/[0.08] bg-ink-900/70">
        <div className="border-b border-white/[0.08] p-4">
          <h2 className="text-lg font-bold text-ink-50">Messages</h2>
          <p className="mt-1 text-xs text-ink-500">AFTERDARK communities</p>
        </div>

        <div className="border-b border-white/[0.08] p-3">
          <label className="mb-2 block text-xs font-semibold uppercase text-ink-500">
            Select server
          </label>

          <select
            value={serverId}
            onChange={(event) => setServerId(event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-ink-800 px-3 py-2 text-sm text-ink-100 outline-none focus:border-primary-400"
          >
            {servers.length === 0 && <option value="">No servers</option>}
            {servers.map((server) => (
              <option key={server.id} value={server.id}>
                {server.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {Object.entries(groupedChannels).map(([category, items]) => (
            <div key={category} className="mb-5">
              <div className="mb-2 flex items-center gap-1 px-1 text-[10px] font-bold uppercase tracking-wider text-ink-500">
                <ChevronDown size={13} />
                {category}
              </div>

              <div className="space-y-1">
                {items.map((channel) => (
                  <button
                    key={channel.id}
                    onClick={() => setChannelId(channel.id)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                      channelId === channel.id
                        ? 'bg-primary-500/15 text-primary-200'
                        : 'text-ink-400 hover:bg-white/[0.05] hover:text-ink-100'
                    }`}
                  >
                    <Hash size={15} />
                    <span className="truncate">{channel.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {!loading && servers.length === 0 && (
            <p className="px-2 py-4 text-sm text-ink-500">
              Join or create a server first.
            </p>
          )}
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Hash size={19} className="shrink-0 text-primary-300" />
            <div className="min-w-0">
              <h3 className="truncate font-semibold text-ink-50">
                {activeChannel?.name ?? 'Select a channel'}
              </h3>
              <p className="truncate text-xs text-ink-500">
                {activeServer?.name ?? 'No server selected'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm text-ink-400">
            <Users size={16} />
            {members.length}
          </div>
        </header>

        {error && (
          <div role="alert" className="shrink-0 border-b border-red-400/20 bg-red-400/10 px-4 py-2 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {channelId && messages.length >= 100 && (
            <div className="mb-5 text-center">
              <button
                onClick={() => void handleLoadOlder()}
                disabled={loadingOlder}
                className="rounded-lg border border-white/10 px-4 py-2 text-xs text-ink-400 transition hover:bg-white/[0.05] disabled:opacity-50"
              >
                {loadingOlder ? 'Loading...' : 'Load older messages'}
              </button>
            </div>
          )}

          {messages.length === 0 && channelId && (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <MessageSquare size={36} className="mb-3 text-ink-600" />
              <p className="font-semibold text-ink-300">No messages yet</p>
              <p className="mt-1 text-sm text-ink-500">
                Start the conversation.
              </p>
            </div>
          )}

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
          </div>
        </div>

        <form onSubmit={handleSend} className="shrink-0 border-t border-white/[0.08] p-4">
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
              placeholder={
                activeChannel
                  ? `Message #${activeChannel.name}`
                  : 'Select a channel first'
              }
              maxLength={4000}
              disabled={!channelId || sending}
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-ink-100 outline-none placeholder:text-ink-600"
            />

            <button
              type="submit"
              disabled={!channelId || !messageText.trim() || sending}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-500 text-white transition hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-40"
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
      </main>

      <aside className="hidden w-56 shrink-0 flex-col border-l border-white/[0.08] bg-ink-900/50 xl:flex">
        <div className="border-b border-white/[0.08] p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-ink-400">
            Members — {members.length}
          </h3>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {members.map((member) => {
            const name =
              member.profile?.display_name ||
              member.profile?.username ||
              'Unknown user';

            return (
              <div key={member.user_id} className="flex items-center gap-2.5 rounded-lg px-2 py-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink-700 text-xs font-bold text-ink-200">
                  {member.profile?.avatar_url ? (
                    <img
                      src={member.profile.avatar_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    name.slice(0, 1).toUpperCase()
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-ink-200">
                    {name}
                  </p>
                  <p className="text-[10px] capitalize text-ink-500">
                    {member.role}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
