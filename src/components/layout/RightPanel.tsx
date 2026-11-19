import { useEffect, useMemo, useState } from 'react';
import { Users, UserRound, RefreshCw, Circle } from 'lucide-react';
import { PublicProfileModal } from '@/components/messages/PublicProfileModal';
import { useAuth } from '@/contexts/AuthContext';
import { fetchFriends, type FriendWithProfile } from '@/lib/friendsApi';
import { supabase } from '@/lib/supabase';
import type { SectionId } from '@/config/navigation';

interface RightPanelProps {
  onNavigate: (id: SectionId) => void;
}

export function RightPanel({ onNavigate }: RightPanelProps) {
  const { session, presence } = useAuth();
  const [friends, setFriends] = useState<FriendWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewingProfileId, setViewingProfileId] = useState<string | null>(null);
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) {
      setFriends([]);
      setLoading(false);
      return;
    }

    let active = true;
    const loadFriends = async () => {
      try {
        const rows = await fetchFriends();
        if (active) {
          setFriends(rows);
          setError('');
        }
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Could not load your friends.');
      } finally {
        if (active) setLoading(false);
      }
    };

    setLoading(true);
    void loadFriends();

    const channel = supabase
      .channel('right-panel-friends:' + userId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests', filter: 'sender_id=eq.' + userId }, () => { void loadFriends(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests', filter: 'receiver_id=eq.' + userId }, () => { void loadFriends(); })
      .subscribe();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') void loadFriends();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      active = false;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const activeFriends = useMemo(
    () => friends
      .filter((friend) => presence[friend.profile.id] === 'online' || presence[friend.profile.id] === 'idle')
      .sort((a, b) => {
        const aOnline = presence[a.profile.id] === 'online' ? 0 : 1;
        const bOnline = presence[b.profile.id] === 'online' ? 0 : 1;
        return aOnline - bOnline || (a.profile.display_name || a.profile.username).localeCompare(b.profile.display_name || b.profile.username);
      })
      .slice(0, 7),
    [friends, presence],
  );

  return (
    <aside className="sticky top-6 hidden w-72 shrink-0 space-y-4 self-start xl:block">
      <section className="panel overflow-hidden">
        <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300"><Users size={16} /></span>
            <div>
              <h2 className="text-sm font-semibold text-ink-100">Friends online</h2>
              <p className="text-[10px] text-ink-500">{activeFriends.length} active now</p>
            </div>
          </div>
          <button type="button" onClick={() => onNavigate('explore')} className="text-[10px] font-semibold text-primary-300 transition hover:text-primary-200">Find people</button>
        </header>

        {loading ? (
          <div className="flex items-center gap-2 px-4 py-5 text-xs text-ink-500"><RefreshCw size={13} className="animate-spin" /> Loading friends…</div>
        ) : error ? (
          <div className="px-4 py-5">
            <p role="alert" className="text-xs text-red-300">{error}</p>
            <button type="button" onClick={() => { setLoading(true); void fetchFriends().then(setFriends).catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load your friends.')).finally(() => setLoading(false)); }} className="mt-2 text-xs font-semibold text-primary-300 hover:text-primary-200">Try again</button>
          </div>
        ) : activeFriends.length ? (
          <div className="divide-y divide-white/[0.045]">
            {activeFriends.map(({ profile }) => {
              const status = presence[profile.id];
              const label = profile.display_name || profile.username;
              return (
                <button key={profile.id} type="button" onClick={() => setViewingProfileId(profile.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.035]">
                  <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/[0.08] bg-ink-800 text-xs font-semibold text-ink-200">
                    {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : (label.slice(0, 2).toUpperCase() || 'AD')}
                    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-ink-900 bg-emerald-400" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-ink-100">{label}</span>
                    <span className="block truncate text-[10px] text-ink-500">{profile.status_message || (status === 'online' ? 'Online' : 'Away')}</span>
                  </span>
                  <Circle size={7} fill="currentColor" className={status === 'online' ? 'text-emerald-400' : 'text-amber-300'} />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-6 text-center">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04] text-ink-500"><UserRound size={18} /></span>
            <p className="mt-3 text-xs font-medium text-ink-300">{friends.length ? 'No friends online right now' : 'Your network starts here'}</p>
            <p className="mt-1 text-[10px] leading-relaxed text-ink-500">{friends.length ? 'Your friends will show up here when they are active.' : 'Find people and build your AFTERDARK network.'}</p>
            <button type="button" onClick={() => onNavigate('explore')} className="mt-3 rounded-lg border border-primary-400/20 px-3 py-2 text-[10px] font-semibold text-primary-200 transition hover:bg-primary-500/10">Explore people</button>
          </div>
        )}
        {activeFriends.length > 0 && <p className="border-t border-white/[0.06] px-4 py-3 text-[10px] text-ink-600">Select someone to view their profile.</p>}
      </section>

      {viewingProfileId && <PublicProfileModal userId={viewingProfileId} onClose={() => setViewingProfileId(null)} />}
    </aside>
  );
}
