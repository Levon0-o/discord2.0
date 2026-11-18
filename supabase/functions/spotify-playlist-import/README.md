# Spotify playlist import setup

The importer uses Spotify Authorization Code with PKCE. Each user connects their own Spotify account; the app does not store a Spotify client secret. Spotify playlist items are only available for playlists the connected user owns or collaborates on under the February 2026 Web API rules.

## Spotify app configuration

In the Spotify Developer Dashboard:

1. Enable the Web API.
2. Add this exact Redirect URI (replace the domain if the production Vercel domain changes):
   `https://afterdarkapp.vercel.app/`
3. Copy the Spotify Client ID.

Add the following environment variable to the Vercel project and redeploy:

- `VITE_SPOTIFY_CLIENT_ID` — the Spotify app Client ID (public identifier; never put a client secret in Vite).

The app uses the scopes `playlist-read-private` and `playlist-read-collaborative`. Users must sign in with an account that owns the playlist or is a collaborator.

## Supabase Edge Function

Only the YouTube key is required as a Supabase function secret:

- `YOUTUBE_DATA_API_KEY`

Deploy `spotify-playlist-import` from the Supabase Dashboard or with the Supabase CLI. Keep Supabase JWT verification enabled. The function receives a short-lived Spotify access token from the authenticated browser session and uses it only to read playlist items.

## Matching and quota

The importer preserves Spotify playlist order and imports only YouTube matches scoring at least 0.72 based on title, artist, and duration. Uncertain matches are skipped. YouTube Data API search costs quota per track; the importer currently caps playlists at 100 tracks. Test with a short playlist first.
