import { useState } from 'react';
import { ExternalLink, Music2, Play, Youtube } from 'lucide-react';

type MediaTarget =
  | { provider: 'youtube'; title: string; sourceUrl: string; embedUrl: string }
  | { provider: 'spotify'; title: string; sourceUrl: string; embedUrl: string; tall: boolean };

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
  const target = findMediaTarget(text);
  if (!target) return null;

  const isSpotify = target.provider === 'spotify';
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
        <iframe
          title={target.title}
          src={target.embedUrl}
          width="100%"
          height={height ?? 240}
          loading="lazy"
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          className={isSpotify ? 'block w-full border-0' : 'block aspect-video w-full border-0'}
        />
      ) : (
        <button type="button" onClick={() => setLoaded(true)} className="flex w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-white/[0.035]">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-500/15 text-primary-200"><Play size={17} fill="currentColor" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-ink-100">Load embedded player</span>
            <span className="mt-0.5 block text-[10px] text-ink-500">External media loads only after you choose to play it.</span>
          </span>
        </button>
      )}
    </section>
  );
}
