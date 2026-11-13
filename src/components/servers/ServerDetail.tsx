
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
  SlidersHorizontal,
  Users,
  CalendarDays,
  MessageCircle,
  Headphones,
  ChevronLeft,
  ChevronRight,
  X,
  MapPin,
  Clock,
  CheckCircle2,
  Star,
} from 'lucide-react';

import { ServerIcon } from '@/components/servers/ServerIcon';
import { ChannelChat } from '@/components/servers/ChannelChat';
import { CreateChannelModal } from '@/components/servers/CreateChannelModal';
import { RoleManager } from '@/components/servers/RoleManager';
import { MemberRoleManager } from '@/components/servers/MemberRoleManager';
import { ChannelPermissionsModal } from '@/components/servers/ChannelPermissionsModal';
import { ServerEventChat } from '@/components/servers/ServerEventChat';
import { ServerEventVoiceRoom } from '@/components/servers/ServerEventVoiceRoom';

import { cn } from '@/lib/cn';

import { fetchCustomRoles, fetchMemberRoles } from '@/lib/customRolesApi';
import { createServerEvent, fetchServerEvents, setServerEventRsvp, updateServerEvent, deleteServerEvent, type ServerEvent, type ServerEventRsvpStatus } from '@/lib/serverEventsApi';

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
  const [editSlowmode, setEditSlowmode] = useState(0);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState('');
  const [permissionsChannel, setPermissionsChannel] = useState<Channel | null>(null);
  const [deletingChannel, setDeletingChannel] = useState<Channel | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [reorderingChannelId, setReorderingChannelId] = useState<string | null>(null);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [eventChatId, setEventChatId] = useState<string | null>(null);
  const [eventVoiceId, setEventVoiceId] = useState<string | null>(null);
  const [events, setEvents] = useState<ServerEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventsError, setEventsError] = useState('');
  const [eventCreatorOpen, setEventCreatorOpen] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [eventStartsAt, setEventStartsAt] = useState(() => { const date = new Date(Date.now() + 86400000); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 16); });
  const [eventEndsAt, setEventEndsAt] = useState('');
  const [eventBusy, setEventBusy] = useState(false);
  const [eventRsvpBusy, setEventRsvpBusy] = useState<string | null>(null);
  const [eventEditingId, setEventEditingId] = useState<string | null>(null);
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);
  const [expandedEventAttendees, setExpandedEventAttendees] = useState<string | null>(null);
  const [eventSearch, setEventSearch] = useState('');
  const [eventFilter, setEventFilter] = useState<'all' | 'upcoming' | 'past'>('upcoming');
  const [eventSort, setEventSort] = useState<'soonest' | 'latest'>('soonest');
  const [eventView, setEventView] = useState<'list' | 'calendar'>('list');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => {
    const now = new Date();
    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  });

  const [rolesOpen, setRolesOpen] = useState(false);
  const [selectedMember, setSelectedMember] =
    useState<MemberWithProfile | null>(null);

  const isAdminOrOwner = canManageChannels(server.my_role);
  const currentMember = members.find((member) => member.user_id === userId);
  const filteredEvents = useMemo(() => {
    const query = eventSearch.trim().toLocaleLowerCase();
    return events
      .filter((event) => {
        const isPast = new Date(event.starts_at).getTime() < Date.now();
        if (eventFilter === 'upcoming' && isPast) return false;
        if (eventFilter === 'past' && !isPast) return false;
        if (!query) return true;
        return [event.title, event.description, event.location]
          .some((value) => value.toLocaleLowerCase().includes(query));
      })
      .sort((a, b) => eventSort === 'soonest'
        ? new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
        : new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());
  }, [events, eventSearch, eventFilter, eventSort]);

  const calendarDateKey = (date: Date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
  const calendarDays = useMemo(() => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    return [...Array<null>(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => new Date(year, month, index + 1))];
  }, [calendarMonth]);
  const calendarEvents = useMemo(() => events.filter((event) => calendarDateKey(new Date(event.starts_at)).startsWith(calendarMonth.getFullYear() + '-' + String(calendarMonth.getMonth() + 1).padStart(2, '0'))), [events, calendarMonth]);
  const displayedEvents = useMemo(() => eventView === 'calendar'
    ? filteredEvents.filter((event) => calendarDateKey(new Date(event.starts_at)) === selectedCalendarDate)
    : filteredEvents, [filteredEvents, eventView, selectedCalendarDate]);

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


  async function openEvents() {
    setEventsOpen(true);
    setEventsLoading(true);
    setEventsError('');
    try {
      setEvents(await fetchServerEvents(server.id));
    } catch (err) {
      setEventsError(err instanceof Error ? err.message : 'Could not load server events.');
    } finally {
      setEventsLoading(false);
    }
  }

  async function handleCreateEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!eventTitle.trim() || !eventStartsAt || eventBusy) return;
    setEventBusy(true);
    setEventsError('');
    try {
      const eventInput = {
        title: eventTitle.trim(),
        description: eventDescription.trim(),
        location: eventLocation.trim(),
        startsAt: new Date(eventStartsAt).toISOString(),
        endsAt: eventEndsAt ? new Date(eventEndsAt).toISOString() : null,
      };
      if (eventEditingId) {
        await updateServerEvent({ eventId: eventEditingId, ...eventInput });
      } else {
        await createServerEvent({ serverId: server.id, ...eventInput });
      }
      setEventTitle('');
      setEventDescription('');
      setEventLocation('');
      setEventEndsAt('');
      setEventEditingId(null);
      setEventCreatorOpen(false);
      setEvents(await fetchServerEvents(server.id));
    } catch (err) {
      setEventsError(err instanceof Error ? err.message : 'Could not create event.');
    } finally {
      setEventBusy(false);
    }
  }


  async function handleDeleteEvent(eventId: string) {
    if (deletingEventId !== eventId) {
      setDeletingEventId(eventId);
      return;
    }
    setEventRsvpBusy(eventId);
    setEventsError('');
    try {
      await deleteServerEvent(eventId);
      setEvents((current) => current.filter((item) => item.id !== eventId));
      setDeletingEventId(null);
    } catch (err) {
      setEventsError(err instanceof Error ? err.message : 'Could not cancel event.');
    } finally {
      setEventRsvpBusy(null);
    }
  }

  function beginEditEvent(item: ServerEvent) {
    const starts = new Date(item.starts_at);
    starts.setMinutes(starts.getMinutes() - starts.getTimezoneOffset());
    setEventTitle(item.title);
    setEventDescription(item.description);
    setEventLocation(item.location);
    setEventStartsAt(starts.toISOString().slice(0, 16));
    if (item.ends_at) {
      const ends = new Date(item.ends_at);
      ends.setMinutes(ends.getMinutes() - ends.getTimezoneOffset());
      setEventEndsAt(ends.toISOString().slice(0, 16));
    } else {
      setEventEndsAt('');
    }
    setEventEditingId(item.id);
    setEventCreatorOpen(true);
  }

  async function handleEventRsvp(eventId: string, status: ServerEventRsvpStatus) {
    setEventRsvpBusy(eventId);
    setEventsError('');
    try {
      await setServerEventRsvp(eventId, status);
      setEvents(await fetchServerEvents(server.id));
    } catch (err) {
      setEventsError(err instanceof Error ? err.message : 'Could not update your RSVP.');
    } finally {
      setEventRsvpBusy(null);
    }
  }

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
    setEditSlowmode(channel.slowmode_seconds ?? 0);
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
        slowmode_seconds: editSlowmode,
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

              <button
                type="button"
                onClick={() => void openEvents()}
                className="mt-3 flex w-full items-center gap-2 rounded-lg border border-primary-400/20 bg-primary-500/[0.06] px-2.5 py-2 text-left text-xs text-primary-200 transition hover:border-primary-400/40 hover:bg-primary-500/[0.12]"
              >
                <CalendarDays size={14} />
                Server events
              </button>

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
                                  title={`Permissions for #${channel.name}`}
                                  onClick={() => setPermissionsChannel(channel)}
                                  className="rounded p-1 text-ink-600 transition hover:bg-white/[0.06] hover:text-primary-300"
                                >
                                  <SlidersHorizontal size={11} />
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
                slowmodeSeconds={activeChannel.slowmode_seconds ?? 0}
                members={members}
                availableChannels={channels}
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




      {eventsOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.07] p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-500/15 text-primary-200"><CalendarDays size={19} /></div>
                <div><h2 className="text-base font-bold text-ink-50">Server events</h2><p className="text-[11px] text-ink-500">{server.name} · {events.length} events</p></div>
              </div>
              <button type="button" onClick={() => { setEventsOpen(false); setEventCreatorOpen(false); }} className="rounded-lg p-2 text-ink-400 transition hover:bg-white/[0.06] hover:text-ink-100" aria-label="Close events"><X size={17} /></button>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {eventsError ? <p role="alert" className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-300">{eventsError}</p> : null}
              {eventCreatorOpen ? (
                <form onSubmit={handleCreateEvent} className="space-y-3 rounded-xl border border-primary-400/20 bg-primary-500/[0.05] p-4">
                  <div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-ink-100">{eventEditingId ? 'Edit event' : 'Create an event'}</h3><button type="button" onClick={() => setEventCreatorOpen(false)} className="text-xs text-ink-500 hover:text-ink-200">Cancel</button></div>
                  <input value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} maxLength={120} required placeholder="Event title" className="w-full rounded-lg border border-white/10 bg-ink-900 px-3 py-2.5 text-sm text-ink-100 outline-none focus:border-primary-400/50" />
                  <textarea value={eventDescription} onChange={(e) => setEventDescription(e.target.value)} maxLength={2000} rows={3} placeholder="Description (optional)" className="w-full resize-y rounded-lg border border-white/10 bg-ink-900 px-3 py-2.5 text-sm text-ink-100 outline-none focus:border-primary-400/50" />
                  <input value={eventLocation} onChange={(e) => setEventLocation(e.target.value)} maxLength={160} placeholder="Location or meeting link (optional)" className="w-full rounded-lg border border-white/10 bg-ink-900 px-3 py-2.5 text-sm text-ink-100 outline-none focus:border-primary-400/50" />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <label className="space-y-1"><span className="text-[11px] text-ink-400">Starts</span><input type="datetime-local" value={eventStartsAt} onChange={(e) => setEventStartsAt(e.target.value)} required className="w-full rounded-lg border border-white/10 bg-ink-900 px-2 py-2 text-xs text-ink-100 outline-none focus:border-primary-400/50" /></label>
                    <label className="space-y-1"><span className="text-[11px] text-ink-400">Ends (optional)</span><input type="datetime-local" min={eventStartsAt} value={eventEndsAt} onChange={(e) => setEventEndsAt(e.target.value)} className="w-full rounded-lg border border-white/10 bg-ink-900 px-2 py-2 text-xs text-ink-100 outline-none focus:border-primary-400/50" /></label>
                  </div>
                  <div className="flex justify-end"><button type="submit" disabled={eventBusy || !eventTitle.trim() || !eventStartsAt} className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-400 disabled:opacity-40">{eventBusy ? 'Saving…' : eventEditingId ? 'Save changes' : 'Create event'}</button></div>
                </form>
              ) : null}
              {events.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-2">
                    <div className="flex gap-1 rounded-lg bg-ink-900 p-1">
                      <button type="button" onClick={() => setEventView('list')} className={'rounded-md px-3 py-1.5 text-[10px] font-semibold ' + (eventView === 'list' ? 'bg-primary-500/20 text-primary-200' : 'text-ink-500 hover:text-ink-200')}>List</button>
                      <button type="button" onClick={() => setEventView('calendar')} className={'rounded-md px-3 py-1.5 text-[10px] font-semibold ' + (eventView === 'calendar' ? 'bg-primary-500/20 text-primary-200' : 'text-ink-500 hover:text-ink-200')}>Calendar</button>
                    </div>
                    <span className="text-[10px] text-ink-600">{events.length} total events</span>
                  </div>
                  {eventView === 'calendar' ? (
                    <section className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                      <div className="mb-3 flex items-center justify-between">
                        <button type="button" onClick={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} className="rounded-lg p-2 text-ink-400 hover:bg-white/[0.06] hover:text-ink-100" aria-label="Previous month"><ChevronLeft size={16} /></button>
                        <h3 className="text-sm font-semibold text-ink-100">{calendarMonth.toLocaleDateString([], { month: 'long', year: 'numeric' })}</h3>
                        <button type="button" onClick={() => setCalendarMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} className="rounded-lg p-2 text-ink-400 hover:bg-white/[0.06] hover:text-ink-100" aria-label="Next month"><ChevronRight size={16} /></button>
                      </div>
                      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[9px] font-bold uppercase tracking-wide text-ink-600">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span key={day} className="py-1">{day}</span>)}</div>
                      <div className="grid grid-cols-7 gap-1">
                        {calendarDays.map((date, index) => {
                          if (!date) return <span key={'empty-' + index} className="min-h-10 rounded-lg" />;
                          const key = calendarDateKey(date);
                          const dayEvents = calendarEvents.filter((item) => calendarDateKey(new Date(item.starts_at)) === key);
                          const selected = selectedCalendarDate === key;
                          const today = calendarDateKey(new Date()) === key;
                          return <button key={key} type="button" onClick={() => setSelectedCalendarDate(key)} className={'relative flex min-h-10 flex-col items-center justify-center rounded-lg border text-xs transition ' + (selected ? 'border-primary-400/60 bg-primary-500/20 text-primary-100' : today ? 'border-primary-400/25 bg-primary-500/[0.06] text-ink-100' : 'border-transparent text-ink-400 hover:border-white/10 hover:bg-white/[0.04]')} aria-label={date.toLocaleDateString() + ' · ' + dayEvents.length + ' events'}>
                            <span>{date.getDate()}</span>
                            {dayEvents.length > 0 ? <span className="mt-0.5 flex gap-0.5">{dayEvents.slice(0, 3).map((item) => <span key={item.id} className="h-1 w-1 rounded-full bg-primary-300" />)}</span> : <span className="mt-0.5 h-1" />}
                          </button>;
                        })}
                      </div>
                      <p className="mt-3 text-[10px] font-semibold text-ink-400">{new Date(selectedCalendarDate + 'T12:00:00').toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} · {displayedEvents.length} matching events</p>
                    </section>
                  ) : null}
                  <div className="space-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                    <input value={eventSearch} onChange={(e) => setEventSearch(e.target.value)} placeholder="Search events, descriptions or locations…" aria-label="Search events" className="w-full rounded-lg border border-white/10 bg-ink-900 px-3 py-2.5 text-xs text-ink-100 outline-none placeholder:text-ink-600 focus:border-primary-400/50" />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex gap-1 rounded-lg bg-ink-900 p-1">
                        {(['upcoming', 'all', 'past'] as const).map((filter) => (
                          <button key={filter} type="button" onClick={() => setEventFilter(filter)} className={'rounded-md px-2.5 py-1.5 text-[10px] font-semibold capitalize transition ' + (eventFilter === filter ? 'bg-primary-500/20 text-primary-200' : 'text-ink-500 hover:text-ink-200')}>{filter}</button>
                        ))}
                      </div>
                      <select value={eventSort} onChange={(e) => setEventSort(e.target.value as 'soonest' | 'latest')} aria-label="Sort events" className="rounded-lg border border-white/10 bg-ink-900 px-2.5 py-2 text-[10px] text-ink-300 outline-none focus:border-primary-400/50">
                        <option value="soonest">Soonest first</option>
                        <option value="latest">Latest first</option>
                      </select>
                    </div>
                    <p className="text-[10px] text-ink-600">Showing {displayedEvents.length} of {events.length} events</p>
                  </div>
                </div>
              ) : null}
              {eventsLoading ? <div className="py-10 text-center text-xs text-ink-500">Loading events…</div> : events.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 px-4 py-10 text-center"><CalendarDays size={25} className="mx-auto mb-2 text-ink-600" /><p className="text-sm font-medium text-ink-300">No events scheduled</p><p className="mt-1 text-xs text-ink-500">Events created for this server will appear here.</p></div> : displayedEvents.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center"><p className="text-sm font-medium text-ink-300">{eventView === 'calendar' ? 'No events on this date' : 'No matching events'}</p><p className="mt-1 text-xs text-ink-500">{eventView === 'calendar' ? 'Choose another day or month to see scheduled events.' : 'Try another search or change the date filter.'}</p></div> : (
                <div className="space-y-3">
                  {displayedEvents.map((item) => {
                    const ownStatus = item.rsvps.find((rsvp) => rsvp.user_id === userId)?.status;
                    const going = item.rsvps.filter((rsvp) => rsvp.status === 'going').length;
                    const interested = item.rsvps.filter((rsvp) => rsvp.status === 'interested').length;
                    const eventDate = new Date(item.starts_at);
                    const past = eventDate.getTime() < Date.now();
                    return (
                      <article key={item.id} className="rounded-xl border border-white/[0.08] bg-ink-900/70 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0"><h3 className="break-words text-sm font-bold text-ink-100">{item.title}</h3><p className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-400"><Clock size={12} />{eventDate.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}{item.ends_at ? ' – ' + new Date(item.ends_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</p>{item.location ? <p className="mt-1 flex items-center gap-1.5 break-all text-[11px] text-ink-400"><MapPin size={12} />{item.location}</p> : null}</div>
                          <span className={'rounded-full px-2 py-1 text-[10px] ' + (past ? 'bg-white/[0.05] text-ink-500' : 'bg-emerald-400/10 text-emerald-300')}>{past ? 'Past' : 'Upcoming'}</span>
                        </div>
                        {item.description ? <p className="mt-3 whitespace-pre-wrap break-words text-xs leading-5 text-ink-300">{item.description}</p> : null}

                        <button
                          type="button"
                          onClick={() => setEventVoiceId((current) => current === item.id ? null : item.id)}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.05] px-2.5 py-1.5 text-[10px] font-semibold text-emerald-200 transition hover:border-emerald-400/40 hover:bg-emerald-400/[0.1]"
                        >
                          <Headphones size={12} /> {eventVoiceId === item.id ? 'Close voice room' : 'Open voice room'}
                        </button>
                        {eventVoiceId === item.id ? (
                          <div className="mt-3">
                            <ServerEventVoiceRoom
                              eventId={item.id}
                              eventTitle={item.title}
                              userId={userId}
                              members={members}
                              onClose={() => setEventVoiceId(null)}
                            />
                          </div>
                        ) : null}

                        <button
                          type="button"
                          onClick={() => setEventChatId((current) => current === item.id ? null : item.id)}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-primary-400/20 bg-primary-500/[0.06] px-2.5 py-1.5 text-[10px] font-semibold text-primary-200 transition hover:border-primary-400/40 hover:bg-primary-500/[0.12]"
                        >
                          <MessageCircle size={12} /> {eventChatId === item.id ? 'Close event chat' : 'Open event chat'}
                        </button>
                        {eventChatId === item.id ? (
                          <div className="mt-3">
                            <ServerEventChat
                              eventId={item.id}
                              eventTitle={item.title}
                              userId={userId}
                              members={members}
                              onClose={() => setEventChatId(null)}
                            />
                          </div>
                        ) : null}


                        <button type="button" onClick={() => setExpandedEventAttendees((current) => current === item.id ? null : item.id)} className="mt-2 text-[10px] font-semibold text-primary-300 hover:text-primary-200">
                          {expandedEventAttendees === item.id ? 'Hide attendees' : 'View attendees'} · {item.rsvps.filter((rsvp) => rsvp.status !== 'not_going').length}
                        </button>
                        {expandedEventAttendees === item.id ? (
                          <div className="mt-2 grid gap-2 rounded-lg border border-white/[0.06] bg-black/10 p-3 sm:grid-cols-2">
                            {(['going', 'interested'] as const).map((status) => {
                              const attendees = item.rsvps.filter((rsvp) => rsvp.status === status);
                              return (
                                <div key={status} className="min-w-0">
                                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-500">{status === 'going' ? 'Going' : 'Interested'} ({attendees.length})</p>
                                  {attendees.length ? <div className="space-y-1.5">{attendees.map((rsvp) => {
                                    const member = members.find((entry) => entry.user_id === rsvp.user_id);
                                    const label = member?.profile?.display_name || member?.profile?.username || 'Server member';
                                    return <div key={rsvp.user_id} className="flex min-w-0 items-center gap-2 text-xs text-ink-300">
                                      {member?.profile?.avatar_url ? <img src={member.profile.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" /> : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.07] text-[10px]">{label.slice(0, 1).toUpperCase()}</span>}
                                      <span className="truncate">{label}</span>
                                    </div>;
                                  })}</div> : <p className="text-[10px] text-ink-600">No responses yet</p>}
                                </div>
                              );
                            })}
                          </div>
                        ) : null}

                        {(item.created_by === userId || ['owner', 'admin', 'moderator'].includes(server.my_role ?? '')) ? (
                          <div className="mt-3 flex justify-end gap-2 border-t border-white/[0.06] pt-2">
                            <button type="button" onClick={() => beginEditEvent(item)} className="rounded-md border border-white/10 px-2.5 py-1.5 text-[10px] text-ink-400 transition hover:text-ink-100">Edit event</button>
                            <button type="button" disabled={eventRsvpBusy === item.id} onClick={() => void handleDeleteEvent(item.id)} className="rounded-md border border-red-400/20 px-2.5 py-1.5 text-[10px] text-red-300 transition hover:bg-red-400/10 disabled:opacity-50">{deletingEventId === item.id ? 'Confirm cancel' : 'Cancel event'}</button>
                          </div>
                        ) : null}

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
                          <div className="flex items-center gap-3 text-[10px] text-ink-500"><span className="flex items-center gap-1"><CheckCircle2 size={12} className="text-emerald-300" />{going} going</span><span className="flex items-center gap-1"><Star size={12} className="text-amber-300" />{interested} interested</span></div>
                          {!past ? <div className="flex flex-wrap gap-1.5">
                            <button type="button" disabled={eventRsvpBusy === item.id} onClick={() => void handleEventRsvp(item.id, 'going')} className={'rounded-md border px-2.5 py-1.5 text-[10px] font-semibold transition ' + (ownStatus === 'going' ? 'border-emerald-300/40 bg-emerald-400/10 text-emerald-200' : 'border-white/10 text-ink-400 hover:text-ink-100')}>Going</button>
                            <button type="button" disabled={eventRsvpBusy === item.id} onClick={() => void handleEventRsvp(item.id, 'interested')} className={'rounded-md border px-2.5 py-1.5 text-[10px] font-semibold transition ' + (ownStatus === 'interested' ? 'border-amber-300/40 bg-amber-400/10 text-amber-200' : 'border-white/10 text-ink-400 hover:text-ink-100')}>Interested</button>
                            <button type="button" disabled={eventRsvpBusy === item.id} onClick={() => void handleEventRsvp(item.id, 'not_going')} className={'rounded-md border px-2.5 py-1.5 text-[10px] font-semibold transition ' + (ownStatus === 'not_going' ? 'border-white/20 bg-white/[0.07] text-ink-200' : 'border-white/10 text-ink-500 hover:text-ink-200')}>Not going</button>
                          </div> : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
            {['owner', 'admin', 'moderator'].includes(server.my_role ?? '') ? <div className="border-t border-white/[0.07] p-3"><button type="button" onClick={() => { setEventEditingId(null); setEventTitle(''); setEventDescription(''); setEventLocation(''); setEventEndsAt(''); setEventCreatorOpen((open) => !open); }} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-500 px-3 py-2.5 text-xs font-semibold text-white transition hover:bg-primary-400"><Plus size={14} /> Create event</button></div> : null}
          </div>
        </div>
      ) : null}

      {permissionsChannel && (
        <ChannelPermissionsModal
          channelId={permissionsChannel.id}
          channelName={permissionsChannel.name}
          members={members}
          onClose={() => setPermissionsChannel(null)}
        />
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
            <label className="block text-xs font-medium text-ink-300">Slowmode
              <select value={editSlowmode} onChange={(event) => setEditSlowmode(Number(event.target.value))} className="mt-1.5 w-full rounded-lg border border-white/[0.08] bg-ink-950 px-3 py-2 text-sm text-ink-100 outline-none focus:border-primary-400/60">
                <option value={0}>Off</option><option value={5}>5 seconds</option><option value={10}>10 seconds</option><option value={15}>15 seconds</option><option value={30}>30 seconds</option><option value={60}>1 minute</option><option value={120}>2 minutes</option><option value={300}>5 minutes</option><option value={600}>10 minutes</option><option value={1800}>30 minutes</option><option value={3600}>1 hour</option>
              </select>
              <span className="mt-1 block text-[10px] text-ink-500">Members must wait this long between messages. Moderators and admins bypass slowmode.</span>
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
