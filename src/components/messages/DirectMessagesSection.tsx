
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  MessageSquare,
  Send,
  Paperclip,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { FriendsPanel } from '@/components/messages/FriendsPanel';
import {
  fetchMyConversations,
  fetchConversationMembers,
  fetchDirectMessages,
  getOrCreateDirectConversation,
  sendDirectMessage,
} from '@/lib/directMessagesApi';
import type {
  DirectConversation,
  DirectConversationMember,
} from '@/lib/directMessagesApi';
import type { Message } from '@/types/messages';
import type { ProfileLite } from '@/types/servers';

interface DirectMessagesSectionProps {
  initialConversationId?: string | null;
  onInitialConversationHandled?: () => void;
}

export function DirectMessagesSection({
  initialConversationId = null,
  onInitialConversationHandled,
}: DirectMessagesSectionProps) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? '';

  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileLite>>({});
  const [members, setMembers] = useState<DirectConversationMember[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeId, setActiveId] = useState('');
  const [messageText, setMessageText] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  const loadConversations = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const rows = await fetchMyConversations();
      setConversations(rows);

      const memberRows = await Promise.all(
        rows.map((conversation) =>
          fetchConversationMembers(conversation.id)
        )
      );

      const allMembers = memberRows.flat();
      setMembers(allMembers);

      const userIds = [
        ...new Set(allMembers.map((member) => member.user_id)),
      ];

      if (userIds.length > 0) {
        const { data, error: profileError } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', userIds);

        if (profileError) throw profileError;

        const profileMap: Record<string, ProfileLite> = {};

        (data ?? []).forEach((profile) => {
          profileMap[profile.id] = profile as ProfileLite;
        });

        setProfiles(profileMap);
      } else {
        setProfiles({});
      }

      setActiveId((current) =>
        current && rows.some((row) => row.id === current)
          ? current
          : rows[0]?.id ?? ''
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load conversations.'
      );
    } finally {
      setLoading(false);
    }
  }, [userId]);

  async function handleMessageFriend(friendId: string) {
    setError('');

    try {
      const conversationId =
        await getOrCreateDirectConversation(friendId);

      setFriendsOpen(false);
      await loadConversations();

      setActiveId(conversationId);
      setMobileChatOpen(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not open conversation.'
      );
    }
  }

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!initialConversationId || loading) return;

    const conversationExists = conversations.some(
      (conversation) => conversation.id === initialConversationId
    );

    if (conversationExists) {
      setActiveId(initialConversationId);
      setMobileChatOpen(true);
    }

    onInitialConversationHandled?.();
  }, [
    initialConversationId,
    loading,
    conversations,
    onInitialConversationHandled,
  ]);

  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeId
  );

  const activeMembers = members.filter(
    (member) => member.conversation_id === activeId
  );

  const otherMember = activeMembers.find(
    (member) => member.user_id !== userId
  );

  const otherProfile = otherMember
    ? profiles[otherMember.user_id]
    : undefined;

  const displayName =
    otherProfile?.display_name ||
    otherProfile?.username ||
    activeConversation?.title ||
    'Unknown user';

  function membersForConversation(conversationId: string) {
    return members.filter(
      (member) => member.conversation_id === conversationId
    );
  }

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }

    let active = true;

    async function loadChat() {
      setMessages([]);
      setError('');

      try {
        const messageRows = await fetchDirectMessages(activeId);

        if (!active) return;

        setMessages(messageRows);
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : 'Could not load messages.'
          );
        }
      }
    }

    void loadChat();

    return () => {
      active = false;
    };
  }, [activeId]);

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeId || !messageText.trim() || sending) return;

    setSending(true);
    setError('');

    try {
      const message = await sendDirectMessage(
        activeId,
        messageText.trim()
      );

      setMessages((current) => [...current, message]);
      setMessageText('');

      await loadConversations();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not send message.'
      );
    } finally {
      setSending(false);
    }
  }

  const filteredConversations = conversations.filter((conversation) => {
    const conversationMembers = membersForConversation(conversation.id);
    const other = conversationMembers.find(
      (member) => member.user_id !== userId
    );

    const profile = other ? profiles[other.user_id] : undefined;

    const name =
      profile?.display_name ||
      profile?.username ||
      conversation.title ||
      '';

    return name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div className="flex h-[calc(100dvh-11rem)] min-h-[360px] w-full min-w-0 overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-950 md:h-[calc(100dvh-3rem)] md:min-h-[560px]">

      {/* CONVERSATION LIST */}
      <aside
        className={`${
          mobileChatOpen ? 'hidden' : 'flex'
        } w-full shrink-0 flex-col border-r border-white/[0.08] bg-ink-900/70 md:flex md:w-72 lg:w-80`}
      >
        <div className="border-b border-white/[0.08] p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-ink-50">
                Messages
              </h2>
              <p className="mt-1 text-sm text-ink-500">
                Your private conversations
              </p>
            </div>

            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500/15 text-primary-300">
              <MessageSquare size={20} />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setFriendsOpen(true)}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary-500/15 px-4 py-3 text-sm font-semibold text-primary-200 transition hover:bg-primary-500/25"
          >
            <Users size={18} />
            Find friends
          </button>
        </div>

        <div className="p-4">
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-ink-800 px-4">
            <Search size={17} className="shrink-0 text-ink-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search conversations"
              className="min-w-0 w-full flex-1 bg-transparent py-3 text-sm text-ink-100 outline-none placeholder:text-ink-500"
            />
          </div>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          <p className="px-3 pb-2 pt-1 text-[11px] font-bold uppercase tracking-wider text-ink-500">
            Direct messages
          </p>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-ink-500">
              <RefreshCw size={16} className="animate-spin" />
              Loading conversations...
            </div>
          )}

          {!loading && filteredConversations.map((conversation) => {
            const participant = membersForConversation(conversation.id).find(
              (member) => member.user_id !== userId
            );

            const profile = participant
              ? profiles[participant.user_id]
              : undefined;

            const name =
              profile?.display_name ||
              profile?.username ||
              conversation.title ||
              'Unknown user';

            const selected = activeId === conversation.id;

            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => {
                  setActiveId(conversation.id);
                  setMobileChatOpen(true);
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left transition ${
                  selected
                    ? 'bg-primary-500/15 text-primary-100'
                    : 'text-ink-300 hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-500/20 text-base font-bold text-primary-200">
                  {profile?.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    name.slice(0, 1).toUpperCase()
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {name}
                  </p>
                  <p className="mt-1 text-xs text-ink-500">
                    Private conversation
                  </p>
                </div>

                {selected && (
                  <div className="h-2 w-2 shrink-0 rounded-full bg-primary-400" />
                )}
              </button>
            );
          })}

          {!loading && conversations.length === 0 && (
            <div className="px-4 py-12 text-center">
              <MessageSquare
                size={32}
                className="mx-auto mb-4 text-ink-600"
              />
              <p className="text-sm font-semibold text-ink-300">
                No conversations yet
              </p>
              <p className="mt-2 text-xs leading-5 text-ink-500">
                Find friends and start your first conversation.
              </p>
            </div>
          )}

          {!loading &&
            conversations.length > 0 &&
            filteredConversations.length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-ink-500">
                No matching conversations.
              </p>
            )}
        </div>
      </aside>

      {/* CHAT WINDOW */}
      <main
        className={`${
          mobileChatOpen ? 'flex' : 'hidden'
        } min-h-0 min-w-0 flex-1 flex-col bg-ink-950 md:flex`}
      >
        {activeConversation ? (
          <>
            <header className="flex min-h-[76px] shrink-0 items-center gap-3 border-b border-white/[0.08] px-3 py-3 sm:px-5">
              <button
                type="button"
                onClick={() => setMobileChatOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ink-300 transition hover:bg-white/[0.06] md:hidden"
                aria-label="Back to conversations"
              >
                <ArrowLeft size={21} />
              </button>

              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-500/20 text-base font-bold text-primary-200">
                {otherProfile?.avatar_url ? (
                  <img
                    src={otherProfile.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  displayName.slice(0, 1).toUpperCase()
                )}
              </div>

              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-bold text-ink-50">
                  {displayName}
                </h3>
                <p className="mt-0.5 text-xs text-ink-500">
                  Direct message
                </p>
              </div>
            </header>

            {error && (
              <p
                role="alert"
                className="shrink-0 border-b border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300"
              >
                {error}
              </p>
            )}

            {/* MESSAGES */}
            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 sm:p-6">
              {messages.length === 0 && (
                <div className="flex flex-1 flex-col items-center justify-center text-center">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-500/10 text-primary-300">
                    <MessageSquare size={30} />
                  </div>
                  <p className="text-base font-semibold text-ink-200">
                    This is the beginning
                  </p>
                  <p className="mt-2 text-sm text-ink-500">
                    Send the first message to {displayName}.
                  </p>
                </div>
              )}

              {messages.map((message) => {
                const mine = message.author_id === userId;
                const author = profiles[message.author_id];

                const name = mine
                  ? 'You'
                  : author?.display_name ||
                    author?.username ||
                    displayName;

                return (
                  <article
                    key={message.id}
                    className="flex min-w-0 gap-3"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-500/20 text-sm font-bold text-primary-200">
                      {author?.avatar_url ? (
                        <img
                          src={author.avatar_url}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        name.slice(0, 1).toUpperCase()
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="text-sm font-bold text-ink-100">
                          {name}
                        </span>
                        <time className="text-[11px] text-ink-500">
                          {new Date(message.created_at).toLocaleString()}
                        </time>
                      </div>

                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-ink-300 sm:text-base">
                        {message.body}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>

            {/* MESSAGE INPUT */}
            <form
              onSubmit={handleSend}
              className="shrink-0 border-t border-white/[0.08] bg-ink-950 p-3 sm:p-5"
            >
              <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-white/10 bg-ink-900 px-3 py-2 transition focus-within:border-primary-400/50 sm:px-4">
                <button
                  type="button"
                  disabled
                  title="File uploads are coming later"
                  className="hidden shrink-0 text-ink-600 sm:block"
                >
                  <Paperclip size={20} />
                </button>

                <input
                  value={messageText}
                  onChange={(event) => setMessageText(event.target.value)}
                  placeholder={`Message ${displayName}`}
                  maxLength={4000}
                  disabled={sending}
                  className="block min-w-0 w-full flex-1 bg-transparent py-3 text-base text-ink-100 outline-none placeholder:text-ink-600"
                />

                <button
                  type="submit"
                  disabled={!messageText.trim() || sending}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-500 text-white transition hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Send message"
                >
                  {sending ? (
                    <RefreshCw size={18} className="animate-spin" />
                  ) : (
                    <Send size={18} />
                  )}
                </button>
              </div>

              <p className="mt-2 hidden px-1 text-[11px] text-ink-600 sm:block">
                Maximum message length: 4000 characters
              </p>
            </form>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            {error && (
              <p
                role="alert"
                className="mb-4 max-w-md rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300"
              >
                {error}
              </p>
            )}

            <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary-500/10 text-primary-300">
              <MessageSquare size={38} />
            </div>

            <h3 className="text-xl font-bold text-ink-100">
              Your messages
            </h3>
            <p className="mt-2 max-w-sm text-sm leading-6 text-ink-500">
              Select a conversation to start chatting.
            </p>
          </div>
        )}
      </main>

      {/* PROFILE PANEL */}
      <aside className="hidden w-64 shrink-0 flex-col border-l border-white/[0.08] bg-ink-900/50 2xl:flex">
        <div className="border-b border-white/[0.08] p-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-ink-400">
            Profile
          </h3>
        </div>

        {activeConversation && (
          <div className="p-6 text-center">
            <div className="mx-auto flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-primary-500/20 text-3xl font-bold text-primary-200">
              {otherProfile?.avatar_url ? (
                <img
                  src={otherProfile.avatar_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                displayName.slice(0, 1).toUpperCase()
              )}
            </div>

            <h3 className="mt-5 text-base font-bold text-ink-100">
              {displayName}
            </h3>

            {otherProfile?.username && (
              <p className="mt-1 text-sm text-ink-500">
                @{otherProfile.username}
              </p>
            )}

            <div className="mt-6 border-t border-white/[0.08] pt-5 text-left">
              <p className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
                About
              </p>
              <p className="mt-2 text-sm text-ink-400">
                AFTERDARK member
              </p>
            </div>
          </div>
        )}
      </aside>

      {friendsOpen && (
        <FriendsPanel
          onClose={() => setFriendsOpen(false)}
          onMessage={handleMessageFriend}
        />
      )}
    </div>
  );
}
