import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Hash,
  Lock,
  LogOut,
  MessageSquare,
  Shield,
  Users,
} from 'lucide-react';
import { ServerIcon } from '@/components/servers/ServerIcon';
import { cn } from '@/lib/cn';
import {
  fetchChannels,
  fetchServerMembers,
  leaveServer,
} from '@/lib/serversApi';
import type { Channel, MemberWithProfile, ServerWithMeta } from '@/types/servers';

interface ServerDetailProps {
  server: ServerWithMeta;
  userId: string;
  onBack: () => void;
  onLeft: () => void;
}

const ROLE_ORDER: Record<string, number> = {
  owner: 4,
  admin: 3,
  moderator: 2,
  member: 1,
};

function roleLabel(role: string): string {
  if (role === 'admin') return 'Administrator';
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function ServerDetail({ server, userId, onBack, onLeft }: ServerDetailProps) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const [channelRows, memberRows] = await Promise.all([
          fetchChannels(server.id),
          fetchServerMembers(server.id),
        ]);
        if (cancelled) return;
        setChannels(channelRows);
        setMembers(memberRows);
        setActiveChannelId(channelRows[0]?.id ?? null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not load server.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [server.id]);

  const activeChannel = useMemo(
    () => channels.find((c) => c.id === activeChannelId) ?? null,
    [channels, activeChannelId],
  );

  const channelsByCategory = useMemo(() => {
    const map = new Map<string, Channel[]>();
    for (const channel of channels) {
      const list = map.get(channel.category) ?? [];
      list.push(channel);
      map.set(channel.category, list);
    }
    return Array.from(map.entries());
  }, [channels]);

  const sortedMembers = useMemo(
    () =>
      [...members].sort(
        (a, b) => (ROLE_ORDER[b.role] ?? 0) - (ROLE_ORDER[a.role] ?? 0),
      ),
    [members],
  );

  async function handleLeave() {
    if (server.my_role === 'owner') return;
    setLeaving(true);
    setError('');
    try {
      await leaveServer(server.id, userId);
      onLeft();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not leave server.');
      setLeaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm font-medium text-ink-400 transition hover:text-ink-100"
      >
        <ArrowLeft size={16} />
        Back to servers
      </button>

      <header className="panel overflow-hidden">
        <div
          className="h-24 w-full sm:h-28"
          style={{
            background: server.banner_url
              ? `center / cover url(${server.banner_url})`
              : `linear-gradient(120deg, ${server.theme_color}55, #0f131b 60%, #06b6d433)`,
          }}
        />
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-start gap-4">
            <ServerIcon
              name={server.name}
              iconUrl={server.icon_url}
              themeColor={server.theme_color}
              size="lg"
              className="-mt-10 ring-4 ring-ink-900"
            />
            <div className="min-w-0 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight text-ink-50">{server.name}</h1>
                {server.visibility === 'private' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-ink-800 px-2 py-0.5 text-[11px] font-medium text-ink-300">
                    <Lock size={11} />
                    Private
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary-500/15 px-2 py-0.5 text-[11px] font-medium text-primary-200">
                    Public
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-ink-400">
                {server.description || 'No description yet.'}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-500">
                <span className="inline-flex items-center gap-1">
                  <Users size={12} />
                  {server.member_count} {server.member_count === 1 ? 'member' : 'members'}
                </span>
                {server.my_role ? (
                  <span className="inline-flex items-center gap-1 capitalize text-primary-300">
                    <Shield size={12} />
                    {roleLabel(server.my_role)}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {server.my_role && server.my_role !== 'owner' ? (
            <button
              type="button"
              disabled={leaving}
              onClick={() => void handleLeave()}
              className="inline-flex items-center gap-2 self-start rounded-xl border border-white/[0.08] px-3 py-2 text-sm font-medium text-ink-300 transition hover:border-red-400/30 hover:bg-red-400/10 hover:text-red-300 disabled:opacity-50 sm:self-auto"
            >
              <LogOut size={15} />
              {leaving ? 'Leaving…' : 'Leave server'}
            </button>
          ) : null}
        </div>
      </header>

      {error ? (
        <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-3.5 py-3 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="panel flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-400/25 border-t-primary-400" />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)_220px]">
          <aside className="panel flex flex-col overflow-hidden">
            <div className="border-b border-white/[0.06] px-4 py-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-400">Channels</h2>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-3">
              {channels.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs leading-relaxed text-ink-500">
                  No channels yet. Administrators can create channels for this server.
                </p>
              ) : (
                channelsByCategory.map(([category, list]) => (
                  <div key={category}>
                    <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                      {category}
                    </p>
                    <ul className="space-y-0.5">
                      {list.map((channel) => {
                        const active = channel.id === activeChannelId;
                        return (
                          <li key={channel.id}>
                            <button
                              type="button"
                              onClick={() => setActiveChannelId(channel.id)}
                              className={cn(
                                'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition',
                                active
                                  ? 'bg-primary-500/15 text-primary-100'
                                  : 'text-ink-300 hover:bg-white/[0.04] hover:text-ink-100',
                              )}
                            >
                              <Hash size={14} className={active ? 'text-primary-300' : 'text-ink-500'} />
                              <span className="truncate">{channel.name}</span>
                              {channel.is_restricted ? (
                                <Lock size={11} className="ml-auto shrink-0 text-ink-500" />
                              ) : null}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}
            </div>
          </aside>

          <section className="panel flex min-h-[320px] flex-col overflow-hidden">
            {activeChannel ? (
              <>
                <header className="flex items-center gap-2 border-b border-white/[0.06] px-5 py-3.5">
                  <Hash size={18} className="text-ink-400" />
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-ink-100">{activeChannel.name}</h2>
                    {activeChannel.topic ? (
                      <p className="truncate text-xs text-ink-500">{activeChannel.topic}</p>
                    ) : null}
                  </div>
                </header>
                <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-800 ring-1 ring-white/[0.06]">
                    <MessageSquare size={24} className="text-secondary-300" />
                  </div>
                  <h3 className="text-base font-semibold text-ink-100">#{activeChannel.name}</h3>
                  <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-400">
                    Channel messaging is scheduled for a later stage. You can browse channels and
                    members now.
                  </p>
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-800 ring-1 ring-white/[0.06]">
                  <Hash size={24} className="text-secondary-300" />
                </div>
                <h3 className="text-base font-semibold text-ink-100">No channel selected</h3>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-400">
                  Pick a channel from the list, or wait until an administrator creates one.
                </p>
              </div>
            )}
          </section>

          <aside className="panel flex flex-col overflow-hidden">
            <div className="border-b border-white/[0.06] px-4 py-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-400">
                Members · {members.length}
              </h2>
            </div>
            <ul className="flex-1 space-y-1 overflow-y-auto p-3">
              {sortedMembers.map((member) => {
                const label =
                  member.profile?.display_name ||
                  member.profile?.username ||
                  'Unknown member';
                const handle = member.profile?.username
                  ? `@${member.profile.username}`
                  : null;
                return (
                  <li
                    key={member.user_id}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-2"
                  >
                    {member.profile?.avatar_url ? (
                      <img
                        src={member.profile.avatar_url}
                        alt=""
                        className="h-8 w-8 rounded-full object-cover ring-1 ring-white/[0.08]"
                      />
                    ) : (
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-500/20 text-xs font-semibold text-primary-200">
                        {label.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-100">{label}</p>
                      <p className="truncate text-[11px] text-ink-500">
                        {roleLabel(member.role)}
                        {handle ? ` · ${handle}` : ''}
                      </p>
                    </div>
                  </li>
                );
              })}
              {members.length === 0 ? (
                <li className="px-2 py-6 text-center text-xs text-ink-500">No members found.</li>
              ) : null}
            </ul>
          </aside>
        </div>
      )}
    </div>
  );
}
