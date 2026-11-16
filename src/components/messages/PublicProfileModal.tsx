import { useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays, ExternalLink, Loader2, MessageSquare, UserRound } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface PublicProfile {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  website_url: string | null;
  instagram_url: string | null;
  twitch_url: string | null;
  youtube_url: string | null;
  profile_theme: string | null;
  status_message: string | null;
  created_at: string;
}

interface PublicPost {
  id: string;
  body: string;
  image_url: string | null;
  media_type: string;
  created_at: string;
}

interface Props {
  userId: string;
  onClose: () => void;
  onMessage?: (userId: string) => void;
}

const themes: Record<string, string> = {
  blue: 'from-sky-500/30',
  violet: 'from-violet-500/30',
  crimson: 'from-rose-500/30',
  emerald: 'from-emerald-500/30',
  amber: 'from-amber-500/30',
};

export function PublicProfileModal({ userId, onClose, onMessage }: Props) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [posts, setPosts] = useState<PublicPost[]>([]);
  const [stats, setStats] = useState({ posts: 0, followers: 0, following: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [relationType, setRelationType] = useState<'followers' | 'following' | null>(null);
  const [relationProfiles, setRelationProfiles] = useState<Array<{ id: string; username: string; display_name: string | null; avatar_url: string | null }>>([]);
  const [relationLoading, setRelationLoading] = useState(false);
  const [relationError, setRelationError] = useState('');
  const [selectedRelatedProfileId, setSelectedRelatedProfileId] = useState<string | null>(null);
  const { session } = useAuth();
  const currentUserId = session?.user.id;

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const [profileResult, postsResult, postCount, followers, following, followResult] = await Promise.all([
        supabase.from('profiles').select('id, username, display_name, bio, avatar_url, banner_url, website_url, instagram_url, twitch_url, youtube_url, profile_theme, status_message, created_at').eq('id', userId).maybeSingle(),
        supabase.from('posts').select('id, body, image_url, media_type, created_at').eq('author_id', userId).is('server_id', null).order('created_at', { ascending: false }).limit(12),
        supabase.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', userId).is('server_id', null),
        supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', userId),
        supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', userId),
        currentUserId && currentUserId !== userId
          ? supabase.from('follows').select('follower_id').eq('follower_id', currentUserId).eq('following_id', userId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (!active) return;
      if (profileResult.error) setError(profileResult.error.message);
      else if (profileResult.data) setProfile(profileResult.data as PublicProfile);
      else setError('This profile could not be found or is not publicly available.');
      if (postsResult.error) setError(postsResult.error.message);
      else setPosts((postsResult.data ?? []) as PublicPost[]);
      setStats({ posts: postCount.count ?? 0, followers: followers.count ?? 0, following: following.count ?? 0 });
      setIsFollowing(Boolean(followResult.data));
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [userId, currentUserId]);


  const openRelationList = async (type: 'followers' | 'following') => {
    setRelationType(type);
    setRelationLoading(true);
    setRelationError('');
    setRelationProfiles([]);
    const column = type === 'followers' ? 'follower_id' : 'following_id';
    const { data: relationRows, error: relationQueryError } = await supabase
      .from('follows')
      .select(column)
      .eq(type === 'followers' ? 'following_id' : 'follower_id', userId)
      .order('created_at', { ascending: false });
    if (relationQueryError) {
      setRelationError(relationQueryError.message);
      setRelationLoading(false);
      return;
    }
    const ids = (relationRows ?? []).map((row) => row[column] as string);
    if (ids.length) {
      const { data, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', ids);
      if (profilesError) setRelationError(profilesError.message);
      else {
        const byId = new Map((data ?? []).map((person) => [person.id, person]));
        setRelationProfiles(ids.map((id) => byId.get(id)).filter((person): person is NonNullable<typeof person> => Boolean(person)));
      }
    }
    setRelationLoading(false);
  };

  const toggleFollow = async () => {
    if (!profile || !currentUserId || currentUserId === userId || followBusy) return;
    setFollowBusy(true);
    setError('');
    const result = isFollowing
      ? await supabase.from('follows').delete().eq('follower_id', currentUserId).eq('following_id', userId)
      : await supabase.from('follows').insert({ follower_id: currentUserId, following_id: userId });
    if (result.error) setError(result.error.message);
    else {
      setIsFollowing(!isFollowing);
      setStats((current) => ({ ...current, followers: Math.max(0, current.followers + (isFollowing ? -1 : 1)) }));
    }
    setFollowBusy(false);
  };

  const links = profile ? [
    ['Website', profile.website_url],
    ['Instagram', profile.instagram_url],
    ['Twitch', profile.twitch_url],
    ['YouTube', profile.youtube_url],
  ].filter((item): item is [string, string] => Boolean(item[1])) : [];

  const name = profile?.display_name || profile?.username || 'Member';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label="Public profile" onClick={(event) => event.stopPropagation()} className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-ink-950 shadow-2xl">
        <header className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
          <button onClick={onClose} className="inline-flex items-center gap-2 text-sm text-ink-300 hover:text-white"><ArrowLeft size={17} /> Back</button>
          <span className="text-xs font-semibold uppercase tracking-widest text-ink-500">AFTERDARK profile</span>
        </header>
        <div className="overflow-y-auto">
          {loading ? <div className="flex items-center justify-center gap-3 py-24 text-sm text-ink-400"><Loader2 size={18} className="animate-spin" /> Loading profile…</div> : error ? <p role="alert" className="m-5 rounded-xl bg-red-400/10 p-4 text-sm text-red-200">{error}</p> : profile && <>
            <div className={`relative h-36 bg-gradient-to-br ${themes[profile.profile_theme ?? 'blue'] ?? themes.blue} via-ink-900 to-ink-950 sm:h-48`}>
              {profile.banner_url && <img src={profile.banner_url} alt="" className="h-full w-full object-cover" />}
            </div>
            <div className="px-5 pb-6">
              <div className="-mt-12 flex flex-wrap items-end gap-4">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl border-4 border-ink-950 bg-ink-800 text-2xl font-bold text-white">
                  {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : name.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <h2 className="truncate text-2xl font-bold text-white">{name}</h2>
                  <p className="text-sm text-ink-400">@{profile.username}</p>
                </div>
                {currentUserId && currentUserId !== userId && <button onClick={() => void toggleFollow()} disabled={followBusy} className={`mb-1 rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${isFollowing ? 'border-white/10 bg-white/[0.06] text-ink-200 hover:bg-red-500/10 hover:text-red-200' : 'border-primary-400/30 bg-primary-500/15 text-primary-200 hover:bg-primary-500/25'}`}>{followBusy ? 'Please wait…' : isFollowing ? 'Following' : 'Follow'}</button>}
                {onMessage && <button onClick={() => onMessage(userId)} className="mb-1 inline-flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-400"><MessageSquare size={16} /> Message</button>}
              </div>
              {profile.status_message && <p className="mt-4 inline-flex rounded-full border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-ink-300">{profile.status_message}</p>}
              {profile.bio && <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-ink-200">{profile.bio}</p>}
              <div className="mt-5 grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3 text-center"><p className="text-lg font-bold text-white">{stats.posts}</p><p className="text-xs text-ink-500">Posts</p></div>
                <button type="button" onClick={() => void openRelationList('followers')} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3 text-center transition hover:border-primary-400/30 hover:bg-primary-500/[0.07]"><p className="text-lg font-bold text-white">{stats.followers}</p><p className="text-xs text-ink-400">Followers</p></button>
                <button type="button" onClick={() => void openRelationList('following')} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3 text-center transition hover:border-primary-400/30 hover:bg-primary-500/[0.07]"><p className="text-lg font-bold text-white">{stats.following}</p><p className="text-xs text-ink-400">Following</p></button>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-ink-500"><span className="inline-flex items-center gap-1"><CalendarDays size={14} /> Joined {new Date(profile.created_at).toLocaleDateString()}</span></div>
              {links.length > 0 && <div className="mt-5 flex flex-wrap gap-2">{links.map(([label, url]) => <a key={label} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-ink-200 hover:bg-white/[0.06]">{label}<ExternalLink size={12} /></a>)}</div>}
              <div className="mt-7 border-t border-white/[0.07] pt-5">
                <h3 className="mb-4 text-sm font-semibold text-white">Recent posts</h3>
                {posts.length ? <div className="grid gap-3 sm:grid-cols-2">{posts.map((post) => <article key={post.id} className="overflow-hidden rounded-xl border border-white/[0.07] bg-ink-900/70">{post.image_url && <img src={post.image_url} alt="" className="max-h-64 w-full object-cover" />}{post.body && <p className="whitespace-pre-wrap p-4 text-sm leading-6 text-ink-200">{post.body}</p>}<p className="px-4 pb-3 text-[11px] text-ink-500">{new Date(post.created_at).toLocaleString()}</p></article>)}</div> : <div className="rounded-xl border border-dashed border-white/10 py-10 text-center text-sm text-ink-500"><UserRound size={22} className="mx-auto mb-2" />No public posts yet.</div>}
              </div>
            </div>
          </>}
        </div>
      </section>
      {relationType && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setRelationType(null)}>
          <section role="dialog" aria-modal="true" aria-label={relationType === 'followers' ? 'Followers' : 'Following'} onClick={(event) => event.stopPropagation()} className="flex max-h-[75vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-950 shadow-2xl">
            <header className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
              <h3 className="font-semibold text-white">{relationType === 'followers' ? 'Followers' : 'Following'} <span className="text-ink-500">({relationProfiles.length})</span></h3>
              <button type="button" onClick={() => setRelationType(null)} className="rounded-lg px-2 py-1 text-sm text-ink-400 hover:bg-white/10 hover:text-white">Close</button>
            </header>
            <div className="overflow-y-auto p-3">
              {relationLoading ? <div className="flex items-center justify-center gap-2 py-10 text-sm text-ink-400"><Loader2 size={17} className="animate-spin" /> Loading people…</div>
                : relationError ? <p role="alert" className="p-4 text-sm text-red-300">{relationError}</p>
                : relationProfiles.length ? <div className="space-y-1">{relationProfiles.map((person) => <button key={person.id} type="button" onClick={() => setSelectedRelatedProfileId(person.id)} className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition hover:bg-white/[0.06]">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink-800 text-sm font-semibold text-primary-200">{person.avatar_url ? <img src={person.avatar_url} alt="" className="h-full w-full object-cover" /> : (person.display_name || person.username).slice(0, 1).toUpperCase()}</div>
                    <div className="min-w-0"><p className="truncate text-sm font-semibold text-ink-100">{person.display_name || person.username}</p><p className="truncate text-xs text-ink-500">@{person.username}</p></div>
                  </button>)}</div>
                : <p className="py-10 text-center text-sm text-ink-500">No {relationType} yet.</p>}
            </div>
          </section>
        </div>
      )}
      {selectedRelatedProfileId && <PublicProfileModal userId={selectedRelatedProfileId} onClose={() => setSelectedRelatedProfileId(null)} />}
    </div>
  );
}
