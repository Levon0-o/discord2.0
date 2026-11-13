import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  Compass, Flame, Globe2, Heart, Loader2, Search, Send, Sparkles,
  Users, Video, X, UserPlus, Check, RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { searchUsers, sendFriendRequest } from '@/lib/friendsApi';
import type { ProfileLite } from '@/types/servers';

type ExploreTab = 'for-you' | 'trending' | 'videos' | 'people';

interface ExploreAuthor {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface ExplorePost {
  id: string;
  author_id: string;
  body: string;
  image_url: string | null;
  media_type: 'text' | 'image' | 'video';
  created_at: string;
  author: ExploreAuthor | null;
  likes: { user_id: string }[];
  comments: { id: string }[];
}

function authorName(author: ExploreAuthor | null) {
  return author?.display_name || author?.username || 'AFTERDARK user';
}

function initials(value: string) {
  return value.trim().slice(0, 2).toUpperCase() || 'AD';
}

function age(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export function ExploreSection() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [tab, setTab] = useState<ExploreTab>('for-you');
  const [posts, setPosts] = useState<ExplorePost[]>([]);
  const [people, setPeople] = useState<ProfileLite[]>([]);
  const [search, setSearch] = useState('');
  const [postSearch, setPostSearch] = useState('');
  const [appliedPostSearch, setAppliedPostSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [busyLike, setBusyLike] = useState<string | null>(null);
  const [busyPeople, setBusyPeople] = useState<string | null>(null);
  const [sentRequests, setSentRequests] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadPosts = useCallback(async (refresh = false, searchTerm = '') => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    const { data, error: queryError } = await supabase
      .from('posts')
      .select('id, author_id, body, image_url, media_type, created_at, author:profiles!posts_author_id_fkey(username, display_name, avatar_url), likes(user_id), comments(id)')
      .is('server_id', null)
      .ilike('body', `%${searchTerm.replace(/[\\%_]/g, '\\      .is('server_id', null)
      .order('created_at', { ascending: false })')}%`)
      .order('created_at', { ascending: false })
      .limit(80);
    if (queryError) setError(queryError.message);
    else setPosts((data ?? []) as unknown as ExplorePost[]);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void loadPosts(false, appliedPostSearch);
    const channel = supabase
      .channel('explore-global-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => { void loadPosts(true, appliedPostSearch); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, () => { void loadPosts(true, appliedPostSearch); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadPosts, appliedPostSearch]);

  useEffect(() => {
    let active = true;
    if (tab !== 'people' || search.trim().length < 3) {
      setPeople([]);
      return;
    }
    const run = async () => {
      try {
        const results = await searchUsers(search);
        if (active) setPeople(results);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Could not search users.');
      }
    };
    void run();
    return () => { active = false; };
  }, [search, tab]);

  const visiblePosts = useMemo(() => {
    let result = [...posts];
    if (tab === 'videos') result = result.filter((post) => post.media_type === 'video');
    if (tab === 'trending') result.sort((a, b) => b.likes.length - a.likes.length || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return result;
  }, [posts, tab]);

  const publish = async () => {
    if (!userId || publishing || (!draft.trim() && !videoFile)) return;
    setPublishing(true);
    setError('');
    let mediaUrl: string | null = null;
    let mediaType: 'text' | 'video' = 'text';

    if (videoFile) {
      const extension = videoFile.name.split('.').pop()?.toLowerCase() || 'mp4';
      const path = `${userId}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('explore-videos').upload(path, videoFile, {
        contentType: videoFile.type,
        upsert: false,
      });
      if (uploadError) {
        setError(uploadError.message);
        setPublishing(false);
        return;
      }
      mediaUrl = supabase.storage.from('explore-videos').getPublicUrl(path).data.publicUrl;
      mediaType = 'video';
    }

    const { error: insertError } = await supabase.from('posts').insert({
      body: draft.trim(),
      image_url: mediaUrl,
      media_type: mediaType,
    });
    if (insertError) setError(insertError.message);
    else {
      setDraft('');
      setVideoFile(null);
      const picker = document.getElementById('explore-video-picker') as HTMLInputElement | null;
      if (picker) picker.value = '';
      await loadPosts(true, appliedPostSearch);
    }
    setPublishing(false);
  };

  const handleVideo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    if (!['video/mp4', 'video/webm', 'video/quicktime'].includes(file.type)) {
      setError('Choose an MP4, WebM or MOV video.');
      event.target.value = '';
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setError('Videos must be 100 MB or smaller.');
      event.target.value = '';
      return;
    }
    setError('');
    setVideoFile(file);
  };

  const toggleLike = async (post: ExplorePost) => {
    if (!userId || busyLike) return;
    setBusyLike(post.id);
    const liked = post.likes.some((like) => like.user_id === userId);
    const result = liked
      ? await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', userId)
      : await supabase.from('likes').insert({ post_id: post.id, user_id: userId });
    if (result.error) setError(result.error.message);
    else await loadPosts(true);
    setBusyLike(null);
  };

  const addPerson = async (person: ProfileLite) => {
    if (busyPeople) return;
    setBusyPeople(person.id);
    try {
      await sendFriendRequest(person.id);
      setSentRequests((current) => [...current, person.id]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send friend request.');
    }
    setBusyPeople(null);
  };

  const tabs: { id: ExploreTab; label: string; icon: typeof Compass }[] = [
    { id: 'for-you', label: 'For you', icon: Sparkles },
    { id: 'trending', label: 'Trending', icon: Flame },
    { id: 'videos', label: 'Videos', icon: Video },
    { id: 'people', label: 'People', icon: Users },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="relative overflow-hidden rounded-3xl border border-primary-400/15 bg-gradient-to-br from-primary-500/15 via-ink-900 to-ink-950 p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full bg-primary-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary-300"><Globe2 size={14} /> The world, uncensored by borders</div>
            <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Explore<span className="text-primary-300">.</span></h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-ink-300">Discover posts, short videos and people from across AFTERDARK.</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs text-ink-300"><Users size={14} /> Global community</div>
        </div>
      </header>

      <nav className="flex gap-2 overflow-x-auto rounded-2xl border border-white/[0.06] bg-ink-900/60 p-2">
        {tabs.map((item) => {
          const Icon = item.icon;
          return <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${tab === item.id ? 'bg-primary-500 text-white shadow-lg shadow-primary-950/30' : 'text-ink-400 hover:bg-white/[0.05] hover:text-ink-100'}`}><Icon size={16} />{item.label}</button>;
        })}
        <button type="button" onClick={() => void loadPosts(true)} disabled={refreshing} className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs text-ink-400 hover:bg-white/[0.05]"><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />Refresh</button>
      </nav>

      {tab !== 'people' && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedPostSearch(postSearch.trim());
          }}
          className="flex flex-col gap-2 rounded-2xl border border-white/[0.07] bg-ink-900/65 p-3 sm:flex-row"
        >
          <div className="relative min-w-0 flex-1">
            <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-500" />
            <input
              value={postSearch}
              onChange={(event) => setPostSearch(event.target.value)}
              placeholder="Search posts and video descriptions..."
              aria-label="Search posts and videos by description"
              className="w-full rounded-xl border border-white/[0.08] bg-ink-950/70 py-3 pl-11 pr-4 text-sm text-ink-100 outline-none placeholder:text-ink-500 focus:border-primary-400/40"
            />
          </div>
          <button type="submit" className="rounded-xl bg-primary-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-400">
            Search
          </button>
          {appliedPostSearch && (
            <button
              type="button"
              onClick={() => {
                setPostSearch('');
                setAppliedPostSearch('');
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm text-ink-300 transition hover:bg-white/[0.05]"
            >
              <X size={15} /> Clear
            </button>
          )}
        </form>
      )}

      {tab !== 'people' && (
        <section className="rounded-2xl border border-white/[0.07] bg-ink-900/65 p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-500/15 text-primary-300"><Send size={17} /></div><div><h2 className="text-sm font-semibold text-ink-100">Share with the world</h2><p className="text-xs text-ink-500">Post an update or upload a short video.</p></div></div>
          <textarea value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 2000))} rows={3} maxLength={2000} placeholder="What's happening?" className="w-full resize-y rounded-xl border border-white/[0.07] bg-ink-950/70 px-4 py-3 text-sm text-ink-100 outline-none placeholder:text-ink-500 focus:border-primary-400/40" />
          {videoFile && <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-primary-500/10 px-3 py-2 text-xs text-primary-200"><span className="min-w-0 truncate">{videoFile.name} · {(videoFile.size / 1024 / 1024).toFixed(1)} MB</span><button type="button" onClick={() => setVideoFile(null)} aria-label="Remove video"><X size={15} /></button></div>}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-xs font-semibold text-ink-300 transition hover:bg-white/[0.05]"><Video size={15} /> Add video<input id="explore-video-picker" type="file" accept="video/mp4,video/webm,video/quicktime" onChange={handleVideo} className="hidden" /></label>
            <div className="flex items-center gap-3"><span className="text-xs text-ink-500">{draft.length}/2000</span><button type="button" onClick={() => void publish()} disabled={publishing || (!draft.trim() && !videoFile)} className="inline-flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-400 disabled:opacity-40">{publishing ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}{publishing ? 'Uploading…' : 'Publish'}</button></div>
          </div>
          <p className="mt-2 text-[11px] text-ink-500">MP4, WebM or MOV · max 100 MB</p>
        </section>
      )}

      {error && <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}<button type="button" onClick={() => setError('')} aria-label="Dismiss"><X size={15} /></button></div>}

      {tab === 'people' ? (
        <section className="space-y-4">
          <div className="relative"><Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search usernames (at least 3 characters)" className="w-full rounded-2xl border border-white/[0.08] bg-ink-900/70 py-3.5 pl-11 pr-4 text-sm text-ink-100 outline-none placeholder:text-ink-500 focus:border-primary-400/40" /></div>
          {search.trim().length < 3 ? <p className="rounded-2xl border border-white/[0.06] bg-ink-900/50 p-8 text-center text-sm text-ink-500">Search for people by username to find your next community.</p> : people.length === 0 ? <p className="rounded-2xl border border-white/[0.06] bg-ink-900/50 p-8 text-center text-sm text-ink-500">No users found. Try another username.</p> : <div className="grid gap-3 sm:grid-cols-2">{people.map((person) => { const name = person.display_name || person.username; const sent = sentRequests.includes(person.id); return <article key={person.id} className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-ink-900/65 p-4"><div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink-800 text-xs font-bold text-ink-200">{person.avatar_url ? <img src={person.avatar_url} alt="" className="h-full w-full object-cover" /> : initials(name)}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink-100">{name}</p><p className="truncate text-xs text-ink-500">@{person.username}</p></div><button type="button" onClick={() => void addPerson(person)} disabled={sent || busyPeople === person.id} className="inline-flex items-center gap-2 rounded-xl bg-primary-500/15 px-3 py-2 text-xs font-semibold text-primary-200 hover:bg-primary-500/25 disabled:opacity-50">{sent ? <Check size={14} /> : <UserPlus size={14} />}{sent ? 'Sent' : 'Add'}</button></article>; })}</div>}
        </section>
      ) : loading ? (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-white/[0.06] bg-ink-900/50 py-16 text-sm text-ink-400"><Loader2 size={18} className="animate-spin" />Loading the world…</div>
      ) : visiblePosts.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-ink-900/50 px-6 py-16 text-center"><Compass size={30} className="mx-auto text-ink-500" /><h3 className="mt-3 text-base font-semibold text-ink-100">Nothing here yet</h3><p className="mt-1 text-sm text-ink-500">{appliedPostSearch ? `No posts or videos match "${appliedPostSearch}". Try another phrase.` : tab === 'videos' ? 'The first short video on AFTERDARK could be yours.' : 'Be one of the first people to share something with the community.'}</p></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {visiblePosts.map((post) => {
            const name = authorName(post.author);
            const liked = Boolean(userId && post.likes.some((like) => like.user_id === userId));
            return <article key={post.id} className="overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-900/65">
              <div className="flex items-center gap-3 p-4"><div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink-800 text-xs font-bold text-ink-200">{post.author?.avatar_url ? <img src={post.author.avatar_url} alt="" className="h-full w-full object-cover" /> : initials(name)}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink-100">{name}</p><p className="text-xs text-ink-500">@{post.author?.username || 'user'} · {age(post.created_at)}</p></div>{post.media_type === 'video' && <span className="rounded-full bg-primary-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary-200">Video</span>}</div>
              {post.media_type === 'video' && post.image_url && <video src={post.image_url} controls playsInline preload="metadata" className="max-h-[560px] w-full bg-black object-contain" />}
              {post.media_type === 'image' && post.image_url && <img src={post.image_url} alt="Post media" loading="lazy" className="max-h-[560px] w-full object-cover" />}
              {post.body && <p className="whitespace-pre-wrap break-words px-4 py-3 text-sm leading-6 text-ink-200">{post.body}</p>}
              <div className="flex items-center border-t border-white/[0.05] px-3 py-2"><button type="button" onClick={() => void toggleLike(post)} disabled={busyLike === post.id} aria-pressed={liked} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition hover:bg-white/[0.05] ${liked ? 'text-rose-300' : 'text-ink-400 hover:text-ink-100'}`}><Heart size={16} className={liked ? 'fill-current' : ''} />{post.likes.length} likes</button><span className="ml-2 text-xs text-ink-500">{post.comments.length} comments</span></div>
            </article>;
          })}
        </div>
      )}
    </div>
  );
}
