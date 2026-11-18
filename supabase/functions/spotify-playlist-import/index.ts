import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type SpotifyTrack = { name: string; artists: Array<{ name: string }>; duration_ms: number };
type Match = { videoId: string; title: string; channelTitle: string; durationSeconds: number; score: number };

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function spotifyPlaylistId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "open.spotify.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const localized = /^intl(?:-[a-z]{2})?$/i.test(parts[0] ?? "");
    const type = localized ? parts[1] : parts[0];
    const id = localized ? parts[2] : parts[1];
    return type === "playlist" && /^[A-Za-z0-9]{10,64}$/.test(id ?? "") ? id : null;
  } catch {
    return null;
  }
}

function youtubePlaylistId(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.protocol !== "https:" || !["youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) return null;
    if (url.pathname !== "/playlist") return null;
    const id = url.searchParams.get("list") ?? "";
    return /^[A-Za-z0-9_-]{10,100}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

async function youtubeApiError(response: Response, context: "playlist" | "search" | "details"): Promise<string> {
  let reason = "";
  try {
    const payload = await response.json();
    reason = payload.error?.errors?.[0]?.reason ?? payload.error?.status ?? "";
  } catch {
    // Ignore a non-JSON API error response and use the status-based fallback.
  }
  if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
    return "YouTube API daily quota is exhausted. Try again after the quota resets or increase the project's YouTube Data API quota.";
  }
  if (reason === "playlistNotFound" || response.status === 404) {
    return "YouTube could not find this playlist. Check that the link is correct and the playlist is public.";
  }
  if (reason === "playlistItemsNotAccessible" || response.status === 403 && context === "playlist") {
    return "YouTube cannot read this playlist. Check that it is public and that the API key has YouTube Data API v3 enabled.";
  }
  if (context === "search") return "YouTube track search failed. Check the API key and its quota.";
  if (context === "details") return "YouTube could not verify the matched video details.";
  return "Could not read this YouTube playlist. Check that it is public and that the API key has YouTube Data API v3 enabled.";
}

function normalize(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(official|video|audio|lyrics?|hd|4k|visualizer|topic)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

function scoreMatch(track: SpotifyTrack, title: string, channel: string, durationSeconds: number): number {
  const expectedTitle = normalize(track.name);
  const expectedArtist = normalize(track.artists.map((artist) => artist.name).join(" "));
  const candidate = normalize(title);
  const channelName = normalize(channel);
  const titleHit = candidate.includes(expectedTitle) || expectedTitle.includes(candidate);
  const artistHit = candidate.includes(expectedArtist) || channelName.includes(expectedArtist);
  const durationDelta = Math.abs(durationSeconds - track.duration_ms / 1000);
  let score = (titleHit ? 0.58 : 0.15) + (artistHit ? 0.32 : 0) + (durationDelta <= 4 ? 0.1 : durationDelta <= 12 ? 0.05 : 0);
  if (/live|cover|karaoke|sped up|slowed|remix/.test(normalize(title)) && !/live|cover|karaoke|sped up|slowed|remix/.test(normalize(track.name))) score -= 0.2;
  return Math.max(0, Math.min(1, score));
}

async function fetchSpotifyTracks(playlistId: string, accessToken: string): Promise<{ tracks: SpotifyTrack[]; truncated: boolean; playlistTotal: number }> {
  const tracks: SpotifyTrack[] = [];
  let offset = 0;
  let truncated = false;
  let playlistTotal = 0;
  // Each Spotify track can trigger a YouTube search.list request (100 quota units).
  // Read at most the first 50 playlist entries to keep one import bounded.
  while (offset < 50) {
    const response = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/items?limit=${Math.min(50, 50 - offset)}&offset=${offset}`, {
      headers: { Authorization: "Bearer " + accessToken },
    });
    if (response.status === 401) throw new Error("Your Spotify session expired. Connect Spotify again.");
    if (response.status === 403) throw new Error("Spotify only exposes playlist tracks to the owner or a collaborator. For someone else's public playlist, paste its YouTube playlist link instead.");
    if (response.status === 404) throw new Error("Spotify could not find this playlist, or it is not accessible to the connected account.");
    if (!response.ok) {
      const details = await response.text();
      throw new Error("Could not read Spotify playlist (" + response.status + "): " + details.slice(0, 180));
    }
    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];
    playlistTotal = Number.isFinite(Number(data.total)) ? Number(data.total) : playlistTotal;
    for (const entry of items) {
      const raw = entry.item ?? entry.track;
      if (!raw || raw.type !== "track" || !raw.name || !Array.isArray(raw.artists)) continue;
      tracks.push({ name: raw.name, artists: raw.artists, duration_ms: raw.duration_ms ?? 0 });
    }
    truncated = Boolean(data.next);
    if (!data.next || items.length === 0) break;
    offset += items.length;
  }
  return { tracks, truncated, playlistTotal };
}

async function fetchYouTubePlaylistVideos(playlistId: string, apiKey: string): Promise<{ videos: Array<{ videoId: string; title: string; channelTitle: string }>; truncated: boolean }> {
  const videos: Array<{ videoId: string; title: string; channelTitle: string }> = [];
  let pageToken = "";
  let scannedEntries = 0;
  while (scannedEntries < 100) {
    const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    url.searchParams.set("part", "snippet,contentDetails");
    url.searchParams.set("playlistId", playlistId);
    url.searchParams.set("maxResults", String(Math.min(50, 100 - scannedEntries)));
    url.searchParams.set("key", apiKey);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url);
    if (!response.ok) throw new Error(await youtubeApiError(response, "playlist"));
    const data = await response.json();
    const entries = Array.isArray(data.items) ? data.items : [];
    scannedEntries += entries.length;
    for (const entry of entries) {
      const videoId = entry.contentDetails?.videoId ?? entry.snippet?.resourceId?.videoId;
      const title = entry.snippet?.title ?? "";
      const channelTitle = entry.snippet?.videoOwnerChannelTitle ?? entry.snippet?.channelTitle ?? "";
      if (videoId && title && title !== "Deleted video" && title !== "Private video") {
        videos.push({ videoId, title, channelTitle });
      }
    }
    pageToken = data.nextPageToken ?? "";
    if (!pageToken || entries.length === 0) break;
  }
  return { videos, truncated: Boolean(pageToken) };
}

async function findYouTubeMatch(track: SpotifyTrack, apiKey: string): Promise<Match | null> {
  const artist = track.artists.map((item) => item.name).join(" ");
  const query = encodeURIComponent(`${artist} ${track.name} official audio`);
  const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&maxResults=5&q=${query}&key=${apiKey}`);
  if (!response.ok) throw new Error(await youtubeApiError(response, "search"));
  const data = await response.json();
  const candidates = (data.items ?? []).map((item: Record<string, any>) => ({
    videoId: item.id?.videoId as string,
    title: item.snippet?.title as string,
    channelTitle: item.snippet?.channelTitle as string,
  })).filter((item: { videoId: string; title: string }) => item.videoId && item.title);
  if (!candidates.length) return null;
  const detailsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
  detailsUrl.searchParams.set("part", "contentDetails");
  detailsUrl.searchParams.set("id", candidates.map((item: { videoId: string }) => item.videoId).join(","));
  detailsUrl.searchParams.set("key", apiKey);
  const detailsResponse = await fetch(detailsUrl);
  if (!detailsResponse.ok) throw new Error(await youtubeApiError(detailsResponse, "details"));
  const details = await detailsResponse.json();
  const durations = new Map<string, number>((details.items ?? []).map((item: Record<string, any>) => [item.id, parseIsoDuration(item.contentDetails?.duration ?? "")]));
  const ranked = candidates.map((candidate: { videoId: string; title: string; channelTitle: string }) => {
    const durationSeconds = durations.get(candidate.videoId) ?? 0;
    return { ...candidate, durationSeconds, score: scoreMatch(track, candidate.title, candidate.channelTitle, durationSeconds) };
  }).sort((a: Match, b: Match) => b.score - a.score);
  return ranked[0] ?? null;
}

function parseIsoDuration(value: string): number {
  const match = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  return match ? Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0) : 0;
}

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const youtubeApiKey = Deno.env.get("YOUTUBE_DATA_API_KEY");
    if (!youtubeApiKey) return json({ error: "Server setup required: configure YOUTUBE_DATA_API_KEY in Supabase Edge Function secrets." }, 503);

    const body = await request.json();
    const url = String(body.url ?? "");
    const ytPlaylistId = youtubePlaylistId(url);
    if (ytPlaylistId) {
      const playlist = await fetchYouTubePlaylistVideos(ytPlaylistId, youtubeApiKey);
      if (!playlist.videos.length) return json({ error: "No playable public videos were found in this YouTube playlist." }, 422);
      const tracks = playlist.videos.map((video, index) => ({
        originalTitle: video.title,
        artist: video.channelTitle,
        order: index,
        match: {
          title: video.title,
          videoId: video.videoId,
          url: "https://www.youtube.com/watch?v=" + video.videoId,
          score: 1,
        },
      }));
      return json({ source: "youtube", playlistId: ytPlaylistId, total: tracks.length, matched: tracks.length, truncated: playlist.truncated, tracks });
    }

    const spotifyId = spotifyPlaylistId(url);
    const spotifyAccessToken = String(body.spotifyAccessToken ?? "");
    if (!spotifyId) return json({ error: "Paste a valid Spotify playlist link or a public YouTube playlist link." }, 400);
    if (!spotifyAccessToken || spotifyAccessToken.length > 4096) return json({ error: "Connect your Spotify account before importing this playlist." }, 401);

    const playlist = await fetchSpotifyTracks(spotifyId, spotifyAccessToken);
    const tracks = playlist.tracks;
    if (!tracks.length) return json({ error: "No playable tracks were found. Make sure this playlist contains tracks and that you own it or collaborate on it." }, 422);

    const results = [];
    for (const [index, track] of tracks.entries()) {
      const match = await findYouTubeMatch(track, youtubeApiKey);
      results.push({
        originalTitle: track.name,
        artist: track.artists.map((item) => item.name).join(", "),
        durationMs: track.duration_ms,
        order: index,
        match: match && match.score >= 0.72 ? {
          title: match.title,
          videoId: match.videoId,
          url: "https://www.youtube.com/watch?v=" + match.videoId,
          score: match.score,
          durationSeconds: match.durationSeconds,
        } : null,
      });
    }
    return json({ source: "spotify", playlistId: spotifyId, total: tracks.length, playlistTotal: playlist.playlistTotal, matched: results.filter((item) => item.match).length, truncated: playlist.truncated, tracks: results });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Playlist import failed." }, 500);
  }
});
