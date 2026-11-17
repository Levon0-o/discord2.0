import { useCallback, useEffect, useMemo, useState } from 'react';
import { ListMusic, Loader2, Music2, Plus, SkipForward, Users, X } from 'lucide-react';
import { MediaEmbed } from '@/components/shared/MediaEmbed';
import { supabase } from '@/lib/supabase';
import {
  addSharedListeningQueueItem,
  fetchSharedListeningQueue,
  fetchSharedListeningRoom,
  getOrCreateSharedListeningRoom,
  removeSharedListeningQueueItem,
  setSharedListeningCurrentItem,
  type SharedListeningProvider,
  type SharedListeningQueueItem,
  type SharedListeningRoom,
  type SharedListeningRoomType,
} from '@/lib/sharedListeningApi';

interface SharedListeningProps {
  roomType: SharedListeningRoomType;
  roomId: string;
  userId: string;
}

function getProvider(urlValue: string): SharedListeningProvider | null {
  try {
    const url = new URL(urlValue.trim());
    if (url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'open.spotify.com') {
      const parts = url.pathname.split('/').filter(Boolean);
      const localized = /^intl(?:-[a-z]{2})?$/i.test(parts[0] ?? '');
      const type = localized ? parts[2] : parts[0];
      const id = localized ? parts[3] : parts[1];
      return ['track', 'album', 'playlist', 'episode', 'show'].includes(type ?? '') && /^[a-zA-Z0-9]{10,64}$/.test(id ?? '') ? 'spotify' : null;
    }
    if (host === 'youtu.be') return /^[a-zA-Z0-9_-]{11}$/.test(url.pathname.split('/').filter(Boolean)[0] ?? '') ? 'youtube' : null;
    if (['youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
      const id = url.pathname === '/watch' ? url.searchParams.get('v') : url.pathname.split('/')[2];
      return /^\/(watch|embed|shorts|live)(\/|$)/.test(url.pathname) && /^[a-zA-Z0-9_-]{11}$/.test(id ?? '') ? 'youtube' : null;
    }
    return null;
  } catch {
    return null;
  }
}

export function SharedListening({ roomType, roomId, userId }: SharedListeningProps) {
  const [expanded, setExpanded] = useState(false);
  const [room, setRoom] = useState<SharedListeningRoom | null>(null);
  const [queue, setQueue] = useState<SharedListeningQueueItem[]>([]);
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refreshQueue = useCallback(async (listeningRoomId: string) => {
    const items = await fetchSharedListeningQueue(listeningRoomId);
    setQueue(items);
  }, []);

  const loadRoom = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const existing = await fetchSharedListeningRoom(roomType, roomId);
      setRoom(existing);
      if (existing) await refreshQueue(existing.id);
      else setQueue([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the shared queue.');
    } finally {
      setLoading(false);
    }
  }, [roomType, roomId, refreshQueue]);

  useEffect(() => {
    void loadRoom();
  }, [loadRoom]);

  useEffect(() => {
    if (!room?.id) return;
    const channel = supabase.channel('shared-listening:' + room.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_listening_rooms', filter: 'id=eq.' + room.id }, (payload) => {
        if (payload.eventType === 'UPDATE') setRoom(payload.new as SharedListeningRoom);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_listening_queue', filter: 'room_id=eq.' + room.id }, () => {
        void refreshQueue(room.id).catch((err) => setError(err instanceof Error ? err.message : 'Could not refresh the queue.'));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [room?.id, refreshQueue]);

  const currentItem = useMemo(
    () => queue.find((item) => item.id === room?.current_item_id) ?? null,
    [queue, room?.current_item_id],
  );

  async function startQueue() {
    setBusy(true);
    setError('');
    try {
      const created = await getOrCreateSharedListeningRoom(roomType, roomId);
      setRoom(created);
      await refreshQueue(created.id);
      setNotice('Shared queue is ready. Add a Spotify or YouTube link.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the shared queue.');
    } finally {
      setBusy(false);
    }
  }

  async function addToQueue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!room || busy) return;
    const trimmed = url.trim();
    const provider = getProvider(trimmed);
    if (!provider) {
      setError('Paste a valid Spotify or YouTube link.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const item = await addSharedListeningQueueItem(room.id, provider, trimmed);
      const nextQueue = [...queue, item];
      setQueue(nextQueue);
      setUrl('');
      if (!room.current_item_id) {
        const updated = await setSharedListeningCurrentItem(room.id, item.id);
        setRoom(updated);
      }
      setNotice('Added to the shared queue.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add this link.');
    } finally {
      setBusy(false);
    }
  }

  async function playNext() {
    if (!room || busy) return;
    const currentIndex = queue.findIndex((item) => item.id === room.current_item_id);
    const next = queue[currentIndex + 1] ?? null;
    setBusy(true);
    setError('');
    try {
      const updated = await setSharedListeningCurrentItem(room.id, next?.id ?? null);
      setRoom(updated);
      setNotice(next ? 'The shared current track was updated.' : 'The queue has finished.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not advance the queue.');
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(item: SharedListeningQueueItem) {
    if (!room || busy) return;
    setBusy(true);
    setError('');
    try {
      await removeSharedListeningQueueItem(item.id);
      const nextQueue = queue.filter((entry) => entry.id !== item.id);
      setQueue(nextQueue);
      if (room.current_item_id === item.id) {
        const updated = await setSharedListeningCurrentItem(room.id, nextQueue[0]?.id ?? null);
        setRoom(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove this item.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="shrink-0 border-b border-white/[0.07] bg-primary-500/[0.025]">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <button type="button" onClick={() => setExpanded((value) => !value)} className="flex min-w-0 items-center gap-2 text-left">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary-400/20 bg-primary-500/10 text-primary-200"><Music2 size={15} /></span>
          <span className="min-w-0"><span className="block text-xs font-semibold text-ink-100">Shared Listening</span><span className="block text-[10px] text-ink-500">{room ? queue.length + ' queued · shared with this chat' : 'Listen through a collaborative queue'}</span></span>
        </button>
        <button type="button" onClick={() => setExpanded((value) => !value)} className="rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-[10px] font-semibold text-ink-300 hover:bg-white/[0.05]">{expanded ? 'Hide' : room ? 'Open queue' : 'Set up'}</button>
      </div>

      {expanded ? <div className="space-y-3 border-t border-white/[0.06] px-4 py-3">
        {loading ? <p className="flex items-center gap-2 text-xs text-ink-500"><Loader2 size={13} className="animate-spin" /> Loading shared queue…</p>
          : !room ? <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-md text-xs text-ink-400">Create one shared queue for everyone with access to this chat.</p><button type="button" onClick={() => void startQueue()} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-500 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-400 disabled:opacity-50"><Users size={13} /> Start shared queue</button></div>
          : <>
            {currentItem ? <div className="rounded-xl border border-primary-400/20 bg-primary-500/[0.06] p-3"><div className="mb-1 flex items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-wider text-primary-200">Shared now playing</span><button type="button" onClick={() => void playNext()} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-white/[0.1] px-2 py-1 text-[10px] text-ink-300 hover:bg-white/[0.06] disabled:opacity-40"><SkipForward size={11} /> Next</button></div><MediaEmbed text={currentItem.external_url} /></div>
              : <p className="rounded-lg border border-dashed border-white/[0.1] px-3 py-4 text-center text-xs text-ink-500">Nothing is selected. Add a link to begin.</p>}
            <form onSubmit={(event) => void addToQueue(event)} className="flex flex-col gap-2 sm:flex-row">
              <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Paste a Spotify or YouTube link…" aria-label="Spotify or YouTube link" className="min-w-0 flex-1 rounded-lg border border-white/[0.09] bg-ink-950 px-3 py-2.5 text-xs text-ink-100 outline-none placeholder:text-ink-600 focus:border-primary-400/40" />
              <button type="submit" disabled={busy || !url.trim()} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary-500 px-3 py-2.5 text-xs font-semibold text-white hover:bg-primary-400 disabled:opacity-40"><Plus size={13} /> Add to queue</button>
            </form>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between"><p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-ink-400"><ListMusic size={12} /> Queue</p><span className="text-[10px] tabular-nums text-ink-600">{queue.length} items</span></div>
              {queue.length === 0 ? <p className="py-2 text-xs text-ink-600">The queue is empty.</p> : queue.map((item, index) => <div key={item.id} className={'flex items-center gap-2 rounded-lg px-2.5 py-2 ' + (item.id === room.current_item_id ? 'bg-primary-500/10' : 'bg-white/[0.025]')}><span className="w-5 shrink-0 text-center text-[10px] tabular-nums text-ink-600">{index + 1}</span><span className="min-w-0 flex-1 truncate text-[11px] text-ink-300">{item.provider === 'spotify' ? 'Spotify' : 'YouTube'} · {item.external_url}</span>{item.id === room.current_item_id ? <span className="shrink-0 text-[9px] font-semibold text-primary-200">NOW</span> : null}<button type="button" onClick={() => void removeItem(item)} disabled={busy} aria-label="Remove from shared queue" className="shrink-0 rounded p-1 text-ink-600 hover:bg-white/[0.06] hover:text-red-300 disabled:opacity-40"><X size={12} /></button></div>)}
            </div>
            <p className="text-[10px] leading-relaxed text-ink-600">The queue and selected item sync live across chat members. Each person starts the embedded player locally; synchronized playback position and automatic play/pause are not supported by these provider embeds.</p>
          </>}
        {error ? <p role="alert" className="text-[11px] text-red-300">{error}</p> : null}
        {notice ? <p role="status" className="text-[11px] text-emerald-300">{notice}</p> : null}
      </div> : null}
    </section>
  );
}
