import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  MessageSquare,
  Send,
  Paperclip,
  RefreshCw,
  Search,
  Users,
  Reply,
  X,
  Pencil,
  Trash2,
  Copy,
  Check,
  FileText,
  Image as ImageIcon,
  Pin,
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
  markConversationAsRead,
  fetchUnreadMessageCount,
  fetchMessageReactions,
  addMessageReaction,
  removeMessageReaction,
  updateDirectMessage,
  deleteDirectMessage,
  uploadDirectMessageAttachment,
  getDirectMessageAttachmentUrl,
  fetchPinnedDirectMessages,
  pinDirectMessage,
  unpinDirectMessage,
} from '@/lib/directMessagesApi';
import type {
  DirectConversation,
  DirectConversationMember,
  DirectMessageReaction,
  PinnedDirectMessage,
} from '@/lib/directMessagesApi';
import type { Message } from '@/types/messages';
import type { ProfileLite } from '@/types/servers';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🎉'] as const;

function renderLinkifiedBody(body: string) {
  return body.split(/(https?:\/\/[^\s<]+)/gi).map((part, index) => {
    if (!/^https?:\/\//i.test(part)) return part;
    const href = part.replace(/[),.!?;:]+$/, '');
    const trailing = part.slice(href.length);
    let domain = href;
    try {
      domain = new URL(href).hostname.replace(/^www\./, '');
    } catch {
      // Keep the original URL if parsing fails.
    }
    return (
      <span key={`${index}-${href}`}>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-primary-300 underline decoration-primary-400/40 underline-offset-2 hover:text-primary-200"
          title={domain}
        >
          {href}
        </a>
        {trailing}
      </span>
    );
  });
}

function attachmentName(storedValue: string) {
  const path = storedValue.replace(/^dm-attachment:/, '');
  const rawName = path.split('/').pop() ?? 'Attachment';
  return rawName.replace(/^[a-f0-9-]{20,}-/i, '') || 'Attachment';
}

function isImageAttachment(storedValue: string) {
  return /\.(jpe?g|png|gif|webp)$/i.test(storedValue);
}

interface DirectMessagesSectionProps {
  initialConversationId?: string | null;
  onInitialConversationHandled?: () => void;
}

function formatConversationTime(value?: string) {
  if (!value) return '';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return date.toLocaleDateString([], {
    day: '2-digit',
    month: '2-digit',
  });
}

function formatMessageDate(value: string) {
  const date = new Date(value);
  const now = new Date();
  const yesterday = new Date();

  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === now.toDateString()) {
    return 'Today';
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }

  return date.toLocaleDateString([], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
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
  const [reactions, setReactions] = useState<DirectMessageReaction[]>([]);
  const [reactingMessageIds, setReactingMessageIds] = useState<string[]>([]);
  const [lastMessages, setLastMessages] = useState<
    Record<string, Message | null>
  >({});
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [activeId, setActiveId] = useState('');
  const [messageText, setMessageText] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [messageSearch, setMessageSearch] = useState('');
  const [pinnedMessages, setPinnedMessages] = useState<PinnedDirectMessage[]>([]);
  const [showPinnedMessages, setShowPinnedMessages] = useState(false);
  const [pinningMessageId, setPinningMessageId] = useState<string | null>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const loadingOlderRef = useRef(false);
  const previousScrollHeightRef = useRef(0);
  const messageRefs = useRef(new Map<string, HTMLElement>());
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSentAtRef = useRef(0);
  const activeIdRef = useRef(activeId);
  const conversationIdsRef = useRef(new Set<string>());
  const messageIdsRef = useRef(new Set<string>());

  activeIdRef.current = activeId;
  conversationIdsRef.current = new Set(conversations.map((conversation) => conversation.id));
  messageIdsRef.current = new Set(messages.map((message) => message.id));

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

      const latestMessageResults = await Promise.all(
        rows.map(async (conversation) => {
          try {
            const conversationMessages = await fetchDirectMessages(
              conversation.id
            );

            return [
              conversation.id,
              conversationMessages[conversationMessages.length - 1] ?? null,
            ] as const;
          } catch {
            return [conversation.id, null] as const;
          }
        })
      );

      setLastMessages(Object.fromEntries(latestMessageResults));

      const unreadResults = await Promise.all(
        rows.map(async (conversation) => {
          const ownMembership = allMembers.find(
            (member) =>
              member.conversation_id === conversation.id &&
              member.user_id === userId
          );

          if (!ownMembership?.last_read_at) {
            return [conversation.id, 0] as const;
          }

          try {
            const count = await fetchUnreadMessageCount(
              conversation.id,
              ownMembership.last_read_at,
              userId
            );
            return [conversation.id, count] as const;
          } catch {
            return [conversation.id, 0] as const;
          }
        })
      );

      setUnreadCounts(Object.fromEntries(unreadResults));

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

  const otherLastReadAt = otherMember?.last_read_at
    ? new Date(otherMember.last_read_at).getTime()
    : 0;
  const lastOwnMessage = [...messages].reverse().find(
    (message) => message.author_id === userId
  );
  const latestOwnMessageIsSeen = Boolean(
    lastOwnMessage &&
    otherLastReadAt >= new Date(lastOwnMessage.created_at).getTime()
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

  const markActiveConversationRead = useCallback(async (conversationId: string) => {
    if (!conversationId || !userId) return;

    try {
      const readAt = await markConversationAsRead(conversationId);
      setMembers((current) =>
        current.map((member) =>
          member.conversation_id === conversationId && member.user_id === userId
            ? { ...member, last_read_at: readAt }
            : member
        )
      );
      setUnreadCounts((current) => ({ ...current, [conversationId]: 0 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update read status.');
    }
  }, [userId]);

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
        setHasMoreMessages(messageRows.length === 100);
        await markActiveConversationRead(activeId);
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
  }, [activeId, markActiveConversationRead]);

  useEffect(() => {
    let active = true;
    if (!activeId) {
      setPinnedMessages([]);
      return () => { active = false; };
    }
    void fetchPinnedDirectMessages(activeId)
      .then((rows) => { if (active) setPinnedMessages(rows); })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load pinned messages.');
      });
    return () => { active = false; };
  }, [activeId]);

  useEffect(() => {
    if (!activeId || !userId) return;
    const channel = supabase
      .channel('dm-pinned-messages:' + activeId)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'conversation_pinned_messages',
        filter: 'conversation_id=eq.' + activeId,
      }, (payload) => {
        const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as PinnedDirectMessage;
        if (!row?.message_id) return;
        if (payload.eventType === 'INSERT') {
          setPinnedMessages((current) => current.some((item) => item.message_id === row.message_id) ? current : [row, ...current]);
        } else if (payload.eventType === 'DELETE') {
          setPinnedMessages((current) => current.filter((item) => item.message_id !== row.message_id));
        }
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [activeId, userId]);

  async function handleTogglePinnedMessage(messageId: string) {
    if (!activeId || pinningMessageId) return;
    const isPinned = pinnedMessages.some((item) => item.message_id === messageId);
    setPinningMessageId(messageId);
    try {
      if (isPinned) {
        await unpinDirectMessage(activeId, messageId);
        setPinnedMessages((current) => current.filter((item) => item.message_id !== messageId));
      } else {
        const row = await pinDirectMessage(activeId, messageId);
        setPinnedMessages((current) => current.some((item) => item.message_id === messageId) ? current : [row, ...current]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update pinned messages.');
    } finally {
      setPinningMessageId(null);
    }
  }

  useEffect(() => {
    let active = true;
    const attachmentMessages = messages.filter((message) => Boolean(message.image_url));

    if (attachmentMessages.length === 0) {
      setAttachmentUrls({});
      return () => {
        active = false;
      };
    }

    void Promise.all(
      attachmentMessages.map(async (message) => {
        try {
          return [message.id, await getDirectMessageAttachmentUrl(message.image_url!)] as const;
        } catch {
          return [message.id, ''] as const;
        }
      })
    ).then((entries) => {
      if (active) setAttachmentUrls(Object.fromEntries(entries));
    });

    return () => {
      active = false;
    };
  }, [messages]);

  useEffect(() => {
    let active = true;

    if (!activeId || messages.length === 0) {
      setReactions([]);
      return () => {
        active = false;
      };
    }

    void fetchMessageReactions(messages.map((message) => message.id))
      .then((rows) => {
        if (active) setReactions(rows);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Could not load message reactions.');
        }
      });

    return () => {
      active = false;
    };
  }, [activeId, messages]);

  useEffect(() => {
    if (!activeId || !userId) return;

    const channel = supabase
      .channel('dm-message-reactions:' + activeId)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions',
        },
        (payload) => {
          const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as DirectMessageReaction;
          if (!row?.message_id || !messageIdsRef.current.has(row.message_id)) return;

          if (payload.eventType === 'INSERT') {
            setReactions((current) =>
              current.some((item) =>
                item.message_id === row.message_id &&
                item.user_id === row.user_id &&
                item.emoji === row.emoji
              ) ? current : [...current, row]
            );
          } else if (payload.eventType === 'DELETE') {
            setReactions((current) =>
              current.filter((item) =>
                !(item.message_id === row.message_id &&
                  item.user_id === row.user_id &&
                  item.emoji === row.emoji)
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeId, userId]);

  async function handleToggleReaction(messageId: string, emoji: string) {
    if (reactingMessageIds.includes(messageId)) return;

    const existing = reactions.some((reaction) =>
      reaction.message_id === messageId &&
      reaction.user_id === userId &&
      reaction.emoji === emoji
    );

    setReactingMessageIds((current) => [...current, messageId]);
    try {
      if (existing) {
        await removeMessageReaction(messageId, emoji);
        setReactions((current) =>
          current.filter((reaction) =>
            !(reaction.message_id === messageId &&
              reaction.user_id === userId &&
              reaction.emoji === emoji)
          )
        );
      } else {
        const created = await addMessageReaction(messageId, emoji);
        setReactions((current) =>
          current.some((reaction) =>
            reaction.message_id === created.message_id &&
            reaction.user_id === created.user_id &&
            reaction.emoji === created.emoji
          ) ? current : [...current, created]
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update reaction.');
    } finally {
      setReactingMessageIds((current) => current.filter((id) => id !== messageId));
    }
  }

  useEffect(() => {
    if (!activeId || !userId) return;

    const channel = supabase
      .channel('dm-read-receipts:' + activeId)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversation_members',
          filter: 'conversation_id=eq.' + activeId,
        },
        (payload) => {
          const updated = payload.new as DirectConversationMember;
          if (updated.user_id === userId) return;
          setMembers((current) =>
            current.map((member) =>
              member.conversation_id === activeId &&
              member.user_id === updated.user_id
                ? { ...member, last_read_at: updated.last_read_at }
                : member
            )
          );
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeId, userId]);

  useEffect(() => {
    if (!activeId || !userId) {
      setIsOtherTyping(false);
      return;
    }

    let mounted = true;
    let typingTimeout: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase.channel(`dm-typing:${activeId}`, {
      config: { private: true, broadcast: { self: false } },
    });

    typingChannelRef.current = channel;
    channel
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!mounted || payload?.user_id === userId) return;
        setIsOtherTyping(Boolean(payload?.is_typing));
        if (typingTimeout) clearTimeout(typingTimeout);
        if (payload?.is_typing) {
          typingTimeout = setTimeout(() => setIsOtherTyping(false), 2500);
        }
      })
      .subscribe();

    return () => {
      mounted = false;
      if (typingTimeout) clearTimeout(typingTimeout);
      typingChannelRef.current = null;
      setIsOtherTyping(false);
      void supabase.removeChannel(channel);
    };
  }, [activeId, userId]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`direct-messages:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const incoming = payload.new as Message;
          const conversationId = incoming.conversation_id;

          if (
            !conversationId ||
            !conversationIdsRef.current.has(conversationId)
          ) {
            return;
          }

          if (activeIdRef.current === conversationId) {
            setMessages((current) =>
              current.some((message) => message.id === incoming.id)
                ? current
                : [...current, incoming]
            );
            if (incoming.author_id !== userId) {
              void markActiveConversationRead(conversationId);
            }
          } else if (incoming.author_id !== userId) {
            setUnreadCounts((current) => ({
              ...current,
              [conversationId]: (current[conversationId] ?? 0) + 1,
            }));
          }

          setLastMessages((current) => ({
            ...current,
            [conversationId]: incoming,
          }));

          setConversations((current) =>
            current
              .map((conversation) =>
                conversation.id === conversationId
                  ? { ...conversation, last_message_at: incoming.created_at }
                  : conversation
              )
              .sort((a, b) => {
                const aTime = a.last_message_at
                  ? new Date(a.last_message_at).getTime()
                  : 0;
                const bTime = b.last_message_at
                  ? new Date(b.last_message_at).getTime()
                  : 0;
                return bTime - aTime;
              })
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const updated = payload.new as Message;
          if (!updated?.id || !updated.conversation_id) return;

          setMessages((current) =>
            current.map((message) => message.id === updated.id ? updated : message)
          );
          setLastMessages((current) => {
            const entry = Object.entries(current).find(([, message]) => message?.id === updated.id);
            if (!entry) return current;
            return { ...current, [entry[0]]: updated };
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          const deleted = payload.old as Partial<Message>;
          if (!deleted?.id) return;

          setMessages((current) => current.filter((message) => message.id !== deleted.id));
          setReactions((current) => current.filter((reaction) => reaction.message_id !== deleted.id));
          setLastMessages((current) => {
            const entry = Object.entries(current).find(([, message]) => message?.id === deleted.id);
            if (!entry) return current;
            return { ...current, [entry[0]]: null };
          });
          setEditingMessageId((current) => current === deleted.id ? null : current);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, markActiveConversationRead]);

  useEffect(() => {
    if (loadingOlderRef.current) {
      const container = messagesScrollRef.current;
      if (container) container.scrollTop += container.scrollHeight - previousScrollHeightRef.current;
      loadingOlderRef.current = false;
      setLoadingOlderMessages(false);
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleLoadOlderMessages() {
    const oldestMessage = messages[0];
    if (!activeId || !oldestMessage || loadingOlderMessages || !hasMoreMessages) return;
    const container = messagesScrollRef.current;
    previousScrollHeightRef.current = container?.scrollHeight ?? 0;
    loadingOlderRef.current = true;
    setLoadingOlderMessages(true);
    try {
      const olderMessages = await fetchDirectMessages(activeId, oldestMessage);
      if (olderMessages.length === 0) {
        loadingOlderRef.current = false;
        setLoadingOlderMessages(false);
        setHasMoreMessages(false);
        return;
      }
      setMessages((current) => {
        const existingIds = new Set(current.map((message) => message.id));
        return [...olderMessages.filter((message) => !existingIds.has(message.id)), ...current];
      });
      setHasMoreMessages(olderMessages.length === 100);
    } catch (err) {
      loadingOlderRef.current = false;
      setLoadingOlderMessages(false);
      setError(err instanceof Error ? err.message : 'Could not load older messages.');
    }
  }


  function startEditingMessage(message: Message) {
    setEditingMessageId(message.id);
    setEditingText(message.body);
    setError('');
  }

  function cancelEditingMessage() {
    setEditingMessageId(null);
    setEditingText('');
  }

  async function handleSaveEdit(messageId: string) {
    if (!editingText.trim() || savingEdit) return;

    setSavingEdit(true);
    setError('');
    try {
      const updated = await updateDirectMessage(messageId, editingText);
      setMessages((current) =>
        current.map((message) => message.id === messageId ? updated : message)
      );
      setLastMessages((current) => {
        const entry = Object.entries(current).find(([, message]) => message?.id === messageId);
        return entry ? { ...current, [entry[0]]: updated } : current;
      });
      cancelEditingMessage();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not edit message.');
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDeleteMessage(messageId: string) {
    if (deletingMessageId) return;

    setDeletingMessageId(messageId);
    setError('');
    try {
      await deleteDirectMessage(messageId);
      setMessages((current) => current.filter((message) => message.id !== messageId));
      setReactions((current) => current.filter((reaction) => reaction.message_id !== messageId));
      setLastMessages((current) => {
        const entry = Object.entries(current).find(([, message]) => message?.id === messageId);
        return entry ? { ...current, [entry[0]]: null } : current;
      });
      if (editingMessageId === messageId) cancelEditingMessage();
      await loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete message.');
    } finally {
      setDeletingMessageId(null);
    }
  }

  async function handleCopyMessage(message: Message) {
    try {
      await navigator.clipboard.writeText(message.body);
      setCopiedMessageId(message.id);
      window.setTimeout(() => {
        setCopiedMessageId((current) => current === message.id ? null : current);
      }, 1600);
    } catch {
      setError('Could not copy message to clipboard.');
    }
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!activeId || (!messageText.trim() && !attachmentFile) || sending) return;

    setSending(true);
    setError('');

    try {
      const attachmentPath = attachmentFile
        ? await uploadDirectMessageAttachment(activeId, attachmentFile)
        : undefined;
      const message = await sendDirectMessage(
        activeId,
        messageText.trim(),
        replyingTo?.id,
        attachmentPath
      );

      setMessages((current) =>
        current.some((item) => item.id === message.id) ? current : [...current, message]
      );
      setLastMessages((current) => ({
        ...current,
        [activeId]: message,
      }));
      setMessageText('');
      setAttachmentFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setReplyingTo(null);

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

  const messageSearchResults = messageSearch.trim()
    ? messages.filter((message) =>
        message.body.toLowerCase().includes(messageSearch.trim().toLowerCase())
      ).slice(-8).reverse()
    : [];

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
            const lastMessage = lastMessages[conversation.id];
            const unreadCount = unreadCounts[conversation.id] ?? 0;

            const preview = lastMessage
              ? `${lastMessage.author_id === userId ? 'You: ' : ''}${lastMessage.body}`
              : 'No messages yet';

            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => {
                  setActiveId(conversation.id);
                  setReplyingTo(null);
                  setMobileChatOpen(true);
                }}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
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

                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {name}
                    </p>
                    <p className="mt-1 truncate text-xs text-ink-500">
                      {preview}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {lastMessage && (
                      <span className="text-[10px] text-ink-500">
                        {formatConversationTime(lastMessage.created_at)}
                      </span>
                    )}

                    {unreadCount > 0 && !selected && (
                      <span className="min-w-5 rounded-full bg-primary-500 px-1.5 py-0.5 text-center text-[10px] font-bold leading-4 text-white">
                        {unreadCount > 99 ? '99+' : unreadCount}
                      </span>
                    )}
                    {selected && (
                      <div className="h-2 w-2 rounded-full bg-primary-400" />
                    )}
                  </div>
                </div>
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
                <p className={`mt-0.5 text-xs ${isOtherTyping ? 'text-primary-300' : 'text-ink-500'}`}>
                  {isOtherTyping ? 'Typing…' : 'Direct message'}
                </p>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPinnedMessages((value) => !value)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs transition ${showPinnedMessages ? 'border-primary-400/40 bg-primary-500/15 text-primary-200' : 'border-white/10 text-ink-400 hover:bg-white/[0.05] hover:text-ink-100'}`}
                  aria-expanded={showPinnedMessages}
                >
                  <Pin size={14} />
                  Pinned
                  {pinnedMessages.length > 0 && <span className="rounded-full bg-primary-500/20 px-1.5 py-0.5 tabular-nums">{pinnedMessages.length}</span>}
                </button>
                <div className="hidden w-44 items-center gap-2 rounded-xl border border-white/10 bg-ink-900 px-3 sm:flex lg:w-52">
                  <Search size={15} className="shrink-0 text-ink-500" />
                  <input
                    value={messageSearch}
                    onChange={(event) => setMessageSearch(event.target.value)}
                    placeholder="Search messages"
                    aria-label="Search messages in this conversation"
                    className="min-w-0 w-full bg-transparent py-2 text-xs text-ink-100 outline-none placeholder:text-ink-500"
                  />
                  {messageSearch && <button type="button" onClick={() => setMessageSearch('')} aria-label="Clear message search" className="text-ink-500 hover:text-ink-200"><X size={14} /></button>}
                </div>
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

            {messageSearch.trim() && (
              <div className="shrink-0 border-b border-white/[0.08] bg-ink-900/70 px-4 py-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Search results · loaded messages</p>
                  <span className="text-xs text-ink-400">{messageSearchResults.length} matches</span>
                </div>
                {messageSearchResults.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {messageSearchResults.map((result) => (
                      <button key={result.id} type="button"
                        onClick={() => messageRefs.current.get(result.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                        className="max-w-full rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-left text-xs text-ink-300 transition hover:border-primary-400/40">
                        <span className="mr-2 text-primary-300">{result.author_id === userId ? 'You' : (profiles[result.author_id]?.display_name || profiles[result.author_id]?.username || displayName)}</span>
                        <span>{result.body.slice(0, 100)}{result.body.length > 100 ? '…' : ''}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-ink-500">No matches in the currently loaded message history.</p>
                )}
              </div>
            )}

            {showPinnedMessages && (
              <section className="shrink-0 border-b border-white/[0.08] bg-ink-900/70 px-4 py-3">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-ink-400">Pinned messages</h4>
                  <button type="button" onClick={() => setShowPinnedMessages(false)} aria-label="Close pinned messages" className="text-ink-500 hover:text-ink-200"><X size={15} /></button>
                </div>
                {pinnedMessages.length === 0 ? (
                  <p className="text-xs text-ink-500">No pinned messages in this conversation.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {pinnedMessages.map((pin) => {
                      const pinnedMessage = messages.find((message) => message.id === pin.message_id);
                      return (
                        <button key={pin.message_id} type="button"
                          onClick={() => messageRefs.current.get(pin.message_id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                          className="max-w-full rounded-lg border border-primary-400/20 bg-primary-500/[0.07] px-3 py-2 text-left text-xs text-ink-300 transition hover:border-primary-400/50">
                          <span className="mr-2 text-primary-300">{pinnedMessage?.author_id === userId ? 'You' : (pinnedMessage ? profiles[pinnedMessage.author_id]?.display_name || profiles[pinnedMessage.author_id]?.username || displayName : 'Pinned')}</span>
                          <span>{pinnedMessage?.body ? pinnedMessage.body.slice(0, 100) : 'Attachment or older message'}{(pinnedMessage?.body.length ?? 0) > 100 ? '…' : ''}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* MESSAGES */}
            <div ref={messagesScrollRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4 sm:p-6">
              {messages.length > 0 && hasMoreMessages && (
                <div className="mb-4 flex justify-center">
                  <button type="button" onClick={handleLoadOlderMessages} disabled={loadingOlderMessages} className="rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-semibold text-ink-300 transition hover:border-primary-400/40 hover:text-primary-200 disabled:cursor-wait disabled:opacity-50">
                    {loadingOlderMessages ? 'Loading older messages…' : 'Load older messages'}
                  </button>
                </div>
              )}

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

              {messages.map((message, index) => {
                const mine = message.author_id === userId;
                const author = profiles[message.author_id];

                const name = mine
                  ? 'You'
                  : author?.display_name ||
                    author?.username ||
                    displayName;

                const date = new Date(message.created_at);
                const previousMessage = messages[index - 1];

                const isNewDay =
                  !previousMessage ||
                  date.toDateString() !==
                    new Date(previousMessage.created_at).toDateString();

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
                  <div
                    key={message.id}
                    ref={(node) => {
                      if (node) messageRefs.current.set(message.id, node);
                      else messageRefs.current.delete(message.id);
                    }}
                    id={`dm-message-${message.id}`}
                  >
                    {isNewDay && (
                      <div className="my-6 flex items-center gap-4">
                        <div className="h-px flex-1 bg-white/[0.08]" />
                        <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-ink-500">
                          {formatMessageDate(message.created_at)}
                        </span>
                        <div className="h-px flex-1 bg-white/[0.08]" />
                      </div>
                    )}

                    <article
                      className={`group relative flex min-w-0 gap-3 rounded-lg px-2 py-1 transition hover:bg-white/[0.035] ${
                        isGrouped ? 'mt-0' : 'mt-3'
                      }`}
                    >
                      <div className="flex w-10 shrink-0 justify-center">
                        {isGrouped ? (
                          <span className="pt-1 text-[9px] text-transparent group-hover:text-ink-500">
                            {date.toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-primary-500/20 text-sm font-bold text-primary-200">
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
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        {!isGrouped && (
                          <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <span className="text-sm font-bold text-ink-100">
                              {name}
                            </span>

                            <time className="text-[11px] text-ink-500">
                              {date.toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </time>
                          </div>
                        )}

                        {message.reply_to_id && (() => {
                          const repliedMessage = messages.find((item) => item.id === message.reply_to_id);
                          const repliedAuthor = repliedMessage ? profiles[repliedMessage.author_id] : undefined;
                          const repliedName = repliedMessage
                            ? repliedMessage.author_id === userId
                              ? 'You'
                              : repliedAuthor?.display_name || repliedAuthor?.username || displayName
                            : 'Original message';
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                const target = messageRefs.current.get(message.reply_to_id!);
                                target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }}
                              disabled={!repliedMessage}
                              className="mb-2 block max-w-full rounded-lg border-l-2 border-primary-400/70 bg-white/[0.04] px-3 py-2 text-left transition hover:bg-white/[0.08] disabled:cursor-default disabled:opacity-60"
                              title={repliedMessage ? 'Jump to original message' : 'Original message is not loaded'}
                            >
                              <span className="block text-[11px] font-semibold text-primary-300">{repliedName}</span>
                              <span className="mt-0.5 block truncate text-xs text-ink-400">{repliedMessage?.body ?? 'Message unavailable'}</span>
                            </button>
                          );
                        })()}
                        {editingMessageId === message.id ? (
                          <div className="mt-2 space-y-2">
                            <textarea
                              value={editingText}
                              onChange={(event) => setEditingText(event.target.value)}
                              maxLength={4000}
                              rows={Math.min(6, Math.max(2, editingText.split('\n').length))}
                              autoFocus
                              className="w-full resize-y rounded-xl border border-primary-400/30 bg-ink-900 px-3 py-2 text-sm leading-6 text-ink-100 outline-none focus:border-primary-400/60"
                              aria-label="Edit message"
                            />
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void handleSaveEdit(message.id)}
                                disabled={!editingText.trim() || savingEdit}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary-400 disabled:opacity-50"
                              >
                                <Check size={14} />
                                {savingEdit ? 'Saving…' : 'Save'}
                              </button>
                              <button
                                type="button"
                                onClick={cancelEditingMessage}
                                disabled={savingEdit}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-ink-300 transition hover:bg-white/[0.06]"
                              >
                                <X size={14} />
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          message.body ? (
                            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-ink-300 sm:text-[15px]">
                              {renderLinkifiedBody(message.body)}
                              {message.updated_at && new Date(message.updated_at).getTime() > new Date(message.created_at).getTime() + 1000 && (
                                <span className="ml-2 text-[10px] text-ink-600">(edited)</span>
                              )}
                            </p>
                          ) : null
                        )}
                        {message.image_url && (
                          <div className="mt-2">
                            {attachmentUrls[message.id] ? (
                              isImageAttachment(message.image_url) ? (
                                <a
                                  href={attachmentUrls[message.id]}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-block max-w-full overflow-hidden rounded-xl border border-white/10 bg-ink-900"
                                >
                                  <img
                                    src={attachmentUrls[message.id]}
                                    alt={attachmentName(message.image_url)}
                                    loading="lazy"
                                    className="max-h-80 max-w-full object-contain"
                                  />
                                </a>
                              ) : (
                                <a
                                  href={attachmentUrls[message.id]}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex max-w-full items-center gap-3 rounded-xl border border-white/10 bg-ink-900 px-3 py-3 text-sm text-ink-200 transition hover:border-primary-400/40 hover:bg-white/[0.04]"
                                >
                                  <FileText size={20} className="shrink-0 text-primary-300" />
                                  <span className="min-w-0 truncate">{attachmentName(message.image_url)}</span>
                                  <span className="shrink-0 text-xs text-primary-300">Open file</span>
                                </a>
                              )
                            ) : (
                              <span className="text-xs text-ink-500">Loading attachment…</span>
                            )}
                          </div>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-1 rounded-lg opacity-100 transition-opacity sm:absolute sm:right-2 sm:top-1 sm:z-20 sm:mt-0 sm:bg-ink-950/95 sm:p-1 sm:shadow-lg sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                          <button
                            type="button"
                            onClick={() => void handleCopyMessage(message)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] bg-ink-900/70 p-0 text-ink-400 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-ink-100"
                            aria-label="Copy message"
                            title="Copy message"
                          >
                            {copiedMessageId === message.id ? <Check size={13} /> : <Copy size={13} />}
                          </button>
                          {mine && editingMessageId !== message.id && (
                            <>
                              <button
                                type="button"
                                onClick={() => startEditingMessage(message)}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] bg-ink-900/70 p-0 text-ink-400 transition hover:border-primary-400/40 hover:bg-primary-500/10 hover:text-primary-200"
                                aria-label="Edit message"
                                title="Edit message"
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteMessage(message.id)}
                                disabled={deletingMessageId === message.id}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-red-400/15 bg-ink-900/70 p-0 text-red-300/80 transition hover:border-red-400/40 hover:bg-red-400/10 hover:text-red-200 disabled:opacity-50"
                                aria-label="Delete message"
                                title="Delete message"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleTogglePinnedMessage(message.id)}
                            disabled={pinningMessageId === message.id}
                            aria-pressed={pinnedMessages.some((item) => item.message_id === message.id)}
                            className={`inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-lg border px-1 text-xs transition disabled:opacity-50 ${pinnedMessages.some((item) => item.message_id === message.id) ? 'border-primary-400/40 bg-primary-500/10 text-primary-200' : 'border-white/[0.08] bg-ink-900/70 text-ink-400 hover:border-white/20 hover:text-ink-100'}`}
                            title={pinnedMessages.some((item) => item.message_id === message.id) ? 'Unpin message' : 'Pin message'}
                          >
                            <Pin size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setReplyingTo(message)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] bg-ink-900/70 p-0 text-ink-400 transition hover:border-primary-400/40 hover:bg-primary-500/10 hover:text-primary-200"
                            aria-label={`Reply to ${name}'s message`}
                            title="Reply"
                          >
                            <Reply size={13} />
                          </button>
                          {QUICK_REACTIONS.map((emoji) => {
                            const emojiReactions = reactions.filter(
                              (reaction) =>
                                reaction.message_id === message.id &&
                                reaction.emoji === emoji
                            );
                            const reactedByMe = emojiReactions.some(
                              (reaction) => reaction.user_id === userId
                            );

                            return (
                              <button
                                key={emoji}
                                type="button"
                                onClick={() => void handleToggleReaction(message.id, emoji)}
                                disabled={reactingMessageIds.includes(message.id)}
                                aria-label={`React with ${emoji}`}
                                aria-pressed={reactedByMe}
                                className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border p-0 text-base transition disabled:opacity-50 ${
                                  reactedByMe
                                    ? 'border-primary-400/50 bg-primary-500/20 text-primary-100'
                                    : 'border-white/[0.08] bg-ink-900/70 text-ink-400 hover:border-white/20 hover:bg-white/[0.06] hover:text-ink-100'
                                }`}
                              >
                                <span>{emoji}</span>
                                {emojiReactions.length > 0 && (
                                  <span className="tabular-nums">{emojiReactions.length}</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                        {mine &&
                          message.id === lastOwnMessage?.id &&
                          latestOwnMessageIsSeen && (
                            <p className="mt-1 text-[10px] font-medium text-primary-300">
                              Seen
                            </p>
                          )}
                      </div>
                    </article>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* MESSAGE INPUT */}
            <form
              onSubmit={handleSend}
              className="shrink-0 border-t border-white/[0.08] bg-ink-950 p-3 sm:p-5"
            >
              {replyingTo && (
                <div className="mb-3 flex items-center gap-3 rounded-xl border border-primary-400/20 bg-primary-500/[0.07] px-3 py-2">
                  <div className="min-w-0 flex-1 border-l-2 border-primary-400 pl-3">
                    <p className="text-xs font-semibold text-primary-300">
                      Replying to {replyingTo.author_id === userId ? 'yourself' : (
                        profiles[replyingTo.author_id]?.display_name ||
                        profiles[replyingTo.author_id]?.username ||
                        displayName
                      )}
                    </p>
                    <p className="truncate text-xs text-ink-400">{replyingTo.body}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReplyingTo(null)}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-400 transition hover:bg-white/[0.08] hover:text-ink-100"
                    aria-label="Cancel reply"
                    title="Cancel reply"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
              {attachmentFile && (
                <div className="mb-3 flex items-center gap-3 rounded-xl border border-primary-400/20 bg-primary-500/[0.06] px-3 py-2">
                  {attachmentFile.type.startsWith('image/') ? (
                    <ImageIcon size={18} className="shrink-0 text-primary-300" />
                  ) : (
                    <FileText size={18} className="shrink-0 text-primary-300" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-ink-200">{attachmentFile.name}</p>
                    <p className="text-[10px] text-ink-500">{(attachmentFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setAttachmentFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ink-400 hover:bg-white/[0.08] hover:text-ink-100"
                    aria-label="Remove attachment"
                  >
                    <X size={15} />
                  </button>
                </div>
              )}
              <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-white/10 bg-ink-900 px-3 py-2 transition focus-within:border-primary-400/50 sm:px-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,text/csv"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    if (!file) return;
                    const allowedTypes = [
                      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
                      'application/pdf', 'text/plain', 'text/csv',
                    ];
                    if (!allowedTypes.includes(file.type)) {
                      setError('Supported files: JPG, PNG, GIF, WEBP, PDF, TXT and CSV.');
                      event.target.value = '';
                      return;
                    }
                    if (file.size > 15 * 1024 * 1024) {
                      setError('Maximum attachment size is 15 MB.');
                      event.target.value = '';
                      return;
                    }
                    setError('');
                    setAttachmentFile(file);
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={sending}
                  title="Attach an image or file (max 15 MB)"
                  aria-label="Attach file"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-400 transition hover:bg-white/[0.06] hover:text-primary-300 disabled:opacity-40"
                >
                  <Paperclip size={20} />
                </button>

                <input
                  value={messageText}
                  onChange={(event) => {
                    const value = event.target.value;
                    setMessageText(value);
                    const channel = typingChannelRef.current;
                    if (!channel) return;

                    const now = Date.now();
                    if (!value.trim()) {
                      void channel.send({
                        type: 'broadcast',
                        event: 'typing',
                        payload: { user_id: userId, is_typing: false },
                      });
                      return;
                    }

                    if (now - lastTypingSentAtRef.current >= 900) {
                      lastTypingSentAtRef.current = now;
                      void channel.send({
                        type: 'broadcast',
                        event: 'typing',
                        payload: { user_id: userId, is_typing: true },
                      });
                    }
                  }}
                  placeholder={`Message ${displayName}`}
                  maxLength={4000}
                  disabled={sending}
                  className="block min-w-0 w-full flex-1 bg-transparent py-3 text-base text-ink-100 outline-none placeholder:text-ink-600"
                />

                <button
                  type="submit"
                  disabled={(!messageText.trim() && !attachmentFile) || sending}
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
Images and files up to 15 MB · JPG, PNG, GIF, WEBP, PDF, TXT, CSV
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
