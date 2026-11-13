import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent } from 'react';
import { AlertTriangle, Bookmark, Check, Download, FileText, Flag, MessageCircle, Paperclip, Pencil, Pin, Reply, Search, Send, Smile, Trash2, X } from 'lucide-react';

import { supabase } from '@/lib/supabase';
import { deleteServerEventChatMessage, editServerEventChatMessage, fetchServerEventChatMessages, fetchServerEventChatPins, fetchServerEventChatReactions, fetchServerEventChatReadReceipts, fetchServerEventChatSavedMessages, getServerEventChatAttachmentUrl, markServerEventChatRead, removeServerEventChatAttachment, searchServerEventChatMessages, sendServerEventChatMessage, setServerEventChatPin, toggleServerEventChatReaction, toggleServerEventChatSavedMessage, uploadServerEventChatAttachment, fetchServerEventChatReports, submitServerEventChatReport, reviewServerEventChatReport, type ServerEventChatMessage, type ServerEventChatPin, type ServerEventChatReaction, type ServerEventChatReadReceipt, type ServerEventChatSavedMessage, type ServerEventChatReport, type ServerEventChatReportReason } from '@/lib/serverEventChatApi';
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
  const [readReceipts, setReadReceipts] = useState<ServerEventChatReadReceipt[]>([]);
  const [pins, setPins] = useState<ServerEventChatPin[]>([]);
  const [savedMessages, setSavedMessages] = useState<ServerEventChatSavedMessage[]>([]);
  const [savedOpen, setSavedOpen] = useState(false);
  const [reports, setReports] = useState<ServerEventChatReport[]>([]);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [reportingMessage, setReportingMessage] = useState<ServerEventChatMessage | null>(null);
  const [reportReason, setReportReason] = useState<ServerEventChatReportReason>('spam');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ServerEventChatMessage[]>([]);
  const [searching, setSearching] = useState(false);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const [body, setBody] = useState('');
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const draftStorageKey = 'afterdark:event-chat-draft:' + userId + ':' + eventId;
  const [draftLoadedKey, setDraftLoadedKey] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedFilePreview, setSelectedFilePreview] = useState<string | null>(null);
  const [attachmentUrls, setAttachmentUrls] = useState<Record<string, string | null>>({});
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragDepthRef = useRef(0);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [replyingTo, setReplyingTo] = useState<ServerEventChatMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messageListRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollHeightRef = useRef<number | null>(null);
  const skipAutoScrollRef = useRef(false);
  const pendingJumpIdRef = useRef<string | null>(null);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastTypingBroadcastRef = useRef(0);
  const lastReadAtRef = useRef('');

  useEffect(() => {
    try {
      setBody(window.localStorage.getItem(draftStorageKey) ?? '');
    } catch {
      setBody('');
    }
    setDraftLoadedKey(draftStorageKey);
  }, [draftStorageKey]);

  useEffect(() => {
    if (draftLoadedKey !== draftStorageKey) return;
    try {
      if (body) window.localStorage.setItem(draftStorageKey, body);
      else window.localStorage.removeItem(draftStorageKey);
    } catch {
      // Draft persistence is best-effort when storage is unavailable.
    }
  }, [body, draftLoadedKey, draftStorageKey]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [page, reactionRows, receiptRows, savedRows, pinRows, reportRows] = await Promise.all([fetchServerEventChatMessages(eventId), fetchServerEventChatReactions(eventId), fetchServerEventChatReadReceipts(eventId), fetchServerEventChatSavedMessages(eventId), fetchServerEventChatPins(eventId), fetchServerEventChatReports(eventId)]);
        const ownReceipt = await markServerEventChatRead(eventId);
        if (active) { setMessages(page.messages); setHasMore(page.hasMore); setReactions(reactionRows); setPins(pinRows); setSavedMessages(savedRows); setReports(reportRows); setReadReceipts([...receiptRows.filter((row) => row.user_id !== userId), ownReceipt]); lastReadAtRef.current = ownReceipt.last_read_at; }
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
        table: 'server_event_chat_reads',
        filter: 'event_id=eq.' + eventId,
      }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const incoming = payload.new as ServerEventChatReadReceipt;
          setReadReceipts((current) => [...current.filter((row) => row.user_id !== incoming.user_id), incoming]);
        } else if (payload.eventType === 'DELETE') {
          const removed = payload.old as { user_id?: string };
          if (removed.user_id) setReadReceipts((current) => current.filter((row) => row.user_id !== removed.user_id));
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
  }, [eventId, userId]);

  async function updateReadReceiptIfNeeded() {
    const list = messageListRef.current;
    if (!list || list.scrollHeight - list.scrollTop - list.clientHeight > 48) return;
    const latest = messages[messages.length - 1];
    if (!latest || latest.created_at <= lastReadAtRef.current) return;
    const timestamp = new Date().toISOString();
    lastReadAtRef.current = timestamp;
    try {
      const receipt = await markServerEventChatRead(eventId);
      lastReadAtRef.current = receipt.last_read_at;
      setReadReceipts((current) => [...current.filter((row) => row.user_id !== userId), receipt]);
    } catch {
      lastReadAtRef.current = '';
    }
  }

  useEffect(() => {
    if (!selectedFile?.type.startsWith('image/')) {
      setSelectedFilePreview(null);
      return;
    }
    const previewUrl = URL.createObjectURL(selectedFile);
    setSelectedFilePreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [selectedFile]);

  useEffect(() => {
    let active = true;
    const attachments = messages.filter((message) => message.attachment_path && !(message.id in attachmentUrls));
    void Promise.all(attachments.map(async (message) => {
      try { return [message.id, await getServerEventChatAttachmentUrl(message.attachment_path!)] as const; }
      catch { return [message.id, null] as const; }
    })).then((entries) => { if (active) setAttachmentUrls((current) => ({ ...current, ...Object.fromEntries(entries) })); });
    return () => { active = false; };
  }, [messages, attachmentUrls]);
  useEffect(() => {
    const channel = supabase.channel('server-event-chat-typing:' + eventId, { config: { private: true } });
    typingChannelRef.current = channel;
    channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
      const senderId = typeof payload?.user_id === 'string' ? payload.user_id : '';
      if (!senderId || senderId === userId) return;
      setTypingUserIds((current) => current.includes(senderId) ? current : [...current, senderId]);
      const existing = typingTimeoutsRef.current[senderId];
      if (existing) clearTimeout(existing);
      typingTimeoutsRef.current[senderId] = setTimeout(() => {
        setTypingUserIds((current) => current.filter((id) => id !== senderId));
        delete typingTimeoutsRef.current[senderId];
      }, 2200);
    }).subscribe();
    return () => {
      typingChannelRef.current = null;
      Object.values(typingTimeoutsRef.current).forEach(clearTimeout);
      typingTimeoutsRef.current = {};
      setTypingUserIds([]);
      void supabase.removeChannel(channel);
    };
  }, [eventId, userId]);

  function insertComposerEmoji(emoji: string) {
    const input = composerRef.current;
    if (!input) { handleBodyChange(body + emoji); return; }
    const start = input.selectionStart ?? body.length;
    const end = input.selectionEnd ?? start;
    const next = body.slice(0, start) + emoji + body.slice(end);
    handleBodyChange(next);
    requestAnimationFrame(() => {
      input.focus();
      const cursor = start + emoji.length;
      input.setSelectionRange(cursor, cursor);
    });
    setEmojiPickerOpen(false);
  }

  function handleBodyChange(value: string, cursorPosition?: number) {
    setBody(value);
    const cursor = cursorPosition ?? composerRef.current?.selectionStart ?? value.length;
    const beforeCursor = value.slice(0, cursor);
    const atIndex = beforeCursor.lastIndexOf('@');
    const token = atIndex >= 0 ? beforeCursor.slice(atIndex + 1) : '';
    const validMentionContext = atIndex >= 0 && (atIndex === 0 || !/[a-zA-Z0-9_]/.test(beforeCursor[atIndex - 1])) && /^[a-zA-Z0-9_]{0,32}$/.test(token) && !/\s/.test(token);
    setMentionQuery(validMentionContext ? token.toLowerCase() : null);
    setMentionStart(validMentionContext ? atIndex : null);
    const now = Date.now();
    if (!userId || !typingChannelRef.current || now - lastTypingBroadcastRef.current < 1000) return;
    lastTypingBroadcastRef.current = now;
    void typingChannelRef.current.send({
      type: 'broadcast',
      event: 'typing',
      payload: { user_id: userId },
    });
  }

  useLayoutEffect(() => {
    if (pendingJumpIdRef.current) {
      const target = document.getElementById('event-chat-message-' + pendingJumpIdRef.current);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        pendingJumpIdRef.current = null;
      }
    }
    const list = messageListRef.current;
    if (list && pendingScrollHeightRef.current !== null) {
      list.scrollTop += list.scrollHeight - pendingScrollHeightRef.current;
      pendingScrollHeightRef.current = null;
    }
  }, [messages]);

  useEffect(() => {
    if (skipAutoScrollRef.current) {
      skipAutoScrollRef.current = false;
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  async function handleLoadOlder() {
    const oldest = messages[0];
    const list = messageListRef.current;
    if (!oldest || !list || loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    setError('');
    pendingScrollHeightRef.current = list.scrollHeight;
    skipAutoScrollRef.current = true;
    try {
      const page = await fetchServerEventChatMessages(eventId, oldest.created_at);
      setMessages((current) => {
        const known = new Set(current.map((message) => message.id));
        return [...page.messages.filter((message) => !known.has(message.id)), ...current];
      });
      setHasMore(page.hasMore);
    } catch (err) {
      pendingScrollHeightRef.current = null;
      skipAutoScrollRef.current = false;
      setError(err instanceof Error ? err.message : 'Could not load older messages.');
    } finally {
      setLoadingOlder(false);
    }
  }

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (searchQuery.trim().length < 2 || searching) return;
    setSearching(true);
    setError('');
    try {
      setSearchResults(await searchServerEventChatMessages(eventId, searchQuery));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not search event chat.');
    } finally {
      setSearching(false);
    }
  }

  function jumpToSearchResult(message: ServerEventChatMessage) {
    pendingJumpIdRef.current = message.id;
    setMessages((current) => {
      const merged = current.some((item) => item.id === message.id) ? current : [...current, message];
      return merged.sort((left, right) => left.created_at.localeCompare(right.created_at));
    });
    setSearchOpen(false);
    setSearchResults([]);
  }

  function selectAttachment(file?: File) {
    if (!file) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain', 'text/csv'];
    if (!allowedTypes.includes(file.type)) {
      setError('Supported files: JPG, PNG, GIF, WEBP, PDF, TXT and CSV.');
      return;
    }
    if (file.size <= 0 || file.size > 15 * 1024 * 1024) {
      setError('Attachments must be smaller than 15 MB.');
      return;
    }
    setError('');
    setSelectedFile(file);
  }

  function handleComposerPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const pastedFile = Array.from(event.clipboardData.items)
      .find((item) => item.kind === 'file' && item.type.startsWith('image/'))
      ?.getAsFile();
    if (!pastedFile) return;
    event.preventDefault();
    const extension = pastedFile.type === 'image/jpeg' ? 'jpg' : pastedFile.type.split('/')[1] || 'png';
    const namedFile = new File([pastedFile], pastedFile.name || `pasted-image.${extension}`, { type: pastedFile.type });
    selectAttachment(namedFile);
  }

  function handleFileDragEnter(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepthRef.current += 1;
    if (event.dataTransfer.types.includes('Files')) setIsDraggingFile(true);
  }

  function handleFileDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    if (event.dataTransfer.types.includes('Files')) event.dataTransfer.dropEffect = 'copy';
  }

  function handleFileDragLeave(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDraggingFile(false);
  }

  function handleFileDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingFile(false);
    selectAttachment(event.dataTransfer.files?.[0]);
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if ((!body.trim() && !selectedFile) || sending) return;
    setSending(true);
    setError('');
    try {
      let uploadedPath: string | undefined;
      if (selectedFile) uploadedPath = await uploadServerEventChatAttachment(eventId, selectedFile);
      try {
        const created = await sendServerEventChatMessage(eventId, body, replyingTo?.id, uploadedPath);
        setMessages((current) => current.some((message) => message.id === created.id) ? current : [...current, created]);
        setBody('');
        try { window.localStorage.removeItem(draftStorageKey); } catch { /* Ignore unavailable storage. */ }
        setSelectedFile(null); setFileInputKey((value) => value + 1); setReplyingTo(null); setMentionQuery(null); setMentionStart(null);
      } catch (sendError) {
        if (uploadedPath) await removeServerEventChatAttachment(uploadedPath).catch(() => undefined);
        throw sendError;
      }
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

  async function handleSaveMessage(message: ServerEventChatMessage) {
    const isSaved = savedMessages.some((saved) => saved.message_id === message.id);
    setError('');
    try {
      await toggleServerEventChatSavedMessage(eventId, message.id, !isSaved);
      const rows = await fetchServerEventChatSavedMessages(eventId);
      setSavedMessages(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update saved messages.');
    }
  }

  async function handleSubmitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reportingMessage || reportSubmitting) return;
    setReportSubmitting(true);
    setError('');
    try {
      await submitServerEventChatReport(reportingMessage, reportReason, reportDetails);
      setReports(await fetchServerEventChatReports(eventId));
      setReportingMessage(null);
      setReportDetails('');
      setReportReason('spam');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit report.');
    } finally {
      setReportSubmitting(false);
    }
  }

  function exportLoadedMessages() {
    if (messages.length === 0) {
      setError('There are no loaded messages to export.');
      return;
    }
    const lines = [
      eventTitle + ' — Event Chat',
      'Exported: ' + new Date().toLocaleString(),
      'Messages included: ' + messages.length,
      'Note: this export contains the messages currently loaded in the chat.',
      '',
      ...messages.map((message) => {
        const author = members.find((entry) => entry.user_id === message.author_id);
        const name = author?.profile?.display_name || author?.profile?.username || 'Server member';
        const timestamp = new Date(message.created_at).toLocaleString();
        const attachment = message.attachment_path ? '\\n[Attachment: ' + message.attachment_path.split('/').pop() + ']' : '';
        return '[' + timestamp + '] ' + name + ':\\n' + (message.body || '[Attachment-only message]') + attachment;
      }),
    ];
    const blob = new Blob([lines.join('\\n\\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeTitle = eventTitle.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'event-chat';
    link.href = url;
    link.download = safeTitle + '-chat-export.txt';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function handleReviewReport(reportId: string, status: 'resolved' | 'dismissed') {
    setError('');
    try {
      await reviewServerEventChatReport(reportId, status);
      setReports(await fetchServerEventChatReports(eventId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update report.');
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
  const mentionSuggestions = mentionQuery === null ? [] : members
    .filter((entry) => entry.user_id !== userId && entry.profile?.username && entry.profile.username.toLowerCase().startsWith(mentionQuery))
    .slice(0, 6);

  function insertMention(username: string) {
    if (mentionStart === null) return;
    const input = composerRef.current;
    const cursor = input?.selectionStart ?? body.length;
    let tokenEnd = cursor;
    while (tokenEnd < body.length && /[a-zA-Z0-9_]/.test(body[tokenEnd])) tokenEnd += 1;
    const mention = '@' + username + ' ';
    const next = body.slice(0, mentionStart) + mention + body.slice(tokenEnd);
    const nextCursor = mentionStart + mention.length;
    setBody(next);
    setMentionQuery(null);
    setMentionStart(null);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(nextCursor, nextCursor);
    });
  }

  return (
    <section
      className="relative overflow-hidden rounded-xl border border-primary-400/20 bg-ink-900/80"
      onDragEnter={handleFileDragEnter}
      onDragOver={handleFileDragOver}
      onDragLeave={handleFileDragLeave}
      onDrop={handleFileDrop}
    >
      {isDraggingFile ? <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-primary-300 bg-ink-950/90"><div className="rounded-xl border border-primary-300/30 bg-primary-500/10 px-5 py-4 text-center"><Paperclip size={22} className="mx-auto mb-2 text-primary-200" /><p className="text-sm font-semibold text-primary-100">Drop file to attach</p><p className="mt-1 text-[10px] text-ink-400">JPG, PNG, GIF, WEBP, PDF, TXT or CSV · max 15 MB</p></div></div> : null}
      <div className="flex items-center justify-between border-b border-white/[0.07] px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <MessageCircle size={15} className="shrink-0 text-primary-300" />
          <div className="min-w-0"><p className="text-xs font-semibold text-ink-100">Event chat</p><p className="truncate text-[10px] text-ink-500">{eventTitle}</p></div>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={exportLoadedMessages} disabled={messages.length === 0} className="rounded-md p-1.5 text-ink-400 transition hover:bg-white/[0.06] hover:text-ink-100 disabled:cursor-not-allowed disabled:opacity-30" aria-label="Export loaded messages" title="Export loaded messages"><Download size={13} /></button>
          <button type="button" onClick={() => { setSearchOpen((value) => !value); setPinnedOpen(false); }} className={'rounded-md p-1.5 transition ' + (searchOpen ? 'bg-primary-500/15 text-primary-200' : 'text-ink-400 hover:bg-white/[0.06] hover:text-ink-100')} aria-label="Search event chat" aria-expanded={searchOpen}><Search size={13} /></button>
          <button type="button" onClick={() => { setSavedOpen((value) => !value); setPinnedOpen(false); setSearchOpen(false); }} className={'inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] transition ' + (savedOpen ? 'bg-primary-500/15 text-primary-200' : 'text-ink-400 hover:bg-white/[0.06] hover:text-ink-100')} aria-expanded={savedOpen}><Bookmark size={12} /> Saved {savedMessages.length}</button>
          <button type="button" onClick={() => { setPinnedOpen((value) => !value); setSavedOpen(false); setSearchOpen(false); }} className={'inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] transition ' + (pinnedOpen ? 'bg-primary-500/15 text-primary-200' : 'text-ink-400 hover:bg-white/[0.06] hover:text-ink-100')} aria-expanded={pinnedOpen}><Pin size={12} /> Pinned {pins.length}</button>
          {canModerate ? <button type="button" onClick={() => { setReportsOpen((value) => !value); setPinnedOpen(false); setSavedOpen(false); setSearchOpen(false); }} className={'inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] transition ' + (reportsOpen ? 'bg-amber-500/15 text-amber-200' : 'text-ink-400 hover:bg-white/[0.06] hover:text-ink-100')} aria-expanded={reportsOpen}><Flag size={12} /> Reports {reports.filter((report) => report.status === 'open').length}</button> : null}
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-ink-500 hover:bg-white/[0.06] hover:text-ink-100" aria-label="Close event chat"><X size={14} /></button>
        </div>
      </div>
      {searchOpen ? (
        <div className="border-b border-white/[0.07] bg-white/[0.02] p-3">
          <form onSubmit={(event) => void handleSearch(event)} className="flex gap-2">
            <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} minLength={2} maxLength={100} placeholder="Search event messages…" className="min-w-0 flex-1 rounded-md border border-white/10 bg-ink-950 px-2.5 py-2 text-xs text-ink-100 outline-none placeholder:text-ink-600 focus:border-primary-400/50" />
            <button type="submit" disabled={searching || searchQuery.trim().length < 2} className="rounded-md bg-primary-500/15 px-3 py-2 text-[10px] font-semibold text-primary-200 hover:bg-primary-500/25 disabled:opacity-40">{searching ? 'Searching…' : 'Search'}</button>
          </form>
          {searchResults.length > 0 ? <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">{searchResults.map((result) => {
            const author = members.find((entry) => entry.user_id === result.author_id);
            const name = author?.profile?.display_name || author?.profile?.username || 'Server member';
            return <button key={result.id} type="button" onClick={() => jumpToSearchResult(result)} className="block w-full rounded-md bg-white/[0.03] px-2.5 py-2 text-left hover:bg-white/[0.07]"><span className="block text-[10px] font-semibold text-ink-300">{name} · {new Date(result.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span><span className="block truncate text-[10px] text-ink-500">{result.body}</span></button>;
          })}</div> : searchQuery.trim().length >= 2 && !searching ? <p className="mt-2 text-[10px] text-ink-500">No matching messages. Run a search to see results.</p> : null}
        </div>
      ) : null}
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
      {reportsOpen && canModerate ? (
        <div className="border-b border-white/[0.07] bg-amber-500/[0.04] p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200"><Flag size={11} /> Message reports</p>
          {reports.length === 0 ? <p className="text-[10px] text-ink-500">No reports submitted for this event.</p> : <div className="max-h-52 space-y-2 overflow-y-auto">
            {reports.map((report) => <div key={report.id} className="rounded-md border border-white/[0.07] bg-white/[0.03] p-2.5">
              <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-semibold text-ink-200">{report.reason.replace(/_/g, ' ')}</span><span className={'text-[9px] uppercase ' + (report.status === 'open' ? 'text-amber-300' : 'text-ink-500')}>{report.status}</span></div>
              <p className="mt-1 whitespace-pre-wrap break-words text-[10px] text-ink-400">{report.message_body || 'Attachment-only message'}</p>
              {report.details ? <p className="mt-1 text-[10px] text-ink-500">Details: {report.details}</p> : null}
              <p className="mt-1 text-[9px] text-ink-600">Reported {new Date(report.created_at).toLocaleString()}</p>
              {report.status === 'open' ? <div className="mt-2 flex gap-1.5"><button type="button" onClick={() => void handleReviewReport(report.id, 'resolved')} className="rounded bg-emerald-500/10 px-2 py-1 text-[9px] text-emerald-200 hover:bg-emerald-500/20">Resolve</button><button type="button" onClick={() => void handleReviewReport(report.id, 'dismissed')} className="rounded bg-white/[0.06] px-2 py-1 text-[9px] text-ink-400 hover:bg-white/[0.1]">Dismiss</button></div> : null}
            </div>)}
          </div>}
        </div>
      ) : null}
      {savedOpen ? (
        <div className="border-b border-white/[0.07] bg-primary-500/[0.04] p-3">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary-200"><Bookmark size={11} /> Your saved messages</p>
          {savedMessages.length === 0 ? <p className="text-[10px] text-ink-500">No saved messages yet. Bookmark a message to keep it here.</p> : <div className="space-y-1.5">
            {savedMessages.map((saved) => {
              const message = messages.find((item) => item.id === saved.message_id);
              const author = members.find((entry) => entry.user_id === saved.author_id);
              const name = author?.profile?.display_name || author?.profile?.username || 'Server member';
              return <div key={saved.message_id} className="flex items-start gap-2 rounded-md bg-white/[0.03] px-2.5 py-2">
                <button type="button" onClick={() => { if (message) document.getElementById('event-chat-message-' + message.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} className="min-w-0 flex-1 text-left hover:text-primary-200"><span className="block text-[10px] font-semibold text-ink-300">{name}</span><span className="block truncate text-[10px] text-ink-500">{message?.body || (saved.body || 'Attachment')}</span></button>
                <button type="button" onClick={() => void handleSaveMessage({ id: saved.message_id } as ServerEventChatMessage)} className="rounded p-1 text-primary-300 hover:bg-white/[0.07]" aria-label="Remove saved message"><Bookmark size={12} /></button>
              </div>;
            })}
          </div>}
        </div>
      ) : null}
      <div ref={messageListRef} onScroll={() => void updateReadReceiptIfNeeded()} className="max-h-64 min-h-32 space-y-3 overflow-y-auto p-3">
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
                    {message.body ? <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-5 text-ink-300">{message.body.split(/(@[a-zA-Z0-9_]+)/g).map((part, index) => part.startsWith('@') ? <span key={index} className="font-semibold text-primary-200">{part}</span> : part)}</p> : null}
                    {message.attachment_path ? (() => { const fileName = message.attachment_path.split('/').pop()?.replace(/^[0-9a-f-]{36}-/i, '') || 'Attachment'; const url = attachmentUrls[message.id]; const isImage = /\.(jpe?g|png|gif|webp)$/i.test(fileName); return url ? (isImage ? <a href={url} target="_blank" rel="noreferrer" className="mt-2 block max-w-full"><img src={url} alt={fileName} className="max-h-48 max-w-full rounded-lg border border-white/10 object-contain" /></a> : <a href={url} target="_blank" rel="noreferrer" className="mt-2 flex max-w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-[10px] text-primary-200 hover:bg-white/[0.06]"><FileText size={14} className="shrink-0" /><span className="truncate">{fileName}</span><span className="ml-auto shrink-0 text-ink-500">Open</span></a>) : attachmentUrls[message.id] === null ? <p className="mt-2 text-[10px] text-red-300">Attachment unavailable</p> : <p className="mt-2 text-[10px] text-ink-500">Loading attachment…</p>; })() : null}
                    {message.edited_at ? <span className="ml-1 text-[9px] text-ink-600">(edited)</span> : null}
                  </>
                )}
                {own && editingId !== message.id ? <button type="button" onClick={() => startEditing(message)} className="mt-1 mr-2 inline-flex items-center gap-1 text-[10px] text-ink-500 transition hover:text-primary-300"><Pencil size={10} /> Edit</button> : null}
                {!own ? <button type="button" onClick={() => { setReportingMessage(message); setReportReason('spam'); setReportDetails(''); }} className="mt-1 mr-2 inline-flex items-center gap-1 text-[10px] text-ink-500 transition hover:text-amber-300" aria-label="Report message"><Flag size={10} /> Report</button> : null}
                <button type="button" onClick={() => void handleSaveMessage(message)} className={'mt-1 mr-2 inline-flex items-center gap-1 text-[10px] transition ' + (savedMessages.some((saved) => saved.message_id === message.id) ? 'text-primary-300' : 'text-ink-500 hover:text-primary-300')} aria-label={savedMessages.some((saved) => saved.message_id === message.id) ? 'Remove saved message' : 'Save message'}><Bookmark size={10} /> {savedMessages.some((saved) => saved.message_id === message.id) ? 'Saved' : 'Save'}</button>
                <button
                  type="button"
                  onClick={() => setReplyingTo(message)}
                  className="mt-1 inline-flex items-center gap-1 text-[10px] text-ink-500 transition hover:text-primary-300"
                >
                  <Reply size={11} /> Reply
                </button>
                {own && messages.filter((item) => item.author_id === userId).slice(-1)[0]?.id === message.id ? (() => {
                  const seenCount = readReceipts.filter((receipt) => receipt.user_id !== userId && receipt.last_read_at >= message.created_at).length;
                  return seenCount > 0 ? <p className="mt-1 text-[9px] text-ink-600">Seen by {seenCount} {seenCount === 1 ? 'attendee' : 'attendees'}</p> : null;
                })() : null}
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
      {typingUserIds.length > 0 ? <p className="border-t border-white/[0.05] px-3 py-1.5 text-[10px] text-primary-300">{typingUserIds.map((id) => members.find((entry) => entry.user_id === id)?.profile?.display_name || members.find((entry) => entry.user_id === id)?.profile?.username || 'Someone').slice(0, 3).join(', ')} {typingUserIds.length === 1 ? 'is' : 'are'} typing…</p> : null}
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
      {reportingMessage ? <div className="absolute inset-0 z-30 flex items-center justify-center bg-ink-950/85 p-4">
        <form onSubmit={(event) => void handleSubmitReport(event)} className="w-full max-w-sm space-y-3 rounded-xl border border-white/10 bg-ink-900 p-4 shadow-2xl">
          <div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-xs font-semibold text-ink-100"><AlertTriangle size={14} className="text-amber-300" /> Report message</h3><button type="button" onClick={() => setReportingMessage(null)} className="rounded p-1 text-ink-500 hover:bg-white/[0.06]" aria-label="Close report dialog"><X size={13} /></button></div>
          <p className="line-clamp-3 rounded-md bg-white/[0.04] p-2 text-[10px] text-ink-400">{reportingMessage.body || 'Attachment-only message'}</p>
          <label className="block text-[10px] text-ink-400">Reason<select value={reportReason} onChange={(event) => setReportReason(event.target.value as ServerEventChatReportReason)} className="mt-1 w-full rounded-md border border-white/10 bg-ink-950 px-2.5 py-2 text-xs text-ink-100"><option value="spam">Spam</option><option value="harassment">Harassment or bullying</option><option value="hate_or_discrimination">Hate or discrimination</option><option value="inappropriate_content">Inappropriate content</option><option value="threats">Threats</option><option value="other">Other</option></select></label>
          <label className="block text-[10px] text-ink-400">Additional details (optional)<textarea value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={500} rows={3} placeholder="Add context for moderators…" className="mt-1 w-full rounded-md border border-white/10 bg-ink-950 px-2.5 py-2 text-xs text-ink-100 outline-none placeholder:text-ink-600 focus:border-primary-400/50" /></label>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setReportingMessage(null)} className="rounded-md px-3 py-2 text-[10px] text-ink-400 hover:bg-white/[0.06]">Cancel</button><button type="submit" disabled={reportSubmitting} className="rounded-md bg-amber-500/15 px-3 py-2 text-[10px] font-semibold text-amber-200 hover:bg-amber-500/25 disabled:opacity-50">{reportSubmitting ? 'Submitting…' : 'Submit report'}</button></div>
        </form>
      </div> : null}
      <form onSubmit={(event) => void handleSend(event)} className="flex items-end gap-2 border-t border-white/[0.07] p-2.5">
        <input key={fileInputKey} ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,text/plain,text/csv" className="hidden" onChange={(event) => selectAttachment(event.target.files?.[0])} />
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={sending} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 text-ink-400 transition hover:border-primary-400/40 hover:text-primary-200 disabled:opacity-40" aria-label="Attach file"><Paperclip size={14} /></button>
        <div className="min-w-0 flex-1">{selectedFile ? <div className="mb-2 flex items-center gap-2 rounded-md border border-white/[0.07] bg-white/[0.02] p-2">{selectedFilePreview ? <img src={selectedFilePreview} alt="Attachment preview" className="h-10 w-10 shrink-0 rounded object-cover" /> : <FileText size={16} className="shrink-0 text-primary-300" />}<div className="min-w-0 flex-1"><p className="truncate text-[10px] text-ink-200">{selectedFile.name}</p><p className="text-[9px] text-ink-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p></div><button type="button" onClick={() => { setSelectedFile(null); setFileInputKey((value) => value + 1); }} className="shrink-0 rounded p-1 text-ink-500 hover:bg-white/[0.06] hover:text-ink-100" aria-label="Remove attachment"><X size={12} /></button></div> : null}<div className="mb-1 flex items-center gap-1"><button type="button" onClick={() => setEmojiPickerOpen((value) => !value)} className={'rounded-md p-1.5 transition ' + (emojiPickerOpen ? 'bg-primary-500/15 text-primary-200' : 'text-ink-500 hover:bg-white/[0.06] hover:text-ink-200')} aria-label="Insert emoji" aria-expanded={emojiPickerOpen}><Smile size={14} /></button>{emojiPickerOpen ? <div className="flex flex-wrap gap-1 rounded-lg border border-white/10 bg-ink-950 p-2">{['😀','😃','😄','😁','😆','😂','🤣','😊','😍','🥳','😎','🤔','😭','😮','😴','👍','👎','❤️','🔥','🎉','👏','🙏','💀','🚀'].map((emoji) => <button key={emoji} type="button" onClick={() => insertComposerEmoji(emoji)} className="rounded p-1 text-base hover:bg-white/[0.08]" aria-label={'Insert ' + emoji}>{emoji}</button>)}</div> : null}</div>{mentionQuery !== null && mentionSuggestions.length > 0 ? <div className="mb-2 max-h-36 overflow-y-auto rounded-lg border border-white/10 bg-ink-950 p-1">{canModerate && 'everyone'.startsWith(mentionQuery) ? <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertMention('everyone')} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-primary-500/10"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-500/15 text-[10px] text-primary-200">@</span><span><span className="block text-[10px] text-ink-200">Everyone</span><span className="block text-[9px] text-ink-500">Notify all event attendees</span></span></button> : null}{mentionSuggestions.map((entry) => { const username = entry.profile?.username || ''; const name = entry.profile?.display_name || username; return <button key={entry.user_id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertMention(username)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-primary-500/10"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.07] text-[10px] text-ink-300">{name.slice(0, 1).toUpperCase()}</span><span className="min-w-0"><span className="block truncate text-[10px] text-ink-200">{name}</span><span className="block text-[9px] text-ink-500">@{username}</span></span></button>; })}</div> : null}<textarea ref={composerRef} value={body} onChange={(event) => handleBodyChange(event.target.value, event.target.selectionStart)} onPaste={handleComposerPaste} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} maxLength={2000} rows={2} placeholder="Message event attendees…" className="max-h-24 min-h-10 w-full resize-y rounded-lg border border-white/10 bg-ink-950 px-3 py-2 text-xs text-ink-100 outline-none placeholder:text-ink-600 focus:border-primary-400/50" /></div>
        <button type="submit" disabled={sending || (!body.trim() && !selectedFile)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-500 text-white transition hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send event message"><Send size={14} /></button>
      </form>
    </section>
  );
}
