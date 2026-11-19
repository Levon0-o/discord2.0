import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, Plus, Search, Server, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { CreateServerModal } from '@/components/servers/CreateServerModal';
import { ServerCard } from '@/components/servers/ServerCard';
import { ServerDetail } from '@/components/servers/ServerDetail';
import { previewServerInvitation, redeemServerInvitation, type ServerInvitationPreview } from '@/lib/serverInvitationsApi';
import {
  createServer,
  fetchMyServers,
  fetchPublicServers,
  joinPublicServer,
  fetchServerById,
} from '@/lib/serversApi';
import type { CreateServerInput, ServerWithMeta } from '@/types/servers';

type View =
  | { mode: 'list' }
  | { mode: 'detail'; server: ServerWithMeta };

export function ServersSection() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? '';

  const [view, setView] = useState<View>({ mode: 'list' });
  const [myServers, setMyServers] = useState<ServerWithMeta[]>([]);
  const [publicServers, setPublicServers] = useState<ServerWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState('');
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [redeemingInvite, setRedeemingInvite] = useState(false);
  const [invitePreview, setInvitePreview] = useState<ServerInvitationPreview | null>(null);
  const [invitePreviewLoading, setInvitePreviewLoading] = useState(false);
  const [invitePreviewError, setInvitePreviewError] = useState('');

  const activeServerStorageKey = 'afterdark:active-server:' + userId;
  const storeActiveServer = (serverId: string | null) => {
    try {
      if (serverId) window.sessionStorage.setItem(activeServerStorageKey, serverId);
      else window.sessionStorage.removeItem(activeServerStorageKey);
    } catch {
      // Session storage is best-effort; server navigation still works in memory.
    }
  };

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError('');
    try {
      const [mine, discovery] = await Promise.all([
        fetchMyServers(userId),
        fetchPublicServers(userId),
      ]);
      setMyServers(mine);
      setPublicServers(discovery);
      try {
        const storedServerId = window.sessionStorage.getItem(activeServerStorageKey);
        const storedServer = storedServerId ? mine.find((server) => server.id === storedServerId) : undefined;
        if (storedServer?.my_role) setView({ mode: 'detail', server: storedServer });
        else if (storedServerId) window.sessionStorage.removeItem(activeServerStorageKey);
      } catch {
        // Ignore unavailable session storage.
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load servers.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('invite');
    if (code) setInviteCode(code);
  }, []);

  useEffect(() => {
    let active = true;
    const code = inviteCode.trim();
    if (!code) {
      setInvitePreview(null);
      setInvitePreviewError('');
      return;
    }
    setInvitePreviewLoading(true);
    setInvitePreviewError('');
    void previewServerInvitation(code)
      .then((preview) => {
        if (active) setInvitePreview(preview);
      })
      .catch((err) => {
        if (active) setInvitePreviewError(err instanceof Error ? err.message : 'Could not load this invitation.');
      })
      .finally(() => {
        if (active) setInvitePreviewLoading(false);
      });
    return () => { active = false; };
  }, [inviteCode]);

  const query = search.trim().toLowerCase();

  const filteredMine = useMemo(() => {
    if (!query) return myServers;
    return myServers.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        s.description.toLowerCase().includes(query),
    );
  }, [myServers, query]);

  const filteredDiscovery = useMemo(() => {
    const notOnlyMine = publicServers.filter((s) => !s.my_role);
    if (!query) return notOnlyMine;
    return notOnlyMine.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        s.description.toLowerCase().includes(query),
    );
  }, [publicServers, query]);

  async function handleCreate(input: CreateServerInput) {
    if (!userId) return;
    setCreateBusy(true);
    setCreateError('');
    try {
      const server = await createServer(input, userId);
      storeActiveServer(server.id);
      setCreateOpen(false);
      await refresh();
      const withMeta: ServerWithMeta = {
        ...server,
        member_count: 1,
        my_role: 'owner',
      };
      setView({ mode: 'detail', server: withMeta });
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create server.');
    } finally {
      setCreateBusy(false);
    }
  }

  async function handleJoin(server: ServerWithMeta) {
    if (!userId) return;
    setJoiningId(server.id);
    setError('');
    try {
      await joinPublicServer(server.id, userId);
      storeActiveServer(server.id);
      await refresh();
      setView({
        mode: 'detail',
        server: { ...server, my_role: 'member', member_count: server.member_count + 1 },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not join server.');
    } finally {
      setJoiningId(null);
    }
  }

  async function redeemInvite() {
    if (!inviteCode.trim() || redeemingInvite || !userId) return;
    setRedeemingInvite(true);
    setError('');
    try {
      const serverId = await redeemServerInvitation(inviteCode);
      const joinedServer = await fetchServerById(serverId, userId);
      if (!joinedServer?.my_role) throw new Error('You joined the server, but it could not be opened. Refresh the page.');
      setInviteCode('');
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete('invite');
      window.history.replaceState({}, '', currentUrl.pathname + currentUrl.search + currentUrl.hash);
      storeActiveServer(serverId);
      await refresh();
      setView({ mode: 'detail', server: joinedServer });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not use this invitation.');
    } finally {
      setRedeemingInvite(false);
    }
  }

  function handleRedeemInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void redeemInvite();
  }

  function openServer(server: ServerWithMeta) {
    if (!server.my_role) return;
    storeActiveServer(server.id);
    setView({ mode: 'detail', server });
  }

  if (view.mode === 'detail') {
    return (
      <ServerDetail
        server={view.server}
        userId={userId}
        onServerUpdated={(updatedServer) => {
          setView((current) => current.mode === 'detail' ? { mode: 'detail', server: updatedServer } : current);
          setMyServers((current) => current.map((item) => item.id === updatedServer.id ? updatedServer : item));
        }}
        onBack={() => {
          storeActiveServer(null);
          setView({ mode: 'list' });
          void refresh();
        }}
        onLeft={() => {
          storeActiveServer(null);
          setView({ mode: 'list' });
          void refresh();
        }}
      />
    );
  }

  if (inviteCode.trim()) {
    return (
      <div className="flex h-full min-h-0 w-full items-center justify-center overflow-y-auto rounded-3xl bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.16),transparent_55%),linear-gradient(145deg,rgba(10,14,26,0.96),rgba(5,8,16,0.99))] px-4 py-10 sm:px-8">
        <section className="w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-ink-950/90 shadow-2xl shadow-black/50 backdrop-blur-xl" aria-live="polite">
          {invitePreview?.banner_url ? (
            <div className="relative h-40 w-full sm:h-52">
              <img src={invitePreview.banner_url} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/20 to-transparent" />
            </div>
          ) : (
            <div className="h-2 w-full bg-gradient-to-r from-primary-600 via-cyan-400 to-primary-500" />
          )}
          <div className="px-6 pb-7 pt-7 text-center sm:px-10 sm:pb-10">
            <p className="mb-5 text-xs font-bold uppercase tracking-[0.22em] text-primary-300">Server invitation</p>
            {invitePreviewLoading ? (
              <div className="flex flex-col items-center gap-4 py-12">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-400/25 border-t-primary-400" />
                <p className="text-sm text-ink-300">Loading invitation…</p>
              </div>
            ) : invitePreview ? (
              <>
                {invitePreview.icon_url ? (
                  <img src={invitePreview.icon_url} alt="" className="mx-auto mb-5 h-24 w-24 rounded-3xl object-cover ring-4 ring-ink-950 shadow-xl shadow-black/30 sm:h-28 sm:w-28" />
                ) : (
                  <div className="mx-auto mb-5 flex h-24 w-24 items-center justify-center rounded-3xl bg-primary-500/20 text-4xl font-bold text-primary-200 ring-4 ring-ink-950 sm:h-28 sm:w-28">{invitePreview.name.slice(0, 1).toUpperCase()}</div>
                )}
                <h1 className="text-2xl font-bold tracking-tight text-ink-50 sm:text-3xl">You're invited to join</h1>
                <h2 className="mt-2 break-words text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{invitePreview.name}</h2>
                <p className="mt-3 text-sm text-ink-400">{invitePreview.member_count} {invitePreview.member_count === 1 ? 'member' : 'members'} · AFTERDARK community</p>
                {invitePreview.description && <p className="mx-auto mt-5 max-w-lg text-sm leading-6 text-ink-300">{invitePreview.description}</p>}
                <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3">
                  <button type="button" disabled={!invitePreview.valid || redeemingInvite} onClick={() => void redeemInvite()} className="w-full rounded-xl bg-primary-500 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-primary-500/25 transition hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-40">
                    {redeemingInvite ? 'Joining…' : 'Accept invitation'}
                  </button>
                  <button type="button" onClick={() => { setInviteCode(''); const url = new URL(window.location.href); url.searchParams.delete('invite'); window.history.replaceState({}, '', url.pathname + url.search + url.hash); }} className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-6 py-3 text-sm font-semibold text-ink-300 transition hover:bg-white/[0.07] hover:text-white">
                    Maybe later
                  </button>
                  {!invitePreview.valid && <p className="text-xs text-rose-300">This invitation is expired, revoked, or unavailable.</p>}
                </div>
              </>
            ) : (
              <div className="py-10">
                <h1 className="text-2xl font-bold text-ink-50">Invitation unavailable</h1>
                <p className="mt-3 text-sm text-rose-300">{invitePreviewError || 'This invitation could not be found.'}</p>
                <button type="button" onClick={() => { setInviteCode(''); const url = new URL(window.location.href); url.searchParams.delete('invite'); window.history.replaceState({}, '', url.pathname + url.search + url.hash); }} className="mt-7 rounded-xl border border-white/10 px-6 py-3 text-sm font-semibold text-ink-200 transition hover:bg-white/5">Back to servers</button>
              </div>
            )}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 space-y-6 overflow-y-auto">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-500/15 ring-1 ring-primary-400/20">
            <Users size={22} className="text-primary-300" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-ink-50">Servers</h1>
            <p className="text-sm text-ink-400">Your communities, channels and invitations.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreateError('');
            setCreateOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 self-start rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary-500/20 transition hover:bg-primary-400 sm:self-auto"
        >
          <Plus size={16} />
          Create server
        </button>
      </header>

      {inviteCode.trim() && (
        <section className="overflow-hidden rounded-2xl border border-primary-400/25 bg-gradient-to-br from-primary-500/15 via-ink-900 to-ink-950 shadow-xl shadow-black/20" aria-live="polite">
          <div className="p-5 sm:p-6">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-primary-300">Server invitation</p>
            {invitePreviewLoading ? (
              <p className="text-sm text-ink-300">Loading invitation…</p>
            ) : invitePreview ? (
              <>
                <div className="flex items-center gap-4">
                  {invitePreview.icon_url ? (
                    <img src={invitePreview.icon_url} alt="" className="h-16 w-16 rounded-2xl object-cover ring-1 ring-white/10" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-500/20 text-2xl font-bold text-primary-200">{invitePreview.name.slice(0, 1).toUpperCase()}</div>
                  )}
                  <div className="min-w-0">
                    <h2 className="text-xl font-bold text-ink-50">Want to join {invitePreview.name}?</h2>
                    <p className="mt-1 text-sm text-ink-300">{invitePreview.member_count} {invitePreview.member_count === 1 ? 'member' : 'members'}</p>
                  </div>
                </div>
                {invitePreview.description && <p className="mt-4 max-w-2xl text-sm text-ink-300">{invitePreview.description}</p>}
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <button type="button" disabled={!invitePreview.valid || redeemingInvite} onClick={() => document.getElementById('server-invite-submit')?.click()} className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-40">
                    {redeemingInvite ? 'Joining…' : 'Yes, join server'}
                  </button>
                  <button type="button" onClick={() => { setInviteCode(''); const url = new URL(window.location.href); url.searchParams.delete('invite'); window.history.replaceState({}, '', url.pathname + url.search + url.hash); }} className="rounded-xl border border-white/10 px-5 py-2.5 text-sm font-medium text-ink-300 transition hover:bg-white/5">
                    Not now
                  </button>
                  {!invitePreview.valid && <span className="text-xs text-rose-300">This invitation is expired, revoked, or unavailable.</span>}
                </div>
              </>
            ) : (
              <p className="text-sm text-rose-300">{invitePreviewError || 'This invitation could not be found.'}</p>
            )}
          </div>
        </section>
      )}

      <form onSubmit={(event) => void handleRedeemInvite(event)} className="flex flex-col gap-2 rounded-xl border border-white/[0.07] bg-ink-900/50 p-3 sm:flex-row">
        <div className="min-w-0 flex-1">
          <label htmlFor="server-invite-code" className="mb-1.5 block text-xs font-semibold text-ink-300">Have an invite code?</label>
          <input
            id="server-invite-code"
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value)}
            maxLength={100}
            placeholder="Paste a server invite code"
            className="w-full rounded-lg border border-white/[0.08] bg-ink-950 px-3 py-2.5 text-sm text-ink-100 outline-none placeholder:text-ink-600 focus:border-primary-400/60"
          />
        </div>
        <button id="server-invite-submit" type="submit" disabled={!inviteCode.trim() || redeemingInvite} className="inline-flex items-center justify-center gap-2 self-stretch rounded-lg bg-primary-500 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-40 sm:self-end">
          {redeemingInvite ? 'Joining…' : 'Join server'} <ArrowRight size={14} />
        </button>
      </form>

      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-500"
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search servers…"
          className="w-full rounded-xl border border-white/[0.08] bg-ink-900/80 py-2.5 pl-10 pr-4 text-sm text-ink-100 outline-none transition placeholder:text-ink-600 focus:border-primary-400/60 focus:ring-2 focus:ring-primary-500/15"
        />
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-3.5 py-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="panel flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-400/25 border-t-primary-400" />
        </div>
      ) : (
        <>
          <section aria-labelledby="my-servers-heading" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 id="my-servers-heading" className="text-sm font-semibold text-ink-200">
                Your servers
                <span className="ml-2 font-normal text-ink-500">{filteredMine.length}</span>
              </h2>
            </div>

            {filteredMine.length === 0 ? (
              <EmptyState
                icon={Server}
                title={query ? 'No matching servers' : 'No servers yet'}
                description={
                  query
                    ? 'Try a different search term, or clear the search to see all of your communities.'
                    : 'Create a server or join a public community from Discover below.'
                }
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {filteredMine.map((server) => (
                  <ServerCard
                    key={server.id}
                    server={server}
                    variant="owned"
                    onOpen={openServer}
                  />
                ))}
              </div>
            )}
          </section>

          <section aria-labelledby="discover-heading" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 id="discover-heading" className="text-sm font-semibold text-ink-200">
                Discover public servers
                <span className="ml-2 font-normal text-ink-500">{filteredDiscovery.length}</span>
              </h2>
            </div>

            {filteredDiscovery.length === 0 ? (
              <EmptyState
                icon={Search}
                title={query ? 'No public servers match' : 'Nothing to discover yet'}
                description={
                  query
                    ? 'No public servers match your search.'
                    : 'When others create public servers, they will appear here for you to join.'
                }
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {filteredDiscovery.map((server) => (
                  <ServerCard
                    key={server.id}
                    server={server}
                    variant="discover"
                    joining={joiningId === server.id}
                    onOpen={openServer}
                    onJoin={(s) => void handleJoin(s)}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <CreateServerModal
        open={createOpen}
        busy={createBusy}
        error={createError}
        onClose={() => {
          if (!createBusy) setCreateOpen(false);
        }}
        onSubmit={handleCreate}
      />
    </div>
  );
}
