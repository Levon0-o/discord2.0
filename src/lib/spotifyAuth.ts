const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID?.trim();
const REDIRECT_URI = `${window.location.origin}/`;
const TOKEN_KEY = 'afterdark_spotify_token';
const VERIFIER_KEY = 'afterdark_spotify_pkce_verifier';
const STATE_KEY = 'afterdark_spotify_oauth_state';
const RETURN_KEY = 'afterdark_spotify_return_to';
const STATUS_KEY = 'afterdark_spotify_auth_status';

interface SpotifyToken {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomToken(size: number): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function createChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

function readToken(): SpotifyToken | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    return raw ? JSON.parse(raw) as SpotifyToken : null;
  } catch {
    return null;
  }
}

function saveToken(payload: { access_token: string; expires_in: number; refresh_token?: string }, previous?: SpotifyToken | null) {
  const token: SpotifyToken = {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token ?? previous?.refresh_token,
    expires_at: Date.now() + payload.expires_in * 1000,
  };
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));
}

export function hasSpotifySession(): boolean {
  const token = readToken();
  return Boolean(token && (token.expires_at > Date.now() || token.refresh_token));
}

export async function beginSpotifyAuthorization(): Promise<void> {
  if (!CLIENT_ID) {
    throw new Error('Spotify is not configured yet. Add VITE_SPOTIFY_CLIENT_ID to the Vercel environment variables.');
  }

  const verifier = randomToken(64);
  const state = randomToken(24);
  const challenge = await createChallenge(verifier);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(RETURN_KEY, window.location.href);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: 'playlist-read-private playlist-read-collaborative user-read-private',
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  });
  window.location.assign(`https://accounts.spotify.com/authorize?${params.toString()}`);
}

export async function getSpotifyAccessToken(): Promise<string | null> {
  if (!CLIENT_ID) throw new Error('Spotify is not configured. Add VITE_SPOTIFY_CLIENT_ID to Vercel.');
  const current = readToken();
  if (!current) return null;
  if (current.expires_at > Date.now() + 60_000) return current.access_token;
  if (!current.refresh_token) {
    sessionStorage.removeItem(TOKEN_KEY);
    return null;
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: current.refresh_token,
    client_id: CLIENT_ID,
  });
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) {
    sessionStorage.removeItem(TOKEN_KEY);
    return null;
  }
  const payload = await response.json();
  saveToken(payload, current);
  return payload.access_token as string;
}

export async function handleSpotifyOAuthRedirect(): Promise<string | null> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const oauthError = params.get('error');
  if (!code && !oauthError) return null;

  const returnTo = sessionStorage.getItem(RETURN_KEY);
  try {
    if (oauthError) throw new Error(`Spotify authorization was cancelled: ${oauthError}`);
    if (!CLIENT_ID) throw new Error('Spotify is not configured. Add VITE_SPOTIFY_CLIENT_ID to Vercel.');
    const expectedState = sessionStorage.getItem(STATE_KEY);
    const receivedState = params.get('state');
    const verifier = sessionStorage.getItem(VERIFIER_KEY);
    if (!expectedState || !receivedState || expectedState !== receivedState || !verifier) {
      throw new Error('Spotify authorization could not be verified. Please connect Spotify again.');
    }

    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code: code!,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    });
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error_description || payload.error || 'Spotify token exchange failed.');
    saveToken(payload);
    sessionStorage.setItem(STATUS_KEY, JSON.stringify({ success: true }));
  } catch (error) {
    sessionStorage.setItem(STATUS_KEY, JSON.stringify({
      error: error instanceof Error ? error.message : 'Spotify connection failed.',
    }));
  } finally {
    sessionStorage.removeItem(VERIFIER_KEY);
    sessionStorage.removeItem(STATE_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
  }
  return returnTo;
}

export function consumeSpotifyAuthStatus(): { success?: boolean; error?: string } | null {
  const raw = sessionStorage.getItem(STATUS_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(STATUS_KEY);
  try {
    return JSON.parse(raw) as { success?: boolean; error?: string };
  } catch {
    return null;
  }
}
