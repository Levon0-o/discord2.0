import { useEffect, useId, useRef, useState } from 'react';
import { ExternalLink, Music2, Pause, Play, Volume2, Youtube } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type MediaTarget =
  | { provider: 'youtube'; title: string; sourceUrl: string; embedUrl: string; videoId: string }
  | { provider: 'spotify'; title: string; sourceUrl: string; embedUrl: string; tall: boolean };

interface YouTubePlayer {
  destroy: () => void;
  setVolume: (volume: number) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
}

interface YouTubePlayerEvent {
  target: YouTubePlayer;
}

interface YouTubeApi {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      playerVars?: Record<string, string | number>;
      events?: { onReady?: (event: YouTubePlayerEvent) => void; onStateChange?: (event: { data: number }) => void };
    },
  ) => YouTubePlayer;
}

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let youtubeApiPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = () => {
      youtubeApiPromise = null;
      reject(new Error('Could not load the YouTube player.'));
    };
    window.onYouTubeIframeAPIReady = () => resolve();
    document.head.appendChild(script);
  });

  return youtubeApiPromise;
}

function findMediaTarget(text: string): MediaTarget | null {
  const matches = text.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  for (const raw of matches) {
    const clean = raw.replace(/[),.!?;:]+$/, '');
    try {
      const url = new URL(clean);
      const host = url.hostname.toLowerCase().replace(/^www\./, '');
      if (host === 'youtu.be' || host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
        let videoId = '';
        if (host === 'youtu.be') videoId = url.pathname.split('/').filter(Boolean)[0] ?? '';
        else if (url.pathname === '/watch') videoId = url.searchParams.get('v') ?? '';
        else if (/^\/(embed|shorts|live)\//.test(url.pathname)) videoId = url.pathname.split('/')[2] ?? '';
        if (/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
          return {
            provider: 'youtube',
            title: 'YouTube video',
            sourceUrl: clean,
            embedUrl: 'https://www.youtube-nocookie.com/embed/' + videoId,
            videoId,
          };
        }
      }
      if (host === 'open.spotify.com') {
        const parts = url.pathname.split('/').filter(Boolean);
        const hasLocalePrefix = /^intl(?:-[a-z]{2})?$/i.test(parts[0] ?? '');
        const type = hasLocalePrefix ? parts[1] : parts[0];
        const id = hasLocalePrefix ? parts[2] : parts[1];
        if (['track', 'album', 'playlist', 'episode', 'show'].includes(type ?? '') && /^[a-zA-Z0-9]{10,64}$/.test(id ?? '')) {
          return {
            provider: 'spotify',
            title: 'Spotify ' + type,
            sourceUrl: clean,
            embedUrl: 'https://open.spotify.com/embed/' + type + '/' + id,
            tall: type === 'playlist' || type === 'album' || type === 'show',
          };
        }
      }
    } catch {
      // Ignore malformed or unsupported links.
    }
  }
  return null;
}

export function MediaEmbed({ text, syncRoomId, canControl = false }: { text: string; syncRoomId?: string; canControl?: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [volume, setVolume] = useState(70);
  const [playerError, setPlayerError] = useState('');
  const target = findMediaTarget(text);
  const playerHostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const syncChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [playing, setPlaying] = useState(false);
  const [syncReady, setSyncReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [syncRetry, setSyncRetry] = useState(0);
  const playerReadyRef = useRef(false);
  const channelReadyRef = useRef(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const volumeRef = useRef(volume);
  const playerId = useId().replace(/:/g, '');
  const isSpotify = target?.provider === 'spotify';

  useEffect(() => {
    volumeRef.current = volume;
    playerRef.current?.setVolume(volume);
  }, [volume]);

  useEffect(() => {
    if (!loaded || !target || target.provider !== 'youtube' || !playerHostRef.current) return;
    let cancelled = false;

    void loadYouTubeApi().then(() => {
      if (cancelled || !playerHostRef.current || !window.YT?.Player) return;
      playerRef.current = new window.YT.Player(playerHostRef.current, {
        videoId: target.videoId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => {
            event.target.setVolume(volumeRef.current);
            playerReadyRef.current = true;
            if (!syncRoomId || channelReadyRef.current) setSyncReady(true);
            if (syncRoomId) window.setTimeout(() => {
              const player = playerRef.current;
              const channel = syncChannelRef.current;
              if (!player || !channel) return;
              if (canControl) void channel.send({ type: 'broadcast', event: 'command', payload: { action: player.getPlayerState() === 1 ? 'play' : 'pause', time: player.getCurrentTime(), sentAt: Date.now() } });
              else void channel.send({ type: 'broadcast', event: 'sync-request', payload: {} });
            }, 300);
          },
          onStateChange: (event) => setPlaying(event.data === 1),
        },
      });
    }).catch((error: unknown) => {
      if (!cancelled) setPlayerError(error instanceof Error ? error.message : 'Could not load the YouTube player.');
    });

    return () => {
      cancelled = true;
      playerReadyRef.current = false;
      setSyncReady(false);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [loaded, target?.provider, target?.provider === 'youtube' ? target.videoId : null]);

  useEffect(() => {
    if (!loaded || !syncRoomId || !target || target.provider !== 'youtube') return;
    channelReadyRef.current = false;
    setSyncReady(false);
    setSyncStatus('connecting');
    const channel = supabase.channel('shared-media:' + syncRoomId + ':' + target.videoId, { config: { broadcast: { self: false } } });
    syncChannelRef.current = channel;
    channel.on('broadcast', { event: 'command' }, ({ payload }) => {
      const player = playerRef.current;
      if (!player) return;
      const elapsed = Math.max(0, (Date.now() - Number(payload.sentAt ?? Date.now())) / 1000);
      if (typeof payload.time === 'number') player.seekTo(payload.time + (payload.action === 'play' ? elapsed : 0), true);
      if (payload.action === 'play') player.playVideo();
      if (payload.action === 'pause') player.pauseVideo();
      if (payload.action === 'seek') player.seekTo(Number(payload.time) || 0, true);
      if (payload.action === 'sync') {
        const targetTime = Number(payload.time) + elapsed;
        if (player.getPlayerState() !== 1) player.playVideo();
        if (Math.abs(player.getCurrentTime() - targetTime) > 1.25) player.seekTo(targetTime, true);
      }
    }).on('broadcast', { event: 'sync-request' }, () => {
      if (!canControl || !playerRef.current) return;
      const player = playerRef.current;
      void channel.send({ type: 'broadcast', event: 'command', payload: { action: player.getPlayerState() === 1 ? 'play' : 'pause', time: player.getCurrentTime(), sentAt: Date.now(), sender: 'leader' } });
    }).subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channelReadyRef.current = true;
        setSyncStatus('connected');
        if (playerReadyRef.current) setSyncReady(true);
        void channel.send({ type: 'broadcast', event: 'sync-request', payload: {} });
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        channelReadyRef.current = false;
        setSyncReady(false);
        setSyncStatus('error');
      }
    });
    const heartbeat = canControl ? window.setInterval(() => {
      const player = playerRef.current;
      if (player?.getPlayerState() === 1) void channel.send({ type: 'broadcast', event: 'command', payload: { action: 'sync', time: player.getCurrentTime(), sentAt: Date.now() } });
    }, 2500) : null;
    return () => {
      if (heartbeat !== null) window.clearInterval(heartbeat);
      channelReadyRef.current = false;
      setSyncReady(false);
      syncChannelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [loaded, syncRoomId, target?.provider, target?.provider === 'youtube' ? target.videoId : null, canControl, syncRetry]);

  function enableSyncedAudio() {
    const player = playerRef.current;
    const channel = syncChannelRef.current;
    if (!player || !channel) return;
    player.playVideo();
    setAudioEnabled(true);
    window.setTimeout(() => {
      player.pauseVideo();
      void channel.send({ type: 'broadcast', event: 'sync-request', payload: {} });
    }, 250);
  }
  function sendPlaybackCommand(action: 'play' | 'pause' | 'seek', time?: number) {
    if (!canControl || !playerRef.current || !syncChannelRef.current) return;
    const currentTime = typeof time === 'number' ? time : playerRef.current.getCurrentTime();
    if (action === 'play') playerRef.current.playVideo();
    if (action === 'pause') playerRef.current.pauseVideo();
    if (action === 'seek') playerRef.current.seekTo(currentTime, true);
    void syncChannelRef.current.send({ type: 'broadcast', event: 'command', payload: { action, time: currentTime, sentAt: Date.now(), sender: 'leader' } });
  }
  if (!target) return null;

  const height = isSpotify && target.tall ? 352 : isSpotify ? 152 : undefined;

  return (
    <section className="mt-3 max-w-xl overflow-hidden rounded-xl border border-white/[0.09] bg-ink-950/80">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
        {isSpotify ? <Music2 size={14} className="text-emerald-300" /> : <Youtube size={15} className="text-red-300" />}
        <span className="text-[10px] font-semibold text-ink-300">{target.title}</span>
        <a href={target.sourceUrl} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-[10px] text-ink-500 transition hover:text-primary-200">
          Open link <ExternalLink size={10} />
        </a>
      </div>
      {loaded ? (
        isSpotify ? (
          <iframe
            title={target.title}
            src={target.embedUrl}
            width="100%"
            height={height}
            loading="lazy"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            className="block w-full border-0"
          />
        ) : (
          <div>
            <div ref={playerHostRef} id={playerId} className="aspect-video w-full" />
            {playerError ? <p role="alert" className="px-3 py-2 text-[10px] text-red-300">{playerError}</p> : null}
            {syncRoomId ? <div className="flex items-center gap-2 border-t border-white/[0.06] px-3 py-2">
              {canControl ? <><button type="button" disabled={!syncReady} onClick={() => sendPlaybackCommand(playing ? "pause" : "play")} className="rounded-md bg-primary-500 px-3 py-1.5 text-[10px] font-semibold text-white disabled:opacity-40">{playing ? <Pause size={12} className="inline" /> : <Play size={12} className="inline" />} {playing ? "Pause for everyone" : "Play for everyone"}</button><button type="button" disabled={!syncReady} onClick={() => sendPlaybackCommand("seek", Math.max(0, (playerRef.current?.getCurrentTime() ?? 0) - 10))} className="rounded-md border border-white/10 px-2 py-1.5 text-[10px] text-ink-300 disabled:opacity-40">−10s</button><button type="button" disabled={!syncReady} onClick={() => sendPlaybackCommand("seek", (playerRef.current?.getCurrentTime() ?? 0) + 10)} className="rounded-md border border-white/10 px-2 py-1.5 text-[10px] text-ink-300 disabled:opacity-40">+10s</button></> : <><button type="button" onClick={enableSyncedAudio} disabled={!syncReady || audioEnabled} className="rounded-md border border-white/10 px-3 py-1.5 text-[10px] text-ink-300 disabled:opacity-50">{audioEnabled ? "Audio enabled" : "Enable synced audio"}</button><span className="text-[10px] text-ink-500">{syncReady ? "Connected · waiting for host" : syncStatus === 'error' ? 'Connection failed' : 'Connecting shared player…'}</span>{syncStatus === 'error' ? <button type="button" onClick={() => setSyncRetry((value) => value + 1)} className="rounded-md border border-red-400/20 px-2 py-1 text-[10px] text-red-200 hover:bg-red-500/10">Retry</button> : null}</>}
            </div> : null}
            {syncRoomId && syncStatus === 'error' && canControl ? <div className="flex items-center justify-between border-t border-red-400/10 px-3 py-2"><span className="text-[10px] text-red-300">Shared playback connection failed.</span><button type="button" onClick={() => setSyncRetry((value) => value + 1)} className="rounded-md border border-red-400/20 px-2 py-1 text-[10px] text-red-200 hover:bg-red-500/10">Retry connection</button></div> : null}
            <div className="flex items-center gap-3 border-t border-white/[0.06] px-3 py-2.5">
              <Volume2 size={14} className="shrink-0 text-ink-400" />
              <input
                aria-label="Music volume"
                type="range"
                min="0"
                max="100"
                step="1"
                value={volume}
                onChange={(event) => setVolume(Number(event.target.value))}
                className="h-1.5 min-w-0 flex-1 cursor-pointer accent-primary-400"
              />
              <span className="w-9 text-right text-[10px] tabular-nums text-ink-400">{volume}%</span>
            </div>
          </div>
        )
      ) : (
        <button type="button" onClick={() => setLoaded(true)} className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-white/[0.035]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-500/15 text-primary-200"><Play size={17} fill="currentColor" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-ink-100">Load embedded player</span>
            <span className="mt-0.5 block text-[10px] text-ink-500">External media loads only after you choose to play it.</span>
          </span>
        </button>
      )}
      {loaded && isSpotify ? <p className="border-t border-white/[0.06] px-3 py-2 text-[10px] text-ink-500">Adjust Spotify volume in the Spotify player. Spotify embeds do not expose a volume slider to AFTERDARK.</p> : null}
    </section>
  );
}
