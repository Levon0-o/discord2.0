import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  Compass, Flame, Globe2, Heart, Loader2, Search, Send, Sparkles, MessageCircle,
  Users, Video, X, UserPlus, Check, RefreshCw, ArrowLeft, CalendarDays, Pencil, Trash2, Bookmark, Pin, ExternalLink,
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

interface ExploreComment {
  id: string;
  author_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  author: ExploreAuthor | null;
}

interface ExploreProfile {
  id: string;
  username: string;
  display_name: string | null;
  bio: string;
  avatar_url: string | null;
  banner_url: string | null;
  website_url: string | null;
  instagram_url: string | null;
  twitch_url: string | null;
  youtube_url: string | null;
  created_at: string;
}

interface ExploreProfilePost {
  id: string;
  body: string;
  image_url: string | null;
  media_type: 'text' | 'image' | 'video';
  created_at: string;
  is_pinned: boolean;
  likes: { user_id: string }[];
  comments: { id: string }[];
}

interface ExplorePost {
  id: string;
  author_id: string;
  body: string;
  image_url: string | null;
  media_type: 'text' | 'image' | 'video';
  created_at: string;
  is_pinned: boolean;
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
  const [savedPostIds, setSavedPostIds] = useState<string[]>([]);
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
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, ExploreComment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [commentBusy, setCommentBusy] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [postEditDraft, setPostEditDraft] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentEditDraft, setCommentEditDraft] = useState('');
  const [contentBusy, setContentBusy] = useState<string | null>(null);
  const [profile, setProfile] = useState<ExploreProfile | null>(null);
  const [profilePosts, setProfilePosts] = useState<ExploreProfilePost[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileStats, setProfileStats] = useState({ followers: 0, following: 0 });
  const [isFollowing, setIsFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadPosts = useCallback(async (refresh = false, searchTerm = '', trending = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    let query = supabase
      .from('posts')
      .select('id, author_id, body, image_url, media_type, created_at, is_pinned, author:profiles!posts_author_id_fkey(username, display_name, avatar_url), likes(user_id), comments(id)')
      .is('server_id', null)
      .ilike('body', `%${searchTerm}%`);
    if (trending) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('created_at', sevenDaysAgo);
    }
    const { data, error: queryError } = await query
      .order('created_at', { ascending: false })
      .limit(trending ? 200 : 80);
    if (queryError) setError(queryError.message);
    else setPosts((data ?? []) as unknown as ExplorePost[]);
    if (userId) {
      const { data: savedRows, error: savedError } = await supabase.from('saved_posts').select('post_id').eq('user_id', userId);
      if (savedError) setError(savedError.message);
      else setSavedPostIds((savedRows ?? []).map((row) => row.post_id));
    } else {
      setSavedPostIds([]);
    }
    setLoading(false);
    setRefreshing(false);
  }, [userId]);

  useEffect(() => {
    void loadPosts(false, appliedPostSearch, tab === 'trending');
    const channel = supabase
      .channel('explore-global-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => { void loadPosts(true, appliedPostSearch, tab === 'trending'); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, () => { void loadPosts(true, appliedPostSearch, tab === 'trending'); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => { void loadPosts(true, appliedPostSearch, tab === 'trending'); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadPosts, appliedPostSearch, tab]);

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
    if (tab === 'trending') {
      const score = (post: ExplorePost) => {
        const ageHours = Math.max(0, (Date.now() - new Date(post.created_at).getTime()) / 3_600_000);
        const engagement = post.likes.length * 2 + post.comments.length * 3;
        return engagement / Math.pow(ageHours + 2, 0.8);
      };
      result.sort((a, b) => score(b) - score(a));
    }
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
      await loadPosts(true, appliedPostSearch, tab === 'trending');
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
    else await loadPosts(true, appliedPostSearch, tab === 'trending');
    setBusyLike(null);
  };

  const toggleSaved = async (postId: string) => {
    if (!userId || contentBusy) return;
    const isSaved = savedPostIds.includes(postId);
    setContentBusy(postId);
    const result = isSaved
      ? await supabase.from('saved_posts').delete().eq('user_id', userId).eq('post_id', postId)
      : await supabase.from('saved_posts').insert({ user_id: userId, post_id: postId });
    if (result.error) setError(result.error.message);
    else setSavedPostIds((current) => isSaved ? current.filter((id) => id !== postId) : [...current, postId]);
    setContentBusy(null);
  };

  const togglePin = async (post: ExplorePost) => {
    if (!userId || post.author_id !== userId || contentBusy) return;
    setContentBusy(post.id);
    const { error: updateError } = await supabase.from('posts').update({ is_pinned: !post.is_pinned }).eq('id', post.id).eq('author_id', userId);
    if (updateError) setError(updateError.message);
    else {
      setPosts((current) => current.map((item) => item.id === post.id ? { ...item, is_pinned: !item.is_pinned } : item));
      setProfilePosts((current) => current.map((item) => item.id === post.id ? { ...item, is_pinned: !item.is_pinned } : item));
    }
    setContentBusy(null);
  };

  const savePostEdit = async (postId: string) => {
    const body = postEditDraft.trim();
    if (!body || body.length > 2000 || contentBusy || !userId) return;
    setContentBusy(postId);
    const { error: updateError } = await supabase.from('posts').update({ body }).eq('id', postId).eq('author_id', userId);
    if (updateError) setError(updateError.message);
    else {
      setEditingPostId(null);
      setPostEditDraft('');
      await loadPosts(true, appliedPostSearch, tab === 'trending');
    }
    setContentBusy(null);
  };

  const deletePost = async (post: ExplorePost) => {
    if (!userId || post.author_id !== userId || contentBusy) return;
    if (!window.confirm('Delete this post? Its comments and replies will also be deleted.')) return;
    setContentBusy(post.id);
    const { error: deleteError } = await supabase.from('posts').delete().eq('id', post.id).eq('author_id', userId);
    if (deleteError) setError(deleteError.message);
    else {
      setPosts((current) => current.filter((item) => item.id !== post.id));
      setComments((current) => {
        const next = { ...current };
        delete next[post.id];
        return next;
      });
    }
    setContentBusy(null);
  };

  const saveCommentEdit = async (postId: string, commentId: string) => {
    const body = commentEditDraft.trim();
    if (!body || body.length > 1000 || contentBusy || !userId) return;
    setContentBusy(commentId);
    const { error: updateError } = await supabase.from('comments').update({ body }).eq('id', commentId).eq('author_id', userId);
    if (updateError) setError(updateError.message);
    else {
      setEditingCommentId(null);
      setCommentEditDraft('');
      await loadComments(postId);
      await loadPosts(true, appliedPostSearch, tab === 'trending');
    }
    setContentBusy(null);
  };

  const deleteComment = async (postId: string, commentId: string) => {
    if (!userId || contentBusy) return;
    if (!window.confirm('Delete this comment? Any replies to it will also be deleted.')) return;
    setContentBusy(commentId);
    const { error: deleteError } = await supabase.from('comments').delete().eq('id', commentId).eq('author_id', userId);
    if (deleteError) setError(deleteError.message);
    else {
      await loadComments(postId);
      await loadPosts(true, appliedPostSearch, tab === 'trending');
    }
    setContentBusy(null);
  };

  const openProfile = async (profileId: string) => {
    setProfile(null);
    setProfilePosts([]);
    setProfileError('');
    setProfileLoading(true);
    const [profileResult, postsResult, followersResult, followingResult, followResult] = await Promise.all([
      supabase.from('profiles').select('id, username, display_name, bio, avatar_url, banner_url, website_url, instagram_url, twitch_url, youtube_url, created_at').eq('id', profileId).maybeSingle(),
      supabase.from('posts').select('id, body, image_url, media_type, created_at, is_pinned, likes(user_id), comments(id)').eq('author_id', profileId).is('server_id', null).order('created_at', { ascending: false }).limit(12),
      supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', profileId),
      supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', profileId),
      userId && userId !== profileId
        ? supabase.from('follows').select('follower_id').eq('follower_id', userId).eq('following_id', profileId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (profileResult.error) setProfileError(profileResult.error.message);
    else if (!profileResult.data) setProfileError('This profile could not be found.');
    else setProfile(profileResult.data as ExploreProfile);
    if (postsResult.error) setProfileError(postsResult.error.message);
    else setProfilePosts((postsResult.data ?? []) as unknown as ExploreProfilePost[]);
    setProfileStats({ followers: followersResult.count ?? 0, following: followingResult.count ?? 0 });
    setIsFollowing(Boolean(followResult.data));
    setProfileLoading(false);
  };

  const toggleFollow = async () => {
    if (!profile || !userId || userId === profile.id || followBusy) return;
    setFollowBusy(true);
    const result = isFollowing
      ? await supabase.from('follows').delete().eq('follower_id', userId).eq('following_id', profile.id)
      : await supabase.from('follows').insert({ follower_id: userId, following_id: profile.id });
    if (result.error) setProfileError(result.error.message);
    else {
      setIsFollowing(!isFollowing);
      setProfileStats((current) => ({ ...current, followers: Math.max(0, current.followers + (isFollowing ? -1 : 1)) }));
    }
    setFollowBusy(false);
  };

  const loadComments = async (postId: string) => {
    const { data, error: queryError } = await supabase
      .from('comments')
      .select('id, author_id, parent_id, body, created_at, author:profiles!comments_author_id_fkey(username, display_name, avatar_url)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    if (queryError) setError(queryError.message);
    else setComments((current) => ({ ...current, [postId]: (data ?? []) as unknown as ExploreComment[] }));
  };

  const toggleComments = async (postId: string) => {
    if (expandedPost === postId) {
      setExpandedPost(null);
      return;
    }
    setExpandedPost(postId);
    await loadComments(postId);
  };

  const publishComment = async (postId: string) => {
    const body = (commentDrafts[postId] ?? '').trim();
    if (!body || !userId || commentBusy) return;
    setCommentBusy(postId);
    const { error: insertError } = await supabase.from('comments').insert({ post_id: postId, body });
    if (insertError) setError(insertError.message);
    else {
      setCommentDrafts((current) => ({ ...current, [postId]: '' }));
      await loadComments(postId);
      await loadPosts(true, appliedPostSearch, tab === 'trending');
    }
    setCommentBusy(null);
  };

  const publishReply = async (postId: string, parentId: string) => {
    const body = (replyDrafts[parentId] ?? '').trim();
    if (!body || !userId || commentBusy) return;
    setCommentBusy(parentId);
    const { error: insertError } = await supabase.from('comments').insert({
      post_id: postId,
      parent_id: parentId,
      body,
    });
    if (insertError) setError(insertError.message);
    else {
      setReplyDrafts((current) => ({ ...current, [parentId]: '' }));
      setReplyingTo(null);
      await loadComments(postId);
      await loadPosts(true, appliedPostSearch, tab === 'trending');
    }
    setCommentBusy(null);
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
        <button type="button" onClick={() => void loadPosts(true, appliedPostSearch, tab === 'trending')} disabled={refreshing} className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs text-ink-400 hover:bg-white/[0.05]"><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />Refresh</button>
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
          {search.trim().length < 3 ? <p className="rounded-2xl border border-white/[0.06] bg-ink-900/50 p-8 text-center text-sm text-ink-500">Search for people by username to find your next community.</p> : people.length === 0 ? <p className="rounded-2xl border border-white/[0.06] bg-ink-900/50 p-8 text-center text-sm text-ink-500">No users found. Try another username.</p> : <div className="grid gap-3 sm:grid-cols-2">{people.map((person) => { const name = person.display_name || person.username; const sent = sentRequests.includes(person.id); return <article key={person.id} className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-ink-900/65 p-4"><button type="button" onClick={() => void openProfile(person.id)} className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink-800 text-xs font-bold text-ink-200">{person.avatar_url ? <img src={person.avatar_url} alt="" className="h-full w-full object-cover" /> : initials(name)}</button><button type="button" onClick={() => void openProfile(person.id)} className="min-w-0 flex-1 text-left"><p className="truncate text-sm font-semibold text-ink-100 hover:text-primary-300">{name}</p><p className="truncate text-xs text-ink-500">@{person.username}</p></button><button type="button" onClick={() => void addPerson(person)} disabled={sent || busyPeople === person.id} className="inline-flex items-center gap-2 rounded-xl bg-primary-500/15 px-3 py-2 text-xs font-semibold text-primary-200 hover:bg-primary-500/25 disabled:opacity-50">{sent ? <Check size={14} /> : <UserPlus size={14} />}{sent ? 'Sent' : 'Add'}</button></article>; })}</div>}
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
              <div className="flex items-center gap-3 p-4">
                <button type="button" onClick={() => void openProfile(post.author_id)} aria-label={`Open ${name}'s profile`} className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink-800 text-xs font-bold text-ink-200 ring-1 ring-white/10 transition hover:ring-primary-400/60">{post.author?.avatar_url ? <img src={post.author.avatar_url} alt="" className="h-full w-full object-cover" /> : initials(name)}</button>
                <div className="min-w-0 flex-1">
                  <button type="button" onClick={() => void openProfile(post.author_id)} className="block max-w-full truncate text-left text-sm font-semibold text-ink-100 transition hover:text-primary-300">{name}</button>
                  <p className="text-xs text-ink-500">@{post.author?.username || 'user'} · {age(post.created_at)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => void toggleSaved(post.id)} aria-label={savedPostIds.includes(post.id) ? 'Remove bookmark' : 'Save post'} className={`rounded-lg p-2 transition hover:bg-white/[0.06] ${savedPostIds.includes(post.id) ? 'text-primary-300' : 'text-ink-400 hover:text-primary-300'}`}><Bookmark size={14} className={savedPostIds.includes(post.id) ? 'fill-current' : ''} /></button>
                  {post.author_id === userId && <button type="button" onClick={() => void togglePin(post)} disabled={contentBusy === post.id} aria-label={post.is_pinned ? 'Unpin post from profile' : 'Pin post to profile'} className={`rounded-lg p-2 transition hover:bg-white/[0.06] ${post.is_pinned ? 'text-primary-300' : 'text-ink-400 hover:text-primary-300'}`}><Pin size={14} className={post.is_pinned ? 'fill-current' : ''} /></button>}
                </div>
                {post.author_id === userId && <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => { setEditingPostId(post.id); setPostEditDraft(post.body); }} aria-label="Edit post" className="rounded-lg p-2 text-ink-400 hover:bg-white/[0.06] hover:text-primary-300"><Pencil size={14} /></button>
                  <button type="button" onClick={() => void deletePost(post)} disabled={contentBusy === post.id} aria-label="Delete post" className="rounded-lg p-2 text-ink-400 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-40"><Trash2 size={14} /></button>
                </div>}
                {post.media_type === 'video' && <span className="rounded-full bg-primary-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary-200">Video</span>}
              </div>
              {post.media_type === 'video' && post.image_url && <video src={post.image_url} controls playsInline preload="metadata" className="max-h-[560px] w-full bg-black object-contain" />}
              {post.media_type === 'image' && post.image_url && <img src={post.image_url} alt="Post media" loading="lazy" className="max-h-[560px] w-full object-cover" />}
              {editingPostId === post.id ? <div className="space-y-2 px-4 py-3">
                <textarea value={postEditDraft} onChange={(event) => setPostEditDraft(event.target.value.slice(0, 2000))} rows={3} maxLength={2000} className="w-full rounded-xl border border-primary-400/30 bg-ink-950 px-3 py-2 text-sm text-ink-100 outline-none" aria-label="Edit post text" />
                <div className="flex items-center justify-between gap-2"><span className="text-[11px] text-ink-500">{postEditDraft.length}/2000</span><div className="flex gap-2">
                  <button type="button" onClick={() => setEditingPostId(null)} className="rounded-lg px-3 py-2 text-xs text-ink-300 hover:bg-white/[0.06]">Cancel</button>
                  <button type="button" onClick={() => void savePostEdit(post.id)} disabled={!postEditDraft.trim() || contentBusy === post.id} className="rounded-lg bg-primary-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Save</button>
                </div></div>
              </div> : post.body && <p className="whitespace-pre-wrap break-words px-4 py-3 text-sm leading-6 text-ink-200">{post.body}</p>}
              <div className="flex items-center gap-2 border-t border-white/[0.05] px-3 py-2">
                <button type="button" onClick={() => void toggleLike(post)} disabled={busyLike === post.id} aria-pressed={liked} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition hover:bg-white/[0.05] ${liked ? 'text-rose-300' : 'text-ink-400 hover:text-ink-100'}`}><Heart size={16} className={liked ? 'fill-current' : ''} />{post.likes.length} likes</button>
                <button type="button" onClick={() => void toggleComments(post.id)} aria-expanded={expandedPost === post.id} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-ink-400 transition hover:bg-white/[0.05] hover:text-ink-100"><MessageCircle size={16} />{post.comments.length} comments</button>
              </div>
              {expandedPost === post.id && (
                <div className="border-t border-white/[0.06] bg-ink-950/35 px-4 py-4">
                  <div className="mb-4 space-y-3">
                    {(comments[post.id] ?? []).filter((comment) => !comment.parent_id).length === 0 ? <p className="text-xs text-ink-500">No comments yet. Start the discussion.</p> : (comments[post.id] ?? []).filter((comment) => !comment.parent_id).map((comment) => {
                      const commentAuthor = authorName(comment.author);
                      const replies = (comments[post.id] ?? []).filter((reply) => reply.parent_id === comment.id);
                      return <div key={comment.id} className="space-y-2">
                        <div className="flex gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink-800 text-[10px] font-bold text-ink-300">{comment.author?.avatar_url ? <img src={comment.author.avatar_url} alt="" className="h-full w-full object-cover" /> : initials(commentAuthor)}</div>
                          <div className="min-w-0 flex-1 rounded-xl bg-white/[0.035] px-3 py-2">
                            <p className="text-xs font-semibold text-ink-200"><button type="button" onClick={() => void openProfile(comment.author_id)} className="transition hover:text-primary-300">{commentAuthor}</button><span className="ml-1 font-normal text-ink-500">{age(comment.created_at)}</span></p>
                            {editingCommentId === comment.id ? <div className="mt-2 space-y-2">
                              <textarea value={commentEditDraft} onChange={(event) => setCommentEditDraft(event.target.value.slice(0, 1000))} rows={2} maxLength={1000} className="w-full rounded-lg border border-primary-400/30 bg-ink-900 px-3 py-2 text-sm text-ink-100 outline-none" aria-label="Edit comment" />
                              <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditingCommentId(null)} className="rounded-lg px-2 py-1 text-[11px] text-ink-400">Cancel</button><button type="button" onClick={() => void saveCommentEdit(post.id, comment.id)} disabled={!commentEditDraft.trim() || contentBusy === comment.id} className="rounded-lg bg-primary-500 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40">Save</button></div>
                            </div> : <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-300">{comment.body}</p>}
                            <div className="mt-2 flex flex-wrap items-center gap-3">
                              <button type="button" onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)} className="text-[11px] font-semibold text-primary-300 hover:text-primary-200">Reply{replies.length ? ` · ${replies.length}` : ''}</button>
                              {comment.author_id === userId && <><button type="button" onClick={() => { setEditingCommentId(comment.id); setCommentEditDraft(comment.body); }} className="text-[11px] text-ink-500 hover:text-primary-300">Edit</button><button type="button" onClick={() => void deleteComment(post.id, comment.id)} disabled={contentBusy === comment.id} className="text-[11px] text-ink-500 hover:text-red-300">Delete</button></>}
                            </div>
                            {replyingTo === comment.id && <div className="mt-2 flex gap-2">
                              <input value={replyDrafts[comment.id] ?? ''} onChange={(event) => setReplyDrafts((current) => ({ ...current, [comment.id]: event.target.value.slice(0, 1000) }))} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void publishReply(post.id, comment.id); } }} placeholder={`Reply to ${commentAuthor}…`} maxLength={1000} className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-ink-900 px-3 py-2 text-xs text-ink-100 outline-none placeholder:text-ink-500 focus:border-primary-400/40" />
                              <button type="button" onClick={() => void publishReply(post.id, comment.id)} disabled={!(replyDrafts[comment.id] ?? '').trim() || commentBusy === comment.id} aria-label="Send reply" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-500 text-white hover:bg-primary-400 disabled:opacity-40"><Send size={14} /></button>
                            </div>}
                          </div>
                        </div>
                        {replies.map((reply) => {
                          const replyAuthor = authorName(reply.author);
                          return <div key={reply.id} className="ml-9 flex gap-2 border-l border-primary-400/20 pl-3">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink-800 text-[9px] font-bold text-ink-300">{reply.author?.avatar_url ? <img src={reply.author.avatar_url} alt="" className="h-full w-full object-cover" /> : initials(replyAuthor)}</div>
                            <div className="min-w-0 flex-1 rounded-xl bg-white/[0.025] px-3 py-2">
                              <p className="text-xs font-semibold text-ink-200"><button type="button" onClick={() => void openProfile(reply.author_id)} className="transition hover:text-primary-300">{replyAuthor}</button><span className="ml-1 font-normal text-ink-500">{age(reply.created_at)}</span></p>
                              {editingCommentId === reply.id ? <div className="mt-2 space-y-2">
                                <textarea value={commentEditDraft} onChange={(event) => setCommentEditDraft(event.target.value.slice(0, 1000))} rows={2} maxLength={1000} className="w-full rounded-lg border border-primary-400/30 bg-ink-900 px-3 py-2 text-sm text-ink-100 outline-none" aria-label="Edit reply" />
                                <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditingCommentId(null)} className="rounded-lg px-2 py-1 text-[11px] text-ink-400">Cancel</button><button type="button" onClick={() => void saveCommentEdit(post.id, reply.id)} disabled={!commentEditDraft.trim() || contentBusy === reply.id} className="rounded-lg bg-primary-500 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40">Save</button></div>
                              </div> : <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-300">{reply.body}</p>}
                              {reply.author_id === userId && <div className="mt-2 flex gap-3"><button type="button" onClick={() => { setEditingCommentId(reply.id); setCommentEditDraft(reply.body); }} className="text-[11px] text-ink-500 hover:text-primary-300">Edit</button><button type="button" onClick={() => void deleteComment(post.id, reply.id)} disabled={contentBusy === reply.id} className="text-[11px] text-ink-500 hover:text-red-300">Delete</button></div>}
                            </div>
                          </div>;
                        })}
                      </div>;
                    })}
                  </div>
                  <div className="flex gap-2">
                    <input value={commentDrafts[post.id] ?? ''} onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value.slice(0, 1000) }))} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void publishComment(post.id); } }} placeholder="Write a comment…" maxLength={1000} className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-ink-900 px-3 py-2.5 text-sm text-ink-100 outline-none placeholder:text-ink-500 focus:border-primary-400/40" />
                    <button type="button" onClick={() => void publishComment(post.id)} disabled={!(commentDrafts[post.id] ?? '').trim() || commentBusy === post.id} aria-label="Send comment" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-500 text-white transition hover:bg-primary-400 disabled:opacity-40"><Send size={16} /></button>
                  </div>
                </div>
              )}
            </article>;
          })}
        </div>
      )}
      {(profileLoading || profile || profileError) && (
        <div role="dialog" aria-modal="true" aria-label="User profile" className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) { setProfile(null); setProfileError(''); } }}>
          <section className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/10 bg-ink-950 shadow-2xl shadow-black/50">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.06] bg-ink-950/95 px-4 py-3 backdrop-blur">
              <button type="button" onClick={() => { setProfile(null); setProfileError(''); }} className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-ink-300 hover:bg-white/[0.06]"><ArrowLeft size={16} /> Back to Explore</button>
              <button type="button" onClick={() => { setProfile(null); setProfileError(''); }} aria-label="Close profile" className="rounded-lg p-2 text-ink-400 hover:bg-white/[0.06]"><X size={17} /></button>
            </div>
            {profileLoading ? <div className="flex items-center justify-center gap-3 py-20 text-sm text-ink-400"><Loader2 size={18} className="animate-spin" />Loading profile…</div> : profile ? (
              <>
                <div className="relative h-36 bg-gradient-to-br from-primary-500/35 via-ink-800 to-ink-900 sm:h-48">
                  {profile.banner_url && <img src={profile.banner_url} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="px-5 pb-5">
                  <div className="-mt-12 flex flex-wrap items-end justify-between gap-3">
                    <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl border-4 border-ink-950 bg-ink-800 text-2xl font-bold text-ink-200">{profile.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : initials(profile.display_name || profile.username)}</div>
                    {userId !== profile.id && <button type="button" onClick={() => void toggleFollow()} disabled={followBusy} className="rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-400 disabled:opacity-50">{followBusy ? 'Please wait…' : isFollowing ? 'Following' : 'Follow'}</button>}
                  </div>
                  <h2 className="mt-3 text-xl font-bold text-white">{profile.display_name || profile.username}</h2>
                  <p className="text-sm text-ink-400">@{profile.username}</p>
                  {profile.bio && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-ink-200">{profile.bio}</p>}
                  {(profile.website_url || profile.instagram_url || profile.twitch_url || profile.youtube_url) && <div className="mt-3 flex flex-wrap gap-2">
                    {([
                      ['Website', profile.website_url],
                      ['Instagram', profile.instagram_url],
                      ['Twitch', profile.twitch_url],
                      ['YouTube', profile.youtube_url],
                    ] as const).flatMap(([label, url]) => url ? [{ label, url }] : []).map(({ label, url }) => <a key={label} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs font-medium text-primary-300 transition hover:bg-white/[0.07]">{label}<ExternalLink size={12} /></a>)}
                  </div>}
                  <div className="mt-4 flex flex-wrap items-center gap-5 text-xs text-ink-400">
                    <span><strong className="text-ink-100">{profileStats.followers}</strong> followers</span>
                    <span><strong className="text-ink-100">{profileStats.following}</strong> following</span>
                    <span className="inline-flex items-center gap-1"><CalendarDays size={13} /> Joined {new Date(profile.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="border-t border-white/[0.06] px-5 py-4">
                  <h3 className="mb-3 text-sm font-semibold text-ink-100">Public posts</h3>
                  {profilePosts.length === 0 ? <p className="py-8 text-center text-sm text-ink-500">No public posts yet.</p> : <div className="grid gap-3 sm:grid-cols-2">{[...profilePosts].sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((item) => <article key={item.id} className="overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-900/70">
                    {item.media_type === 'video' && item.image_url && <video src={item.image_url} controls playsInline preload="metadata" className="max-h-64 w-full bg-black object-contain" />}
                    {item.media_type === 'image' && item.image_url && <img src={item.image_url} alt="Post media" loading="lazy" className="max-h-64 w-full object-cover" />}
                    {item.body && <p className="whitespace-pre-wrap break-words p-3 text-sm leading-5 text-ink-200">{item.body}</p>}
                    <div className="flex items-center justify-between border-t border-white/[0.05] px-3 py-2 text-xs text-ink-500">{item.is_pinned && <span className="inline-flex items-center gap-1 text-primary-300"><Pin size={12} /> Pinned</span>}<span>{item.likes.length} likes · {item.comments.length} comments · {age(item.created_at)}</span></div>
                  </article>)}</div>}
                </div>
              </>
            ) : <div className="px-5 py-16 text-center text-sm text-red-300">{profileError || 'Could not load this profile.'}</div>}
            {profileError && profile && <p role="alert" className="px-5 pb-4 text-xs text-red-300">{profileError}</p>}
          </section>
        </div>
      )}
    </div>
  );
}
