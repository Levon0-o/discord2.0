
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Hash,
  Lock,
  LogOut,
  Plus,
  Settings2,
  Shield,
  Pencil,
  Trash2,
  Users,
} from 'lucide-react';

import { ServerIcon } from '@/components/servers/ServerIcon';
import { ChannelChat } from '@/components/servers/ChannelChat';
import { CreateChannelModal } from '@/components/servers/CreateChannelModal';
import { RoleManager } from '@/components/servers/RoleManager';
import { MemberRoleManager } from '@/components/servers/MemberRoleManager';

import { cn } from '@/lib/cn';

import { fetchCustomRoles, fetchMemberRoles } from '@/lib/customRolesApi';

import {
  createChannel,
  updateChannel,
  reorderChannel,
  deleteChannel,
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
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [editName, setEditName] = useState('');
  const [editTopic, setEditTopic] = useState('');
  const [editCategory, setEditCategory] = useState('General');
  const [editRestricted, setEditRestricted] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState('');
  const [deletingChannel, setDeletingChannel] = useState<Channel | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [reorderingChannelId, setReorderingChannelId] = useState<string | null>(null);

  const [rolesOpen, setRolesOpen] = useState(false);
  const [selectedMember, setSelectedMember] =
    useState<MemberWithProfile | null>(null);

  const isAdminOrOwner = canManageChannels(server.my_role);
  const currentMember = members.find((member) => member.user_id === userId);
  const canManageRoles =
    isAdminOrOwner ||
    Boolean(
      currentMember?.custom_roles?.some(
        (role) => role.permissions.manage_roles === true,
      ),
    );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');

      try {
        const [channelRows, memberRows, roleRows, memberRoleRows] =
          await Promise.all([
            fetchChannels(server.id),
            fetchServerMembers(server.id),
            fetchCustomRoles(server.id),
            fetchMemberRoles(server.id),
          ]);

        if (cancelled) return;

        const rolesById = new Map(roleRows.map((role) => [role.id, role]));
        const customRolesByMember = new Map<string, typeof roleRows>();

        for (const assignment of memberRoleRows) {
          const role = rolesById.get(assignment.role_id);
          if (!role) continue;

          const assigned = customRolesByMember.get(assignment.user_id) ?? [];
          assigned.push(role);
          customRolesByMember.set(assignment.user_id, assigned);
        }

        const membersWithRoles = memberRows.map((member) => ({
          ...member,
          custom_roles: (customRolesByMember.get(member.user_id) ?? []).sort(
            (a, b) => b.position - a.position,
          ),
        }));

        setChannels(channelRows);
        setMembers(membersWithRoles);

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

  async function refreshMemberRoles() {
    const [roleRows, memberRoleRows] = await Promise.all([
      fetchCustomRoles(server.id),
      fetchMemberRoles(server.id),
    ]);

    const rolesById = new Map(roleRows.map((role) => [role.id, role]));
    const customRolesByMember = new Map<string, typeof roleRows>();

    for (const assignment of memberRoleRows) {
      const role = rolesById.get(assignment.role_id);
      if (!role) continue;
      const assigned = customRolesByMember.get(assignment.user_id) ?? [];
      assigned.push(role);
      customRolesByMember.set(assignment.user_id, assigned);
    }

    setMembers((current) => current.map((member) => ({
      ...member,
      custom_roles: (customRolesByMember.get(member.user_id) ?? []).sort(
        (a, b) => b.position - a.position,
      ),
    })));
  }

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

  function openChannelEditor(channel: Channel) {
    setEditingChannel(channel);
    setEditName(channel.name);
    setEditTopic(channel.topic);
    setEditCategory(channel.category);
    setEditRestricted(channel.is_restricted);
    setEditError('');
  }

  async function handleReorderChannel(channel: Channel, direction: 'up' | 'down') {
    setReorderingChannelId(channel.id);
    setError('');
    try {
      await reorderChannel(server.id, channel.id, direction);
      setChannels(await fetchChannels(server.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reorder channel.');
    } finally {
      setReorderingChannelId(null);
    }
  }

  async function handleDeleteChannel() {
    if (!deletingChannel) return;
    setDeleteBusy(true);
    setDeleteError('');
    try {
      await deleteChannel(deletingChannel.id);
      const refreshed = await fetchChannels(server.id);
      setChannels(refreshed);
      if (activeChannelId === deletingChannel.id) {
        setActiveChannelId(refreshed[0]?.id ?? null);
      }
      setDeletingChannel(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Could not delete channel.');
    } finally {
      setDeleteBusy(false);
    }
  }

  async function handleUpdateChannel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingChannel) return;
    setEditBusy(true);
    setEditError('');
    try {
      await updateChannel(editingChannel.id, {
        name: editName,
        topic: editTopic,
        category: editCategory,
        is_restricted: editRestricted,
      });
      setChannels(await fetchChannels(server.id));
      setEditingChannel(null);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Could not update channel.');
    } finally {
      setEditBusy(false);
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

              {canManageRoles && (
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
                          <li key={channel.id} className="flex items-center">
                            <button
                              type="button"
                              onClick={() => {
                                setRolesOpen(false);
                                setSelectedMember(null);
                                setActiveChannelId(channel.id);
                              }}
                              className={cn(
                                'flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition',
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
                            {isAdminOrOwner && (
                              <div className="ml-1 flex shrink-0 items-center">
                                <button
                                  type="button"
                                  title="Move channel up in category"
                                  disabled={reorderingChannelId !== null || list[0]?.id === channel.id}
                                  onClick={() => void handleReorderChannel(channel, 'up')}
                                  className="rounded p-1 text-ink-600 transition hover:bg-white/[0.06] hover:text-primary-300 disabled:opacity-25"
                                >
                                  <ArrowUp size={11} />
                                </button>
                                <button
                                  type="button"
                                  title="Move channel down in category"
                                  disabled={reorderingChannelId !== null || list[list.length - 1]?.id === channel.id}
                                  onClick={() => void handleReorderChannel(channel, 'down')}
                                  className="rounded p-1 text-ink-600 transition hover:bg-white/[0.06] hover:text-primary-300 disabled:opacity-25"
                                >
                                  <ArrowDown size={11} />
                                </button>
                                <button
                                  type="button"
                                  title={`Edit #${channel.name}`}
                                  onClick={() => openChannelEditor(channel)}
                                  className="rounded p-1 text-ink-600 transition hover:bg-white/[0.06] hover:text-primary-300"
                                >
                                  <Pencil size={11} />
                                </button>
                                <button
                                  type="button"
                                  title={`Delete #${channel.name}`}
                                  onClick={() => {
                                    setDeleteError('');
                                    setDeletingChannel(channel);
                                  }}
                                  className="rounded p-1 text-ink-600 transition hover:bg-red-400/10 hover:text-red-300"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            )}
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
                onClose={() => {
                  setSelectedMember(null);
                  void refreshMemberRoles();
                }}
              />
            ) : rolesOpen ? (
              <RoleManager
                serverId={server.id}
                onBack={() => {
                  setRolesOpen(false);
                  void refreshMemberRoles();
                }}
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
                      disabled={!canManageRoles || isSelf}
                      onClick={() => setSelectedMember(member)}
                      title={
                        isSelf
                          ? 'You cannot edit your own roles here'
                          : canManageRoles
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
                          className="flex min-w-0 items-center gap-1 truncate text-[9px] text-ink-500"
                          title={member.custom_roles?.[0]?.name || roleLabel(member.role)}
                        >
                          {member.custom_roles?.[0] ? (
                            <span
                              className="truncate font-semibold"
                              style={{ color: member.custom_roles[0].color }}
                            >
                              {member.custom_roles[0].icon ? `${member.custom_roles[0].icon} ` : ''}
                              {member.custom_roles[0].name}
                            </span>
                          ) : (
                            roleLabel(member.role)
                          )}
                          {handle ? ` · ${handle}` : ''}
                        </p>
                      </div>

                      {canManageRoles && !isSelf && (
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



      {deletingChannel && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
          <div role="alertdialog" aria-modal="true" className="w-full max-w-sm space-y-4 rounded-2xl border border-red-400/20 bg-ink-900 p-5 shadow-2xl">
            <div>
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-red-400/10 text-red-300"><Trash2 size={18} /></div>
              <h2 className="text-base font-semibold text-ink-50">Delete #{deletingChannel.name}?</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-400">This permanently deletes the channel, its message history, pins and notification settings. Uploaded files become inaccessible with the deleted channel. This action cannot be undone.</p>
            </div>
            {deleteError && <p role="alert" className="rounded-lg bg-red-400/10 p-2 text-xs text-red-300">{deleteError}</p>}
            <div className="flex gap-2">
              <button type="button" disabled={deleteBusy} onClick={() => setDeletingChannel(null)} className="flex-1 rounded-lg border border-white/[0.08] px-3 py-2 text-sm text-ink-300 hover:bg-white/[0.04] disabled:opacity-50">Cancel</button>
              <button type="button" disabled={deleteBusy} onClick={() => void handleDeleteChannel()} className="flex-1 rounded-lg bg-red-500 px-3 py-2 text-sm font-semibold text-white hover:bg-red-400 disabled:opacity-50">{deleteBusy ? 'Deleting…' : 'Delete channel'}</button>
            </div>
          </div>
        </div>
      )}

      {editingChannel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4">
          <form onSubmit={(event) => void handleUpdateChannel(event)} className="w-full max-w-md space-y-4 rounded-2xl border border-white/[0.08] bg-ink-900 p-5 shadow-2xl">
            <div>
              <h2 className="text-lg font-semibold text-ink-50">Edit channel</h2>
              <p className="mt-1 text-xs text-ink-400">Update the channel name, topic, category and visibility.</p>
            </div>
            <label className="block text-xs font-medium text-ink-300">Channel name
              <input value={editName} onChange={(event) => setEditName(event.target.value.toLowerCase())} maxLength={50} required className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-ink-950 px-3 py-2 text-sm text-ink-100 outline-none focus:border-primary-400/60" />
            </label>
            <label className="block text-xs font-medium text-ink-300">Topic
              <input value={editTopic} onChange={(event) => setEditTopic(event.target.value)} maxLength={200} className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-ink-950 px-3 py-2 text-sm text-ink-100 outline-none focus:border-primary-400/60" />
            </label>
            <label className="block text-xs font-medium text-ink-300">Category
              <input value={editCategory} onChange={(event) => setEditCategory(event.target.value)} maxLength={40} required className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-ink-950 px-3 py-2 text-sm text-ink-100 outline-none focus:border-primary-400/60" />
            </label>
            <label className="flex items-start gap-2 rounded-lg border border-white/[0.07] p-3 text-xs text-ink-300">
              <input type="checkbox" checked={editRestricted} onChange={(event) => setEditRestricted(event.target.checked)} className="mt-0.5" />
              <span><strong className="block text-ink-100">Restricted channel</strong>Only moderators and above can view this channel.</span>
            </label>
            {editError && <p role="alert" className="rounded-lg bg-red-400/10 p-2 text-xs text-red-300">{editError}</p>}
            <div className="flex gap-2">
              <button type="button" disabled={editBusy} onClick={() => setEditingChannel(null)} className="flex-1 rounded-lg border border-white/[0.08] px-3 py-2 text-sm text-ink-300 hover:bg-white/[0.04] disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={editBusy} className="flex-1 rounded-lg bg-primary-500 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-400 disabled:opacity-50">{editBusy ? 'Saving…' : 'Save changes'}</button>
            </div>
          </form>
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
