import { useEffect, useId, useRef, useState } from 'react';
import { ExternalLink, Music2, Play, Volume2, Youtube } from 'lucide-react';

type MediaTarget =
  | { provider: 'youtube'; title: string; sourceUrl: string; embedUrl: string; videoId: string }
  | { provider: 'spotify'; title: string; sourceUrl: string; embedUrl: string; tall: boolean };

interface YouTubePlayer {
  destroy: () => void;
  setVolume: (volume: number) => void;
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
      events?: { onReady?: (event: YouTubePlayerEvent) => void };
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
        const type = hasLocalePrefix ? parts[2] : parts[0];
        const id = hasLocalePrefix ? parts[3] : parts[1];
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

export function MediaEmbed({ text }: { text: string }) {
  const [loaded, setLoaded] = useState(false);
  const [volume, setVolume] = useState(70);
  const [playerError, setPlayerError] = useState('');
  const target = findMediaTarget(text);
  const playerHostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const volumeRef = useRef(volume);
  const playerId = useId().replace(/:/g, '');
  const isYouTube = target?.provider === 'youtube';
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
          controls: 1,
          playsinline: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: (event) => event.target.setVolume(volumeRef.current),
        },
      });
    }).catch((error: unknown) => {
      if (!cancelled) setPlayerError(error instanceof Error ? error.message : 'Could not load the YouTube player.');
    });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [loaded, target?.provider, target?.provider === 'youtube' ? target.videoId : null]);

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
