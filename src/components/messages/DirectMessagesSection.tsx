
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  MessageSquare,
  Send,
  Paperclip,
  RefreshCw,
  Search,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  fetchMyConversations,
  fetchConversationMembers,
  fetchDirectMessages,
  sendDirectMessage,
} from '@/lib/directMessagesApi';
import type {
  DirectConversation,
  DirectConversationMember,
} from '@/lib/directMessagesApi';
import type { Message } from '@/types/messages';
import type { ProfileLite } from '@/types/servers';

export function DirectMessagesSection() {
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
          fetchConversationMembers(conversation.id),
        ),
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
          : rows[0]?.id ?? '',
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load conversations.',
      );
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeId,
  );

  const activeMembers = members.filter(
    (member) => member.conversation_id === activeId,
  );

  const otherMember = activeMembers.find(
    (member) => member.user_id !== userId,
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
      (member) => member.conversation_id === conversationId,
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

      try {
        const messageRows = await fetchDirectMessages(activeId);

        if (!active) return;

        setMessages(messageRows);
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : 'Could not load messages.',
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
      const message = await sendDirectMessage(activeId, messageText.trim());

      setMessages((current) => [...current, message]);
      setMessageText('');

      await loadConversations();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not send message.',
      );
    } finally {
      setSending(false);
    }
  }

  const filteredConversations = conversations.filter((conversation) => {
    const conversationMembers = membersForConversation(conversation.id);
    const other = conversationMembers.find(
      (member) => member.user_id !== userId,
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
    <div className="flex h-[calc(100vh-7rem)] min-h-[520px] overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-950">
      <aside className="flex w-64 shrink-0 flex-col border-r border-white/[0.08] bg-ink-900/70">
        <div className="border-b border-white/[0.08] p-4">
          <h2 className="text-lg font-bold text-ink-50">
            Direct Messages
          </h2>
          <p className="mt-1 text-xs text-ink-500">
            Your private conversations
          </p>
        </div>

        <div className="p-3">
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-ink-800 px-3">
            <Search size={15} className="text-ink-500" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search conversations"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-xs text-ink-100 outline-none placeholder:text-ink-500"
            />
          </div>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
          {filteredConversations.map((conversation) => {
            const participant = membersForConversation(conversation.id).find(
              (member) => member.user_id !== userId,
            );

            const profile = participant
              ? profiles[participant.user_id]
              : undefined;

            const name =
              profile?.display_name ||
              profile?.username ||
              conversation.title ||
              'Unknown user';

            return (
              <button
                key={conversation.id}
                onClick={() => setActiveId(conversation.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                  activeId === conversation.id
                    ? 'bg-primary-500/15 text-primary-100'
                    : 'text-ink-300 hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-500/20 font-semibold text-primary-200">
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
                  <p className="text-[11px] text-ink-500">
                    Private conversation
                  </p>
                </div>
              </button>
            );
          })}

          {!loading && conversations.length === 0 && (
            <div className="px-3 py-8 text-center">
              <MessageSquare
                size={26}
                className="mx-auto mb-3 text-ink-600"
              />
              <p className="text-sm font-medium text-ink-300">
                No conversations yet
              </p>
              <p className="mt-1 text-xs text-ink-500">
                Your private chats will appear here.
              </p>
            </div>
          )}

          {!loading &&
            conversations.length > 0 &&
            filteredConversations.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-ink-500">
                No matching conversations.
              </p>
            )}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {activeConversation ? (
          <>
            <header className="flex items-center gap-3 border-b border-white/[0.08] px-5 py-4">
              <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-primary-500/20 font-semibold text-primary-200">
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

              <div className="min-w-0">
                <h3 className="truncate font-semibold text-ink-50">
                  {displayName}
                </h3>
                <p className="text-xs text-ink-500">
                  Direct message
                </p>
              </div>
            </header>

            {error && (
              <p
                role="alert"
                className="border-b border-red-400/20 bg-red-400/10 px-4 py-2 text-sm text-red-300"
              >
                {error}
              </p>
            )}

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {messages.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <MessageSquare
                    size={36}
                    className="mb-3 text-ink-600"
                  />
                  <p className="font-semibold text-ink-300">
                    This is the beginning
                  </p>
                  <p className="mt-1 text-sm text-ink-500">
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
                  <article key={message.id} className="flex gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-500/20 text-sm font-bold text-primary-200">
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
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-semibold text-ink-100">
                          {name}
                        </span>
                        <time className="text-[11px] text-ink-500">
                          {new Date(message.created_at).toLocaleString()}
                        </time>
                      </div>

                      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-ink-300">
                        {message.body}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>

            <form
              onSubmit={handleSend}
              className="border-t border-white/[0.08] p-4"
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
                  placeholder={`Message ${displayName}`}
                  maxLength={4000}
                  disabled={sending}
                  className="min-w-0 flex-1 bg-transparent py-2 text-sm text-ink-100 outline-none placeholder:text-ink-600"
                />

                <button
                  type="submit"
                  disabled={!messageText.trim() || sending}
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
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <MessageSquare
              size={42}
              className="mb-4 text-ink-600"
            />
            <h3 className="font-semibold text-ink-200">
              Your messages
            </h3>
            <p className="mt-2 text-sm text-ink-500">
              Select a conversation to start chatting.
            </p>
          </div>
        )}
      </main>

      <aside className="hidden w-60 shrink-0 flex-col border-l border-white/[0.08] bg-ink-900/50 xl:flex">
        <div className="border-b border-white/[0.08] p-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-ink-400">
            Profile
          </h3>
        </div>

        {activeConversation && (
          <div className="p-5 text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-primary-500/20 text-2xl font-bold text-primary-200">
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

            <h3 className="mt-4 font-semibold text-ink-100">
              {displayName}
            </h3>

            {otherProfile?.username && (
              <p className="mt-1 text-xs text-ink-500">
                @{otherProfile.username}
              </p>
            )}

            <div className="mt-5 border-t border-white/[0.08] pt-4 text-left">
              <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">
                About
              </p>
              <p className="mt-2 text-xs text-ink-400">
                AFTERDARK member
              </p>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
