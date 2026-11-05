import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Compass,
  MessageSquare,
  Plus,
  Server,
  Sparkles,
  Users,
  FileText,
  Bell,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/cn';
import type { SectionId } from '@/config/navigation';

interface DashboardProps {
  onNavigate: (id: SectionId) => void;
}

interface ProfileSnippet {
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

const OVERVIEW_CARDS = [
  {
    key: 'servers',
    label: 'Servers',
    description: 'Communities you belong to',
    icon: Server,
    value: 0,
    accent: 'from-primary-500/20 to-primary-600/5',
    iconClass: 'text-primary-300',
  },
  {
    key: 'conversations',
    label: 'Conversations',
    description: 'Active private chats',
    icon: MessageSquare,
    value: 0,
    accent: 'from-secondary-500/20 to-secondary-600/5',
    iconClass: 'text-secondary-300',
  },
  {
    key: 'posts',
    label: 'Your posts',
    description: 'Shared with your network',
    icon: FileText,
    value: 0,
    accent: 'from-accent-500/20 to-accent-600/5',
    iconClass: 'text-accent-300',
  },
  {
    key: 'notifications',
    label: 'Notifications',
    description: 'Unread activity',
    icon: Bell,
    value: 0,
    accent: 'from-primary-400/15 to-secondary-500/10',
    iconClass: 'text-primary-200',
  },
] as const;

const QUICK_ACTIONS: {
  id: SectionId;
  label: string;
  description: string;
  icon: typeof Compass;
}[] = [
  {
    id: 'explore',
    label: 'Explore',
    description: 'Discover people and servers',
    icon: Compass,
  },
  {
    id: 'servers',
    label: 'Join or create',
    description: 'Find your next community',
    icon: Users,
  },
  {
    id: 'messages',
    label: 'Messages',
    description: 'Start a conversation',
    icon: MessageSquare,
  },
  {
    id: 'profile',
    label: 'Your profile',
    description: 'Edit how you appear',
    icon: Sparkles,
  },
];

function greetingForHour(hour: number): string {
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 22) return 'Good evening';
  return 'Good night';
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const { session } = useAuth();
  const [profile, setProfile] = useState<ProfileSnippet | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const userId = session?.user?.id;

    async function loadProfile() {
      if (!userId) {
        setProfileLoading(false);
        return;
      }

      setProfileLoading(true);
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('username, display_name, avatar_url')
          .eq('id', userId)
          .maybeSingle();

        if (cancelled) return;
        if (error) {
          console.error('Dashboard profile load:', error.message);
          setProfile(null);
        } else {
          setProfile(data);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Dashboard profile load failed', err);
          setProfile(null);
        }
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    }

    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const metadata = session?.user?.user_metadata ?? {};
  const displayName =
    profile?.display_name ||
    (typeof metadata.display_name === 'string' ? metadata.display_name : null) ||
    profile?.username ||
    (typeof metadata.username === 'string' ? metadata.username : null) ||
    session?.user?.email?.split('@')[0] ||
    'there';

  const hour = new Date().getHours();
  const greeting = greetingForHour(hour);

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <header className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-900/80 p-6 sm:p-8">
        <div
          className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary-500/10 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-20 left-1/3 h-40 w-40 rounded-full bg-secondary-500/10 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-300/90">
              Home
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink-50 sm:text-3xl">
              {profileLoading ? (
                <span className="inline-block h-8 w-48 animate-pulse rounded-lg bg-ink-800" />
              ) : (
                <>
                  {greeting}, <span className="text-primary-200">{displayName}</span>
                </>
              )}
            </h1>
            <p className="mt-2 max-w-lg text-sm leading-relaxed text-ink-400">
              Your space after dark. Activity, communities, and conversations will show up here as
              you start exploring AFTERDARK.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('explore')}
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary-500/20 transition hover:bg-primary-400 sm:self-auto"
          >
            <Compass size={16} />
            Explore
            <ArrowRight size={16} className="opacity-80" />
          </button>
        </div>
      </header>

      {/* Activity overview */}
      <section aria-labelledby="overview-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="overview-heading" className="text-sm font-semibold text-ink-200">
            Activity overview
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {OVERVIEW_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.key}
                className={cn(
                  'panel relative overflow-hidden p-4 transition-colors hover:border-white/[0.1]',
                  `bg-gradient-to-br ${card.accent}`
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink-950/50 ring-1 ring-white/[0.06]">
                    <Icon size={18} className={card.iconClass} />
                  </div>
                  <span className="text-2xl font-semibold tabular-nums tracking-tight text-ink-50">
                    {card.value}
                  </span>
                </div>
                <p className="mt-3 text-sm font-medium text-ink-100">{card.label}</p>
                <p className="mt-0.5 text-xs text-ink-400">{card.description}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Quick actions */}
      <section aria-labelledby="actions-heading">
        <h2 id="actions-heading" className="mb-3 text-sm font-semibold text-ink-200">
          Quick actions
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                type="button"
                onClick={() => onNavigate(action.id)}
                className="panel group flex items-center gap-4 p-4 text-left transition-all duration-200 hover:border-primary-400/25 hover:bg-ink-900"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-500/10 ring-1 ring-primary-400/20 transition group-hover:bg-primary-500/20">
                  <Icon size={20} className="text-primary-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-100 group-hover:text-primary-100">
                    {action.label}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-400">{action.description}</p>
                </div>
                <ArrowRight
                  size={16}
                  className="shrink-0 text-ink-500 transition group-hover:translate-x-0.5 group-hover:text-primary-300"
                />
              </button>
            );
          })}
        </div>
      </section>

      {/* Recently visited servers */}
      <section aria-labelledby="servers-heading" className="panel overflow-hidden">
        <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div className="flex items-center gap-2">
            <Server size={16} className="text-secondary-300" />
            <h2 id="servers-heading" className="text-sm font-semibold text-ink-100">
              Recently visited servers
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('servers')}
            className="text-xs font-medium text-primary-300 transition hover:text-primary-200"
          >
            View all
          </button>
        </header>
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-800 ring-1 ring-white/[0.06]">
            <Users size={24} className="text-secondary-300" />
          </div>
          <h3 className="text-base font-semibold text-ink-100">No servers yet</h3>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-400">
            Join a public community or create your own. Servers you visit will appear here for quick
            access.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('servers')}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary-500/15 px-4 py-2.5 text-sm font-semibold text-primary-200 ring-1 ring-primary-400/25 transition hover:bg-primary-500/25"
          >
            <Plus size={16} />
            Browse servers
          </button>
        </div>
      </section>

      {/* Recent conversations */}
      <section aria-labelledby="conversations-heading" className="panel overflow-hidden">
        <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div className="flex items-center gap-2">
            <MessageSquare size={16} className="text-secondary-300" />
            <h2 id="conversations-heading" className="text-sm font-semibold text-ink-100">
              Recent conversations
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('messages')}
            className="text-xs font-medium text-primary-300 transition hover:text-primary-200"
          >
            Open inbox
          </button>
        </header>
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-800 ring-1 ring-white/[0.06]">
            <MessageSquare size={24} className="text-secondary-300" />
          </div>
          <h3 className="text-base font-semibold text-ink-100">No conversations yet</h3>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-400">
            Direct messages and group chats will show up here. Reach out to someone to get started.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('messages')}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary-500/15 px-4 py-2.5 text-sm font-semibold text-primary-200 ring-1 ring-primary-400/25 transition hover:bg-primary-500/25"
          >
            <MessageSquare size={16} />
            Go to messages
          </button>
        </div>
      </section>

      {/* Latest posts preview */}
      <section aria-labelledby="posts-heading" className="panel overflow-hidden">
        <header className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-secondary-300" />
            <h2 id="posts-heading" className="text-sm font-semibold text-ink-100">
              Latest from your network
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('explore')}
            className="text-xs font-medium text-primary-300 transition hover:text-primary-200"
          >
            Discover
          </button>
        </header>
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-800 ring-1 ring-white/[0.06]">
            <Sparkles size={24} className="text-secondary-300" />
          </div>
          <h3 className="text-base font-semibold text-ink-100">Your feed is quiet</h3>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-400">
            Follow people and join servers to see posts here. Until then, explore what’s happening on
            AFTERDARK.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('explore')}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary-500/15 px-4 py-2.5 text-sm font-semibold text-primary-200 ring-1 ring-primary-400/25 transition hover:bg-primary-500/25"
          >
            <Compass size={16} />
            Explore posts
          </button>
        </div>
      </section>
    </div>
  );
}
