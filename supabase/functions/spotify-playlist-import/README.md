# Spotify playlist import setup

The `spotify-playlist-import` Edge Function reads a public Spotify playlist, searches YouTube for candidate videos, and returns high-confidence matches. It does not download or proxy audio.

## Required secrets

Create a Spotify developer app and enable the Spotify Web API. Create a YouTube Data API key with YouTube Data API v3 enabled. Add these secrets to the Supabase project:

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `YOUTUBE_DATA_API_KEY`

Do not put these credentials in Vite environment variables or browser code.

## Deploy

From the repository root, with Supabase CLI installed and linked/authenticated:

```sh
supabase secrets set --project-ref kufacavtpaxkrcesegoe SPOTIFY_CLIENT_ID=your_client_id SPOTIFY_CLIENT_SECRET=your_client_secret YOUTUBE_DATA_API_KEY=your_youtube_api_key
supabase functions deploy spotify-playlist-import --project-ref kufacavtpaxkrcesegoe
```

The function uses the caller's Supabase JWT; keep JWT verification enabled.

## Matching and quota

The importer preserves Spotify playlist order and imports only matches scoring at least 0.72 based on title, artist, and duration. Uncertain tracks are skipped rather than silently substituted. YouTube Data API search costs quota per track; the importer currently caps playlists at 100 tracks. Start with smaller playlists while validating API quota and match quality.

Spotify may deny access to some playlists depending on API access policy, playlist visibility, or app permissions. The UI reports those errors rather than pretending the import succeeded.
