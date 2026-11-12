import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Bell,
  Compass,
  MessageSquare,
  Plus,
  Server,
  Settings,
  Sparkles,
  Users,
  UserRound,
  RefreshCw,
} from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { fetchMyServers } from '@/lib/serversApi';
import {
  fetchMyConversations,
  type DirectConversation,
} from '@/lib/directMessagesApi';
import {
  fetchFriends,
  fetchFriendRequests,
  type FriendWithProfile,
} from '@/lib/friendsApi';
import type { ServerWithMeta } from '@/types/servers';
import type { SectionId } from '@/config/navigation';

interface DashboardProps {
  onNavigate: (id: SectionId) => void;
  onOpenConversation: (conversationId: string) => void;
}

interface ProfileSnippet {
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

function greetingForHour(hour: number): string {
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 22) return 'Good evening';
  return 'Good night';
}

function getInitials(value: string): string {
  return value.trim().slice(0, 2).toUpperCase() || 'A';
}

function formatDate(value: string | null): string {
  if (!value) return 'No activity yet';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return 'Recently';

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function MetricCard({
  label,
  value,
  description,
  icon: Icon,
  accent,
  iconColor,
  onClick,
}: {
  label: string;
  value: number;
  description: string;
  icon: typeof Server;
  accent: string;
  iconColor: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-gradient-to-br ${accent} p-5 text-left transition hover:-translate-y-0.5 hover:border-white/[0.12]`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink-950/50 ring-1 ring-white/[0.06]">
          <Icon size={21} className={iconColor} />
        </div>

        <span className="text-3xl font-semibold tabular-nums tracking-tight text-ink-50">
          {value}
        </span>
      </div>

      <div className="mt-5">
        <p className="text-sm font-semibold text-ink-100">{label}</p>
        <p className="mt-1 text-xs text-ink-400">{description}</p>
      </div>

      <ArrowRight
        size={16}
        className="absolute bottom-5 right-5 text-ink-500 opacity-0 transition group-hover:translate-x-1 group-hover:opacity-100"
      />
    </button>
  );
}

export function Dashboard({
  onNavigate,
  onOpenConversation,
}: DashboardProps) {
  const { session } = useAuth();

  const [profile, setProfile] = useState<ProfileSnippet | null>(null);
  const [servers, setServers] = useState<ServerWithMeta[]>([]);
  const [conversations, setConversations] = useState<DirectConversation[]>([]);
  const [friends, setFriends] = useState<FriendWithProfile[]>([]);
  const [pendingRequests, setPendingRequests] = useState(0);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');

  const userId = session?.user?.id;

  async function loadDashboard(isRefresh = false) {
    if (!userId) {
      setLoading(false);
      return;
    }

    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setLoadError('');

    const results = await Promise.allSettled([
      supabase
        .from('profiles')
        .select('username, display_name, avatar_url')
        .eq('id', userId)
        .maybeSingle(),

      fetchMyServers(userId),
      fetchMyConversations(),
      fetchFriends(),
      fetchFriendRequests(),
    ]);

    let failed = false;

    const profileResult = results[0];
    if (profileResult.status === 'fulfilled') {
      if (profileResult.value.error) {
        failed = true;
      } else {
        setProfile(profileResult.value.data);
      }
    } else {
      failed = true;
    }

    const serversResult = results[1];
    if (serversResult.status === 'fulfilled') {
      setServers(serversResult.value);
    } else {
      failed = true;
    }

    const conversationsResult = results[2];
    if (conversationsResult.status === 'fulfilled') {
      setConversations(conversationsResult.value);
    } else {
      failed = true;
    }

    const friendsResult = results[3];
    if (friendsResult.status === 'fulfilled') {
      setFriends(friendsResult.value);
    } else {
      failed = true;
    }

    const requestsResult = results[4];
    if (requestsResult.status === 'fulfilled') {
      setPendingRequests(requestsResult.value.length);
    } else {
      failed = true;
    }

    if (failed) {
      setLoadError('Some dashboard information could not be loaded.');
    }

    setLoading(false);
    setRefreshing(false);
  }

  useEffect(() => {
    void loadDashboard();

    // Dashboard data is refreshed when the signed-in account changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const metadata = session?.user?.user_metadata ?? {};

  const displayName =
    profile?.display_name ||
    (typeof metadata.display_name === 'string'
      ? metadata.display_name
      : null) ||
    profile?.username ||
    (typeof metadata.username === 'string'
      ? metadata.username
      : null) ||
    session?.user?.email?.split('@')[0] ||
    'there';

  const greeting = greetingForHour(new Date().getHours());

  const recentServers = servers.slice(0, 4);
  const recentConversations = conversations.slice(0, 4);
  const recentFriends = friends.slice(0, 5);

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-7 pb-6">
      {/* Welcome */}
      <header className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-ink-900/80 p-6 sm:p-8 lg:p-10">
        <div
          className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-primary-500/15 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-secondary-500/10 blur-3xl"
          aria-hidden
        />

        <div className="relative flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary-300">
              <Sparkles size={14} />
              AFTERDARK
            </div>

            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-ink-50 sm:text-4xl lg:text-5xl">
              {loading ? (
                <span className="inline-block h-10 w-64 animate-pulse rounded-xl bg-ink-800" />
              ) : (
                <>
                  {greeting},{' '}
                  <span className="text-primary-200">{displayName}</span>
                </>
              )}
            </h1>

            <p className="mt-3 max-w-xl text-sm leading-relaxed text-ink-400 sm:text-base">
              Your space after dark. Your communities, friends and conversations
              — all in one place.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void loadDashboard(true)}
              disabled={loading || refreshing}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm font-semibold text-ink-200 transition hover:bg-white/[0.08] disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={refreshing ? 'animate-spin' : ''}
              />
              Refresh
            </button>

            <button
              type="button"
              onClick={() => onNavigate('explore')}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-500/20 transition hover:bg-primary-400"
            >
              <Compass size={17} />
              Explore AFTERDARK
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </header>

      {loadError && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3">
          <p className="text-sm text-amber-200">{loadError}</p>
          <button
            type="button"
            onClick={() => void loadDashboard(true)}
            className="text-sm font-semibold text-amber-100 hover:text-white"
          >
            Try again
          </button>
        </div>
      )}

      {/* Overview */}
      <section>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-300">
              Your activity
            </p>
            <h2 className="mt-1 text-xl font-semibold text-ink-50">
              Overview
            </h2>
          </div>

          <span className="text-xs text-ink-500">
            Live account data
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard
            label="Servers"
            value={servers.length}
            description="Communities you joined"
            icon={Server}
            accent="from-primary-500/15 to-primary-600/[0.02]"
            iconColor="text-primary-300"
            onClick={() => onNavigate('servers')}
          />

          <MetricCard
            label="Conversations"
            value={conversations.length}
            description="Your private chats"
            icon={MessageSquare}
            accent="from-secondary-500/15 to-secondary-600/[0.02]"
            iconColor="text-secondary-300"
            onClick={() => onNavigate('messages')}
          />

          <MetricCard
            label="Friends"
            value={friends.length}
            description="People in your network"
            icon={Users}
            accent="from-accent-500/15 to-accent-600/[0.02]"
            iconColor="text-accent-300"
            onClick={() => onNavigate('explore')}
          />

          <MetricCard
            label="Friend requests"
            value={pendingRequests}
            description="Waiting for your response"
            icon={Bell}
            accent="from-primary-400/10 to-secondary-500/[0.04]"
            iconColor="text-primary-200"
            onClick={() => onNavigate('explore')}
          />
        </div>
      </section>

      {/* Main content */}
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.85fr)]">
        {/* Servers */}
        <section className="overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-900/70">
          <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-500/10">
                <Server size={18} className="text-primary-300" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-ink-100">
                  Your servers
                </h2>
                <p className="text-xs text-ink-500">
                  Your communities
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('servers')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary-300 transition hover:text-primary-200"
            >
              View all <ArrowRight size={14} />
            </button>
          </header>

          <div className="divide-y divide-white/[0.04]">
            {loading ? (
              <div className="space-y-3 p-5">
                {[1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="h-14 animate-pulse rounded-xl bg-ink-800/70"
                  />
                ))}
              </div>
            ) : recentServers.length > 0 ? (
              recentServers.map((server) => (
                <button
                  key={server.id}
                  type="button"
                  onClick={() => onNavigate('servers')}
                  className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-white/[0.025]"
                >
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/[0.08] bg-ink-800 text-sm font-bold text-ink-200"
                    style={{
                      borderColor: `${server.theme_color}55`,
                    }}
                  >
                    {server.icon_url ? (
                      <img
                        src={server.icon_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      getInitials(server.name)
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-100">
                      {server.name}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {server.member_count}{' '}
                      {server.member_count === 1 ? 'member' : 'members'}
                    </p>
                  </div>

                  <ArrowRight
                    size={16}
                    className="shrink-0 text-ink-500"
                  />
                </button>
              ))
            ) : (
              <div className="flex flex-col items-center px-5 py-10 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-800">
                  <Server size={21} className="text-ink-400" />
                </div>
                <h3 className="text-sm font-semibold text-ink-100">
                  No servers yet
                </h3>
                <p className="mt-1 max-w-xs text-xs leading-relaxed text-ink-500">
                  Join a community or create your own server to get started.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('servers')}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary-500/15 px-4 py-2 text-xs font-semibold text-primary-200 transition hover:bg-primary-500/25"
                >
                  <Plus size={14} />
                  Browse servers
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Conversations */}
        <section className="overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-900/70">
          <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-secondary-500/10">
                <MessageSquare size={18} className="text-secondary-300" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-ink-100">
                  Recent conversations
                </h2>
                <p className="text-xs text-ink-500">
                  Your latest chats
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigate('messages')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary-300 transition hover:text-primary-200"
            >
              Inbox <ArrowRight size={14} />
            </button>
          </header>

          <div className="divide-y divide-white/[0.04]">
            {loading ? (
              <div className="space-y-3 p-5">
                {[1, 2, 3].map((item) => (
                  <div
                    key={item}
                    className="h-14 animate-pulse rounded-xl bg-ink-800/70"
                  />
                ))}
              </div>
            ) : recentConversations.length > 0 ? (
              recentConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => onOpenConversation(conversation.id)}
                  className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-white/[0.025]"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary-500/10 ring-1 ring-secondary-400/15">
                    {conversation.kind === 'group' ? (
                      <Users size={18} className="text-secondary-300" />
                    ) : (
                      <MessageSquare size={18} className="text-secondary-300" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-100">
                      {conversation.title ||
                        (conversation.kind === 'group'
                          ? 'Group conversation'
                          : 'Direct message')}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-ink-500">
                      {formatDate(conversation.last_message_at)}
                    </p>
                  </div>

                  <ArrowRight
                    size={16}
                    className="shrink-0 text-ink-500"
                  />
                </button>
              ))
            ) : (
              <div className="flex flex-col items-center px-5 py-10 text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-800">
                  <MessageSquare size={21} className="text-ink-400" />
                </div>
                <h3 className="text-sm font-semibold text-ink-100">
                  No conversations yet
                </h3>
                <p className="mt-1 max-w-xs text-xs leading-relaxed text-ink-500">
                  Your private and group chats will appear here.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('messages')}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary-500/15 px-4 py-2 text-xs font-semibold text-primary-200 transition hover:bg-primary-500/25"
                >
                  <MessageSquare size={14} />
                  Open messages
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Friends */}
      <section className="overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-900/70">
        <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-500/10">
              <Users size={18} className="text-accent-300" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-ink-100">
                Your people
              </h2>
              <p className="text-xs text-ink-500">
                Friends on AFTERDARK
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('explore')}
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary-300 transition hover:text-primary-200"
          >
            Find people <ArrowRight size={14} />
          </button>
        </header>

        {loading ? (
          <div className="flex gap-4 overflow-hidden p-5">
            {[1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="w-20 shrink-0 animate-pulse">
                <div className="mx-auto h-12 w-12 rounded-full bg-ink-800" />
                <div className="mx-auto mt-2 h-3 w-14 rounded bg-ink-800" />
              </div>
            ))}
          </div>
        ) : recentFriends.length > 0 ? (
          <div className="flex flex-wrap gap-5 p-5">
            {recentFriends.map((friend) => {
              const name =
                friend.profile.display_name ||
                friend.profile.username ||
                'User';

              return (
                <div
                  key={friend.profile.id}
                  className="flex w-20 flex-col items-center gap-2 text-center"
                >
                  <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-white/[0.08] bg-ink-800 text-sm font-semibold text-ink-200">
                    {friend.profile.avatar_url ? (
                      <img
                        src={friend.profile.avatar_url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      getInitials(name)
                    )}
                  </div>
                  <span className="w-full truncate text-xs font-medium text-ink-300">
                    {name}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center px-5 py-9 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-800">
              <UserRound size={21} className="text-ink-400" />
            </div>
            <h3 className="text-sm font-semibold text-ink-100">
              Your network starts here
            </h3>
            <p className="mt-1 max-w-sm text-xs leading-relaxed text-ink-500">
              Find people, send friend requests and build your own community.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('explore')}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary-500/15 px-4 py-2 text-xs font-semibold text-primary-200 transition hover:bg-primary-500/25"
            >
              <Users size={14} />
              Find friends
            </button>
          </div>
        )}
      </section>

      {/* Shortcuts */}
      <section>
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-300">
            Get around
          </p>
          <h2 className="mt-1 text-xl font-semibold text-ink-50">
            Quick access
          </h2>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            {
              id: 'explore' as const,
              label: 'Explore',
              description: 'Discover AFTERDARK',
              icon: Compass,
            },
            {
              id: 'servers' as const,
              label: 'Servers',
              description: 'Your communities',
              icon: Server,
            },
            {
              id: 'messages' as const,
              label: 'Messages',
              description: 'Open your inbox',
              icon: MessageSquare,
            },
            {
              id: 'settings' as const,
              label: 'Settings',
              description: 'Customize your space',
              icon: Settings,
            },
          ].map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className="group flex min-w-0 items-center gap-3 rounded-2xl border border-white/[0.06] bg-ink-900/60 p-4 text-left transition hover:border-primary-400/25 hover:bg-ink-900"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-500/10 ring-1 ring-primary-400/15 transition group-hover:bg-primary-500/20">
                  <Icon size={19} className="text-primary-300" />
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink-100">
                    {item.label}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-ink-500">
                    {item.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
