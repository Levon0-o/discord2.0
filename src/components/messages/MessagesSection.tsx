
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  Hash,
  Send,
  MessageSquare,
  Users,
  Loader2,
  ChevronDown,
  Clock,
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

import type { ServerWithMeta, Channel, MemberWithProfile } from '@/types/servers';
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

  const [draft, setDraft] = useState('');
  const [loadingServers, setLoadingServers] = useState(true);
  const [loadingChannel, setLoadingChannel] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');

  const activeServer = servers.find((server) => server.id === serverId);
  const activeChannel = channels.find((channel) => channel.id === channelId);

  const groupedChannels = useMemo(() => {
    const groups = new Map<string, Channel[]>();

    for (const channel of channels) {
      const category = channel.category || 'General';
      const group = groups.get(category) ?? [];
      group.push(channel);
      groups.set(category, group);
    }

    return Array.from(groups.entries());
  }, [channels]);

  const memberNames = useMemo(() => {
    return new Map(
      members.map((member) => [
        member.user_id,
        member.profile?.display_name ||
          member.profile?.username ||
          'Unknown user',
      ]),
    );
  }, [members]);

  // Load servers
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!userId) return;

      setLoadingServers(true);
      setError('');

      try {
        const result = await fetchMyServers(userId);

        if (cancelled) return;

        setServers(result);
        setServerId(result[0]?.id ?? '');
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Could not load servers.',
          );
        }
      } finally {
        if (!cancelled) setLoadingServers(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Load channels and members when server changes
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!serverId) {
        setChannels([]);
        setMembers([]);
        setChannelId('');
        return;
      }

      setLoadingChannel(true);
      setError('');
      setMessages([]);
      setChannelId('');

      try {
        const [channelRows, memberRows] = await Promise.all([
          fetchChannels(serverId),
          fetchServerMembers(serverId),
        ]);

        if (cancelled) return;

        setChannels(channelRows);
        setMembers(memberRows);
        setChannelId(channelRows[0]?.id ?? '');
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Could not load server data.',
          );
        }
      } finally {
        if (!cancelled) setLoadingChannel(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [serverId]);

  // Load messages when channel changes
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!channelId) {
        setMessages([]);
        setHasMore(false);
        return;
      }

      setLoadingChannel(true);
      setError('');

      try {
        const result = await fetchChannelMessages(channelId);

        if (cancelled) return;

        setMessages(result);
        setHasMore(result.length === 100);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Could not load messages.',
          );
        }
      } finally {
        if (!cancelled) setLoadingChannel(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [channelId]);

  // Load older messages
  const loadOlder = useCallback(async () => {
    if (!channelId || messages.length === 0 || loadingOlder) return;

    setLoadingOlder(true);
    setError('');

    try {
      const oldestMessage = messages[0];
      const olderMessages = await fetchChannelMessages(
        channelId,
        oldestMessage,
      );

      setMessages((current) => [...olderMessages, ...current]);
      setHasMore(olderMessages.length === 100);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not load older messages.',
      );
    } finally {
      setLoadingOlder(false);
    }
  }, [channelId, messages, loadingOlder]);

  // Send message
  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!channelId || !draft.trim() || sending) return;

    setSending(true);
    setError('');

    try {
      const message = await sendChannelMessage(channelId, draft);

      setMessages((current) => [...current, message]);
      setDraft('');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not send message.',
      );
    } finally {
      setSending(false);
    }
  }

  if (loadingServers) {
    return (
      <div className="panel flex min-h-[400px] items-center justify-center">
        <Loader2 className="animate-spin text-primary-300" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-500/15 ring-1 ring-primary-400/20">
          <MessageSquare size={22} className="text-primary-300" />
        </div>

        <div>
          <h1 className="text-2xl font-semibold text-ink-50">Messages</h1>
          <p className="text-sm text-ink-400">
            Your communities and conversations.
          </p>
        </div>
      </header>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300"
        >
          {error}
        </p>
      )}

      {servers.length === 0 ? (
        <div className="panel flex min-h-[350px] flex-col items-center justify-center p-6 text-center">
          <Users size={32} className="mb-3 text-ink-500" />
          <h2 className="font-semibold text-ink-100">No servers yet</h2>
          <p className="mt-2 max-w-sm text-sm text-ink-400">
            Join or create a server before using its channels.
          </p>
        </div>
      ) : (
        <div className="grid min-h-[600px] grid-cols-1 gap-3 md:grid-cols-[180px_minmax(0,1fr)] xl:grid-cols-[180px_minmax(0,1fr)_180px]">

          {/* CHANNEL SIDEBAR */}
          <aside className="panel flex min-h-0 flex-col overflow-hidden">
            <div className="border-b border-white/[0.06] p-3">
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                Server
              </label>

              <div className="relative">
                <select
                  value={serverId}
                  onChange={(event) => setServerId(event.target.value)}
                  className="w-full appearance-none rounded-lg border border-white/[0.08] bg-ink-950 px-3 py-2 pr-8 text-sm text-ink-100 outline-none focus:border-primary-400/50"
                >
                  {servers.map((server) => (
                    <option key={server.id} value={server.id}>
                      {server.name}
                    </option>
                  ))}
                </select>

                <ChevronDown
                  size={14}
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-500"
                />
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-3">
              {groupedChannels.map(([category, group]) => (
                <div key={category}>
                  <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-wider text-ink-500">
                    {category}
                  </p>

                  <div className="space-y-1">
                    {group.map((channel) => (
                      <button
                        key={channel.id}
                        type="button"
                        onClick={() => setChannelId(channel.id)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                          channelId === channel.id
                            ? 'bg-primary-500/15 text-primary-200'
                            : 'text-ink-400 hover:bg-white/[0.04] hover:text-ink-100'
                        }`}
                      >
                        <Hash size={14} />
                        <span className="truncate">{channel.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {channels.length === 0 && !loadingChannel && (
                <p className="px-2 py-4 text-xs text-ink-500">
                  This server has no channels.
                </p>
              )}
            </div>
          </aside>

          {/* CHAT */}
          <section className="panel flex min-h-[500px] min-w-0 flex-col overflow-hidden">
            <header className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
              <Hash size={18} className="text-primary-300" />

              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold text-ink-100">
                  {activeChannel?.name ?? 'Select a channel'}
                </h2>

                <p className="truncate text-xs text-ink-500">
                  {activeServer?.name ?? 'AFTERDARK'}
                </p>
              </div>
            </header>

            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">

              {hasMore && messages.length > 0 && (
                <button
                  type="button"
                  disabled={loadingOlder}
                  onClick={() => void loadOlder()}
                  className="mx-auto inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-primary-300 transition hover:bg-primary-500/10 disabled:opacity-50"
                >
                  {loadingOlder ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Clock size={13} />
                  )}
                  Load older messages
                </button>
              )}

              {loadingChannel && (
                <div className="flex flex-1 items-center justify-center">
                  <Loader2 size={24} className="animate-spin text-primary-300" />
                </div>
              )}

              {!loadingChannel && !activeChannel && (
                <div className="flex flex-1 flex-col items-center justify-center text-center">
                  <Hash size={28} className="mb-3 text-ink-600" />
                  <p className="text-sm text-ink-400">
                    Select a channel to start chatting.
                  </p>
                </div>
              )}

              {!loadingChannel && activeChannel && messages.length === 0 && (
                <div className="flex flex-1 flex-col items-center justify-center text-center">
                  <MessageSquare size={30} className="mb-3 text-ink-600" />
                  <h3 className="font-semibold text-ink-200">
                    Welcome to #{activeChannel.name}
                  </h3>
                  <p className="mt-2 text-sm text-ink-500">
                    This is the beginning of this channel.
                  </p>
                </div>
              )}

              {messages.map((message) => {
                const ownMessage = message.author_id === userId;
                const author =
                  ownMessage
                    ? 'You'
                    : memberNames.get(message.author_id) ?? 'Unknown user';

                return (
                  <article
                    key={message.id}
                    className="group flex gap-3 rounded-xl px-2 py-2 transition hover:bg-white/[0.025]"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-500/20 text-sm font-semibold text-primary-200">
                      {author.slice(0, 1).toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-sm font-semibold ${
                          ownMessage ? 'text-primary-200' : 'text-ink-100'
                        }`}>
                          {author}
                        </span>

                        <time
                          className="text-[10px] text-ink-600"
                          dateTime={message.created_at}
                        >
                          {new Date(message.created_at).toLocaleString()}
                        </time>
                      </div>

                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-300">
                        {message.body}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>

            <form
              onSubmit={handleSend}
              className="border-t border-white/[0.06] p-3"
            >
              <div className="flex items-end gap-2 rounded-xl border border-white/[0.08] bg-ink-950/80 p-2 focus-within:border-primary-400/50">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  disabled={!channelId || sending}
                  maxLength={4000}
                  rows={2}
                  placeholder={
                    activeChannel
                      ? `Message #${activeChannel.name}`
                      : 'Select a channel first'
                  }
                  className="max-h-32 min-h-[44px] flex-1 resize-y bg-transparent px-2 py-2 text-sm text-ink-100 outline-none placeholder:text-ink-600 disabled:opacity-50"
                />

                <button
                  type="submit"
                  disabled={!channelId || !draft.trim() || sending}
                  aria-label="Send message"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-500 text-white transition hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {sending ? (
                    <Loader2 size={17} className="animate-spin" />
                  ) : (
                    <Send size={17} />
                  )}
                </button>
              </div>

              <p className="mt-2 px-1 text-[10px] text-ink-600">
                Enter to send · Shift + Enter for a new line · Maximum 4000 characters
              </p>
            </form>
          </section>

          {/* MEMBERS */}
          <aside className="panel hidden min-h-0 flex-col overflow-hidden xl:flex">
            <div className="border-b border-white/[0.06] px-3 py-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                Members · {members.length}
              </h2>
            </div>

            <div className="flex-1 space-y-1 overflow-y-auto p-2">
              {members.map((member) => {
                const name =
                  member.profile?.display_name ||
                  member.profile?.username ||
                  'Unknown user';

                return (
                  <div
                    key={member.user_id}
                    className="flex items-center gap-2 rounded-lg px-2 py-2"
                  >
                    {member.profile?.avatar_url ? (
                      <img
                        src={member.profile.avatar_url}
                        alt=""
                        className="h-7 w-7 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-500/20 text-xs font-semibold text-primary-200">
                        {name.slice(0, 1).toUpperCase()}
                      </div>
                    )}

                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-ink-200">
                        {name}
                      </p>
                      <p className="text-[10px] capitalize text-ink-600">
                        {member.role}
                      </p>
                    </div>
                  </div>
                );
              })}

              {members.length === 0 && (
                <p className="px-2 py-4 text-xs text-ink-500">
                  No members found.
                </p>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
