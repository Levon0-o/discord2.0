
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Hash,
  Lock,
  LogOut,
  Plus,
  Settings2,
  Shield,
  Users,
} from 'lucide-react';

import { ServerIcon } from '@/components/servers/ServerIcon';
import { ChannelChat } from '@/components/servers/ChannelChat';
import { CreateChannelModal } from '@/components/servers/CreateChannelModal';
import { RoleManager } from '@/components/servers/RoleManager';
import { MemberRoleManager } from '@/components/servers/MemberRoleManager';

import { cn } from '@/lib/cn';

import {
  createChannel,
  fetchChannels,
  fetchServerMembers,
  leaveServer,
} from '@/lib/serversApi';

import type {
  Channel,
  CreateChannelInput,
  MemberWithProfile,
  ServerWithMeta,
} from '@/types/servers';

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

function canManageChannels(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

export function ServerDetail({
  server,
  userId,
  onBack,
  onLeft,
}: ServerDetailProps) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [members, setMembers] = useState<MemberWithProfile[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [leaving, setLeaving] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState('');

  const [rolesOpen, setRolesOpen] = useState(false);
  const [selectedMember, setSelectedMember] =
    useState<MemberWithProfile | null>(null);

  const isAdminOrOwner = canManageChannels(server.my_role);

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

        setActiveChannelId((current) => {
          if (current && channelRows.some((c) => c.id === current)) {
            return current;
          }

          return channelRows[0]?.id ?? null;
        });
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Could not load server.',
          );
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

  const nextChannelPosition = useMemo(() => {
    if (channels.length === 0) return 0;
    return Math.max(...channels.map((c) => c.position)) + 1;
  }, [channels]);

  async function handleLeave() {
    if (server.my_role === 'owner') return;

    setLeaving(true);
    setError('');

    try {
      await leaveServer(server.id, userId);
      onLeft();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not leave server.',
      );
      setLeaving(false);
    }
  }

  async function handleCreateChannel(input: CreateChannelInput) {
    setCreateBusy(true);
    setCreateError('');

    try {
      const created = await createChannel(input);
      const refreshed = await fetchChannels(server.id);

      setChannels(refreshed);
      setActiveChannelId(created.id);
      setCreateOpen(false);
    } catch (err) {
      setCreateError(
        err instanceof Error ? err.message : 'Could not create channel.',
      );
    } finally {
      setCreateBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {error && (
        <p
          role="alert"
          className="mb-2 shrink-0 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </p>
      )}

      {loading ? (
        <div className="panel flex min-h-0 flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-400/25 border-t-primary-400" />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-hidden lg:grid-cols-[190px_minmax(0,1fr)_170px]">
          {/* LEFT: SERVER AND CHANNELS */}
          <aside className="panel flex min-h-0 flex-col overflow-hidden">
            <div className="shrink-0 border-b border-white/[0.06] p-3">
              <button
                type="button"
                onClick={onBack}
                className="mb-3 flex items-center gap-1.5 text-[11px] text-ink-500 transition hover:text-ink-200"
              >
                <ArrowLeft size={13} />
                Back to servers
              </button>

              <div className="flex min-w-0 items-center gap-2">
                <ServerIcon
                  name={server.name}
                  iconUrl={server.icon_url}
                  themeColor={server.theme_color}
                  size="md"
                />

                <div className="min-w-0 flex-1">
                  <h1 className="truncate text-sm font-bold text-ink-100">
                    {server.name}
                  </h1>

                  <p className="truncate text-[10px] text-ink-500">
                    {server.visibility === 'private'
                      ? 'Private server'
                      : 'Public server'}
                  </p>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between">
                <span className="flex items-center gap-1 text-[10px] text-ink-500">
                  <Users size={11} />
                  {server.member_count} members
                </span>

                {server.my_role && server.my_role !== 'owner' && (
                  <button
                    type="button"
                    disabled={leaving}
                    onClick={() => void handleLeave()}
                    className="flex items-center gap-1 text-[10px] text-red-300 transition hover:text-red-200 disabled:opacity-50"
                  >
                    <LogOut size={11} />
                    {leaving ? 'Leaving…' : 'Leave'}
                  </button>
                )}
              </div>

              {server.my_role && (
                <p className="mt-1 flex items-center gap-1 text-[10px] text-primary-300">
                  <Shield size={10} />
                  {roleLabel(server.my_role)}
                </p>
              )}

              {isAdminOrOwner && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMember(null);
                    setRolesOpen(true);
                  }}
                  className="mt-3 flex w-full items-center gap-2 rounded-lg border border-white/[0.07] px-2.5 py-2 text-left text-xs text-ink-300 transition hover:border-primary-400/30 hover:bg-primary-500/[0.07] hover:text-primary-200"
                >
                  <Settings2 size={14} />
                  Manage roles
                </button>
              )}
            </div>

            <div className="flex shrink-0 items-center justify-between gap-2 px-3 pb-2 pt-3">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-ink-500">
                Channels
              </h2>

              {isAdminOrOwner && (
                <button
                  type="button"
                  onClick={() => {
                    setCreateError('');
                    setCreateOpen(true);
                  }}
                  className="rounded-md p-1 text-ink-500 transition hover:bg-white/[0.06] hover:text-primary-300"
                  title="Create channel"
                >
                  <Plus size={15} />
                </button>
              )}
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2 pb-3">
              {channels.length === 0 ? (
                <div className="px-2 py-5 text-center">
                  <p className="text-[11px] leading-relaxed text-ink-500">
                    No channels yet.
                  </p>

                  {isAdminOrOwner && (
                    <button
                      type="button"
                      onClick={() => {
                        setCreateError('');
                        setCreateOpen(true);
                      }}
                      className="mt-2 text-[11px] font-semibold text-primary-300 hover:text-primary-200"
                    >
                      + Create channel
                    </button>
                  )}
                </div>
              ) : (
                channelsByCategory.map(([category, list]) => (
                  <div key={category}>
                    <p className="mb-1 px-2 text-[9px] font-bold uppercase tracking-widest text-ink-600">
                      {category}
                    </p>

                    <ul className="space-y-0.5">
                      {list.map((channel) => {
                        const active = channel.id === activeChannelId;

                        return (
                          <li key={channel.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setRolesOpen(false);
                                setSelectedMember(null);
                                setActiveChannelId(channel.id);
                              }}
                              className={cn(
                                'flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition',
                                active
                                  ? 'bg-primary-500/15 text-primary-100'
                                  : 'text-ink-400 hover:bg-white/[0.04] hover:text-ink-100',
                              )}
                            >
                              <Hash
                                size={13}
                                className={cn(
                                  'shrink-0',
                                  active
                                    ? 'text-primary-300'
                                    : 'text-ink-600',
                                )}
                              />

                              <span className="min-w-0 flex-1 truncate">
                                {channel.name}
                              </span>

                              {channel.is_restricted && (
                                <Lock
                                  size={10}
                                  className="shrink-0 text-ink-600"
                                />
                              )}
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

          {/* CENTER: CHAT, ROLE MANAGER OR MEMBER ROLE MANAGER */}
          <div className="min-h-0 min-w-0 overflow-hidden">
            {selectedMember ? (
              <MemberRoleManager
                serverId={server.id}
                member={selectedMember}
                onClose={() => setSelectedMember(null)}
              />
            ) : rolesOpen ? (
              <RoleManager
                serverId={server.id}
                onBack={() => setRolesOpen(false)}
              />
            ) : activeChannel ? (
              <ChannelChat
                channelId={activeChannel.id}
                channelName={activeChannel.name}
                channelTopic={activeChannel.topic}
                members={members}
              />
            ) : (
              <section className="panel flex h-full min-h-[320px] flex-col items-center justify-center overflow-hidden px-6 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-800 ring-1 ring-white/[0.06]">
                  <Hash size={24} className="text-secondary-300" />
                </div>

                <h3 className="text-base font-semibold text-ink-100">
                  No channel selected
                </h3>

                <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-400">
                  Pick a channel from the list, or create one if you are an administrator.
                </p>
              </section>
            )}
          </div>

          {/* RIGHT: MEMBERS */}
          <aside className="panel flex min-h-0 flex-col overflow-hidden">
            <div className="shrink-0 border-b border-white/[0.06] px-3 py-2.5">
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-ink-400">
                Members — {members.length}
              </h2>
            </div>

            <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
              {sortedMembers.map((member) => {
                const label =
                  member.profile?.display_name ||
                  member.profile?.username ||
                  'Unknown member';

                const handle = member.profile?.username
                  ? `@${member.profile.username}`
                  : null;

                const isSelf = member.user_id === userId;

                return (
                  <li key={member.user_id}>
                    <button
                      type="button"
                      disabled={!isAdminOrOwner || isSelf}
                      onClick={() => setSelectedMember(member)}
                      title={
                        isSelf
                          ? 'You cannot edit your own roles here'
                          : isAdminOrOwner
                            ? 'Manage member roles'
                            : 'You do not have permission'
                      }
                      className="flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition hover:bg-white/[0.04] disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      {member.profile?.avatar_url ? (
                        <img
                          src={member.profile.avatar_url}
                          alt=""
                          className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-white/[0.08]"
                        />
                      ) : (
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-500/20 text-[10px] font-semibold text-primary-200">
                          {label.slice(0, 1).toUpperCase()}
                        </div>
                      )}

                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-[11px] font-semibold text-ink-100"
                          title={label}
                        >
                          {label}
                        </p>

                        <p
                          className="truncate text-[9px] text-ink-500"
                          title={handle || roleLabel(member.role)}
                        >
                          {roleLabel(member.role)}
                          {handle ? ` · ${handle}` : ''}
                        </p>
                      </div>

                      {isAdminOrOwner && !isSelf && (
                        <Shield
                          size={13}
                          className="shrink-0 text-ink-600"
                        />
                      )}
                    </button>
                  </li>
                );
              })}

              {members.length === 0 && (
                <li className="px-2 py-6 text-center text-[11px] text-ink-500">
                  No members found.
                </li>
              )}
            </ul>
          </aside>
        </div>
      )}

      {isAdminOrOwner && (
        <CreateChannelModal
          open={createOpen}
          busy={createBusy}
          error={createError}
          serverId={server.id}
          defaultPosition={nextChannelPosition}
          onClose={() => {
            if (!createBusy) setCreateOpen(false);
          }}
          onSubmit={handleCreateChannel}
        />
      )}
    </div>
  );
}
