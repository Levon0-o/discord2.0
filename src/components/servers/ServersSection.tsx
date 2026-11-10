import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, Server, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { EmptyState } from '@/components/ui/EmptyState';
import { CreateServerModal } from '@/components/servers/CreateServerModal';
import { ServerCard } from '@/components/servers/ServerCard';
import { ServerDetail } from '@/components/servers/ServerDetail';
import {
  createServer,
  fetchMyServers,
  fetchPublicServers,
  joinPublicServer,
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load servers.');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  function openServer(server: ServerWithMeta) {
    if (!server.my_role) return;
    setView({ mode: 'detail', server });
  }

  if (view.mode === 'detail') {
    return (
      <ServerDetail
        server={view.server}
        userId={userId}
        onBack={() => {
          setView({ mode: 'list' });
          void refresh();
        }}
        onLeft={() => {
          setView({ mode: 'list' });
          void refresh();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
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
