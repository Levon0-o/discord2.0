# Playlist import setup

The shared-listening importer supports two playlist sources:

1. **Spotify playlists** — each user connects their own Spotify account with Authorization Code + PKCE. Spotify only returns playlist items when the connected user owns the playlist or is a collaborator. Public visibility alone does not grant item access under the February 2026 Web API rules.
2. **Public YouTube playlists** — paste a YouTube playlist URL. The importer reads public playlist items directly through the YouTube Data API, preserving their order. Private playlists and unavailable/deleted videos cannot be imported.

## Spotify app configuration

In the Spotify Developer Dashboard:

1. Enable the Web API.
2. Add this exact Redirect URI (replace the domain if the production Vercel domain changes):
   `https://afterdarkapp.vercel.app/`
3. Copy the Spotify Client ID.

Add this environment variable to the Vercel project and redeploy:

- `VITE_SPOTIFY_CLIENT_ID` — the Spotify Client ID (public identifier; never put a client secret in Vite).

The app requests `playlist-read-private` and `playlist-read-collaborative`. Users must sign in with an account that owns the Spotify playlist or collaborates on it.

## Supabase Edge Function

The only required Supabase function secret is:

- `YOUTUBE_DATA_API_KEY`

Deploy `spotify-playlist-import` from the Supabase Dashboard or with the Supabase CLI. Keep Supabase JWT verification enabled. Spotify access tokens are sent from the authenticated browser session only for Spotify imports. YouTube playlist imports do not require Spotify OAuth.

## Matching, limits and quota

- Spotify imports search YouTube using track title, artist and duration; uncertain matches are skipped.
- YouTube playlist imports add the playlist's available videos directly, in source order.
- Both import paths are capped at 100 items per request.
- YouTube playlist listing uses the YouTube Data API `playlistItems.list` endpoint. Spotify-to-YouTube matching additionally uses YouTube search and video details, which consumes more quota.
- Test with a short playlist first. The importer does not download or copy audio; playback uses YouTube embeds.
