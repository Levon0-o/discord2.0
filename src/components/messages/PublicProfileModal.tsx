import { useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays, ExternalLink, Loader2, MessageSquare, UserRound, Heart, MessageCircle, Send, Pencil, Trash2, X } from 'lucide-react';
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
  author_id: string;
  body: string;
  image_url: string | null;
  media_type: string;
  created_at: string;
  likes: { user_id: string }[];
  comments: { id: string }[];
}

interface PublicComment {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: { username: string; display_name: string | null; avatar_url: string | null } | null;
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
  const [likedPosts, setLikedPosts] = useState<PublicPost[]>([]);
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [postComments, setPostComments] = useState<Record<string, PublicComment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [likeBusy, setLikeBusy] = useState<string | null>(null);
  const [commentBusy, setCommentBusy] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [commentEditDraft, setCommentEditDraft] = useState('');
  const [commentActionBusy, setCommentActionBusy] = useState<string | null>(null);
  const [likesForPost, setLikesForPost] = useState<string | null>(null);
  const [likingProfiles, setLikingProfiles] = useState<Array<{ id: string; username: string; display_name: string | null; avatar_url: string | null }>>([]);
  const [likesLoading, setLikesLoading] = useState(false);
  const [selectedCommentProfileId, setSelectedCommentProfileId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'posts' | 'likes' | 'about'>('posts');
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
      const [profileResult, postsResult, postCount, followers, following, followResult, likesResult] = await Promise.all([
        supabase.from('profiles').select('id, username, display_name, bio, avatar_url, banner_url, website_url, instagram_url, twitch_url, youtube_url, profile_theme, status_message, created_at').eq('id', userId).maybeSingle(),
        supabase.from('posts').select('id, author_id, body, image_url, media_type, created_at, likes(user_id), comments(id)').eq('author_id', userId).is('server_id', null).order('created_at', { ascending: false }).limit(12),
        supabase.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', userId).is('server_id', null),
        supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', userId),
        supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', userId),
        currentUserId && currentUserId !== userId
          ? supabase.from('follows').select('follower_id').eq('follower_id', currentUserId).eq('following_id', userId).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase.from('likes').select('post_id, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
      ]);
      if (!active) return;
      if (profileResult.error) setError(profileResult.error.message);
      else if (profileResult.data) setProfile(profileResult.data as PublicProfile);
      else setError('This profile could not be found or is not publicly available.');
      if (postsResult.error) setError(postsResult.error.message);
      else setPosts((postsResult.data ?? []) as PublicPost[]);
      setStats({ posts: postCount.count ?? 0, followers: followers.count ?? 0, following: following.count ?? 0 });
      setIsFollowing(Boolean(followResult.data));
      if (!likesResult.error && likesResult.data?.length) {
        const likedIds = likesResult.data.map((like) => like.post_id);
        const { data: likedPostRows } = await supabase.from('posts').select('id, author_id, body, image_url, media_type, created_at, likes(user_id), comments(id)').in('id', likedIds).is('server_id', null);
        if (active) {
          const byId = new Map((likedPostRows ?? []).map((post) => [post.id, post as PublicPost]));
          setLikedPosts(likedIds.flatMap((id) => { const post = byId.get(id); return post ? [post] : []; }));
        }
      }
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
      .select('follower_id, following_id')
      .eq(type === 'followers' ? 'following_id' : 'follower_id', userId)
      .order('created_at', { ascending: false });
    if (relationQueryError) {
      setRelationError(relationQueryError.message);
      setRelationLoading(false);
      return;
    }
    const ids = (relationRows ?? []).map((row) => type === 'followers' ? row.follower_id : row.following_id);
    if (ids.length) {
      const { data, error: profilesError } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .in('id', ids);
      if (profilesError) setRelationError(profilesError.message);
      else {
        const byId = new Map((data ?? []).map((person) => [person.id, person]));
        setRelationProfiles(ids.flatMap((id) => { const person = byId.get(id); return person ? [person] : []; }));
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


  const loadPostComments = async (postId: string) => {
    const { data, error: queryError } = await supabase.from('comments')
      .select('id, author_id, body, created_at, author:profiles!comments_author_id_fkey(username, display_name, avatar_url)')
      .eq('post_id', postId).order('created_at', { ascending: true });
    if (queryError) setError(queryError.message);
    else setPostComments((current) => ({ ...current, [postId]: (data ?? []) as unknown as PublicComment[] }));
  };

  const togglePostLike = async (post: PublicPost) => {
    if (!currentUserId || likeBusy) return;
    setLikeBusy(post.id);
    const liked = post.likes.some((like) => like.user_id === currentUserId);
    const result = liked
      ? await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', currentUserId)
      : await supabase.from('likes').insert({ post_id: post.id, user_id: currentUserId });
    if (result.error) setError(result.error.message);
    else {
      const update = (items: PublicPost[]) => items.map((item) => item.id === post.id
        ? { ...item, likes: liked ? item.likes.filter((like) => like.user_id !== currentUserId) : [...item.likes, { user_id: currentUserId }] }
        : item);
      setPosts(update);
      setLikedPosts(update);
    }
    setLikeBusy(null);
  };

  const togglePostComments = async (postId: string) => {
    if (expandedPost === postId) { setExpandedPost(null); return; }
    setExpandedPost(postId);
    await loadPostComments(postId);
  };

  const publishPostComment = async (postId: string) => {
    const body = (commentDrafts[postId] ?? '').trim();
    if (!body || !currentUserId || commentBusy) return;
    setCommentBusy(postId);
    const { error: insertError } = await supabase.from('comments').insert({ post_id: postId, body });
    if (insertError) setError(insertError.message);
    else {
      setCommentDrafts((current) => ({ ...current, [postId]: '' }));
      await loadPostComments(postId);
      const update = (items: PublicPost[]) => items.map((item) => item.id === postId ? { ...item, comments: [...item.comments, { id: 'new-' + Date.now() }] } : item);
      setPosts(update);
      setLikedPosts(update);
    }
    setCommentBusy(null);
  };


  const openPostLikes = async (postId: string) => {
    setLikesForPost(postId); setLikesLoading(true); setLikingProfiles([]);
    const { data: rows, error: likesError } = await supabase.from('likes').select('user_id').eq('post_id', postId);
    if (likesError) setError(likesError.message);
    else if (rows?.length) {
      const ids = rows.map((row) => row.user_id);
      const { data, error: profilesError } = await supabase.from('profiles').select('id, username, display_name, avatar_url').in('id', ids);
      if (profilesError) setError(profilesError.message);
      else { const byId = new Map((data ?? []).map((person) => [person.id, person])); setLikingProfiles(ids.flatMap((id) => { const person = byId.get(id); return person ? [person] : []; })); }
    }
    setLikesLoading(false);
  };

  const saveCommentEdit = async (postId: string, commentId: string) => {
    const body = commentEditDraft.trim();
    if (!body || body.length > 1000 || !currentUserId || commentActionBusy) return;
    setCommentActionBusy(commentId);
    const { error: updateError } = await supabase.from('comments').update({ body }).eq('id', commentId).eq('author_id', currentUserId);
    if (updateError) setError(updateError.message);
    else { setEditingCommentId(null); setCommentEditDraft(''); await loadPostComments(postId); }
    setCommentActionBusy(null);
  };

  const deletePostComment = async (postId: string, commentId: string) => {
    if (!currentUserId || commentActionBusy) return;
    if (!window.confirm('Delete this comment?')) return;
    setCommentActionBusy(commentId);
    const { error: deleteError } = await supabase.from('comments').delete().eq('id', commentId).eq('author_id', currentUserId);
    if (deleteError) setError(deleteError.message);
    else {
      await loadPostComments(postId);
      const update = (items: PublicPost[]) => items.map((item) => item.id === postId ? { ...item, comments: item.comments.filter((comment) => comment.id !== commentId) } : item);
      setPosts(update); setLikedPosts(update);
    }
    setCommentActionBusy(null);
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
              <div className="mt-5 grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3 text-center"><p className="text-lg font-bold text-white">{stats.posts}</p><p className="text-xs text-ink-500">Posts</p></div>
                <button type="button" onClick={() => void openRelationList('followers')} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3 text-center transition hover:border-primary-400/30 hover:bg-primary-500/[0.07]"><p className="text-lg font-bold text-white">{stats.followers}</p><p className="text-xs text-ink-400">Followers</p></button>
                <button type="button" onClick={() => void openRelationList('following')} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-3 text-center transition hover:border-primary-400/30 hover:bg-primary-500/[0.07]"><p className="text-lg font-bold text-white">{stats.following}</p><p className="text-xs text-ink-400">Following</p></button>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-ink-500"><span className="inline-flex items-center gap-1"><CalendarDays size={14} /> Joined {new Date(profile.created_at).toLocaleDateString()}</span></div>
              <div className="mt-6 border-b border-white/[0.08]">
                <div className="flex gap-2">
                  {(['posts', 'likes', 'about'] as const).map((tab) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`border-b-2 px-4 py-3 text-sm font-semibold capitalize transition ${activeTab === tab ? 'border-primary-400 text-primary-200' : 'border-transparent text-ink-500 hover:text-ink-200'}`}>{tab === 'likes' ? 'Liked posts' : tab}</button>)}
                </div>
              </div>
              {activeTab === 'about' ? <div className="space-y-4 py-5">
                <h3 className="text-sm font-semibold text-white">About {name}</h3>
                {profile.bio ? <p className="whitespace-pre-wrap text-sm leading-6 text-ink-200">{profile.bio}</p> : <p className="text-sm text-ink-500">No bio added yet.</p>}
                {links.length > 0 && <div className="flex flex-wrap gap-2">{links.map(([label, url]) => <a key={label} href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-ink-200 hover:bg-white/[0.06]">{label}<ExternalLink size={12} /></a>)}</div>}
                <p className="text-xs text-ink-500">Member since {new Date(profile.created_at).toLocaleDateString()}</p>
              </div> : <div className="mt-5 border-t border-white/[0.07] pt-5">
                <h3 className="mb-4 text-sm font-semibold text-white">{activeTab === 'posts' ? 'Public posts' : 'Liked posts'}</h3>
                {(activeTab === 'posts' ? posts : likedPosts).length ? <div className="grid gap-3 sm:grid-cols-2">{(activeTab === 'posts' ? posts : likedPosts).map((post) => { const liked = Boolean(currentUserId && post.likes.some((like) => like.user_id === currentUserId)); return <article key={post.id} className="overflow-hidden rounded-xl border border-white/[0.07] bg-ink-900/70">{post.media_type === 'video' && post.image_url && <video src={post.image_url} controls playsInline preload="metadata" className="max-h-64 w-full bg-black object-contain" />}{post.media_type === 'image' && post.image_url && <img src={post.image_url} alt="" className="max-h-64 w-full object-cover" />}{post.body && <p className="whitespace-pre-wrap p-4 text-sm leading-6 text-ink-200">{post.body}</p>}<p className="px-4 pb-2 text-[11px] text-ink-500">{new Date(post.created_at).toLocaleString()}</p><div className="flex items-center gap-2 border-t border-white/[0.05] px-3 py-2"><button type="button" onClick={() => void togglePostLike(post)} disabled={!currentUserId || likeBusy === post.id} aria-pressed={liked} className={'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold hover:bg-white/[0.05] ' + (liked ? 'text-rose-300' : 'text-ink-400')}><Heart size={15} className={liked ? 'fill-current' : ''} />{post.likes.length} likes</button><button type="button" onClick={() => void openPostLikes(post.id)} className="rounded-lg px-2 py-2 text-xs text-ink-500 hover:bg-white/[0.05] hover:text-primary-300">Who liked?</button><button type="button" onClick={() => void togglePostComments(post.id)} aria-expanded={expandedPost === post.id} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-ink-400 hover:bg-white/[0.05]"><MessageCircle size={15} />{post.comments.length} comments</button></div>{expandedPost === post.id && <div className="space-y-3 border-t border-white/[0.06] bg-ink-950/40 px-3 py-3"><div className="max-h-56 space-y-2 overflow-y-auto">{(postComments[post.id] ?? []).length ? (postComments[post.id] ?? []).map((comment) => <div key={comment.id} className="rounded-lg bg-white/[0.035] px-3 py-2"><p className="text-[11px] font-semibold text-ink-300"><button type="button" onClick={() => comment.author_id !== currentUserId && setSelectedCommentProfileId(comment.author_id)} className="hover:text-primary-300">{comment.author?.display_name || comment.author?.username || 'Member'}</button> <span className="font-normal text-ink-500">· {new Date(comment.created_at).toLocaleString()}</span></p>{editingCommentId === comment.id ? <div className="mt-2 space-y-2"><textarea value={commentEditDraft} onChange={(event) => setCommentEditDraft(event.target.value.slice(0, 1000))} rows={2} maxLength={1000} className="w-full rounded-lg border border-primary-400/30 bg-ink-900 px-3 py-2 text-xs text-ink-100 outline-none" /><div className="flex justify-end gap-2"><button type="button" onClick={() => setEditingCommentId(null)} className="text-[11px] text-ink-400">Cancel</button><button type="button" onClick={() => void saveCommentEdit(post.id, comment.id)} disabled={!commentEditDraft.trim() || commentActionBusy === comment.id} className="text-[11px] font-semibold text-primary-300">Save</button></div></div> : <p className="mt-1 whitespace-pre-wrap break-words text-xs text-ink-200">{comment.body}</p>}{comment.author_id === currentUserId && editingCommentId !== comment.id && <div className="mt-2 flex gap-3"><button type="button" onClick={() => { setEditingCommentId(comment.id); setCommentEditDraft(comment.body); }} className="inline-flex items-center gap-1 text-[10px] text-ink-500 hover:text-primary-300"><Pencil size={11} /> Edit</button><button type="button" onClick={() => void deletePostComment(post.id, comment.id)} disabled={commentActionBusy === comment.id} className="inline-flex items-center gap-1 text-[10px] text-ink-500 hover:text-red-300"><Trash2 size={11} /> Delete</button></div>}</div>) : <p className="text-xs text-ink-500">No comments yet. Start the discussion.</p>}</div><div className="flex gap-2"><input value={commentDrafts[post.id] ?? ''} onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value.slice(0, 1000) }))} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void publishPostComment(post.id); } }} maxLength={1000} placeholder="Write a comment…" className="min-w-0 flex-1 rounded-lg border border-white/[0.08] bg-ink-900 px-3 py-2 text-xs text-ink-100 outline-none placeholder:text-ink-500" /><button type="button" onClick={() => void publishPostComment(post.id)} disabled={!(commentDrafts[post.id] ?? '').trim() || commentBusy === post.id} aria-label="Send comment" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-500 text-white disabled:opacity-40"><Send size={14} /></button></div></div>}</article>; })}</div>
                  : <div className="rounded-xl border border-dashed border-white/10 py-10 text-center text-sm text-ink-500"><UserRound size={22} className="mx-auto mb-2" />{activeTab === 'posts' ? 'No public posts yet.' : 'No public liked posts yet.'}</div>}
              </div>}
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
      {likesForPost && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => setLikesForPost(null)}><section role="dialog" aria-modal="true" aria-label="People who liked this post" onClick={(event) => event.stopPropagation()} className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-ink-950 shadow-2xl"><header className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3"><h3 className="text-sm font-semibold text-white">People who liked this post</h3><button type="button" onClick={() => setLikesForPost(null)} aria-label="Close" className="rounded-lg p-1.5 text-ink-400 hover:bg-white/10"><X size={16} /></button></header><div className="max-h-[55vh] overflow-y-auto p-3">{likesLoading ? <div className="py-8 text-center text-sm text-ink-400"><Loader2 size={17} className="mx-auto mb-2 animate-spin" />Loading…</div> : likingProfiles.length ? <div className="space-y-1">{likingProfiles.map((person) => <button key={person.id} type="button" onClick={() => { setLikesForPost(null); setSelectedCommentProfileId(person.id); }} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-white/[0.06]"><div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-ink-800 text-xs font-semibold text-primary-200">{person.avatar_url ? <img src={person.avatar_url} alt="" className="h-full w-full object-cover" /> : (person.display_name || person.username).slice(0,1).toUpperCase()}</div><div><p className="text-sm font-semibold text-ink-100">{person.display_name || person.username}</p><p className="text-xs text-ink-500">@{person.username}</p></div></button>)}</div> : <p className="py-8 text-center text-sm text-ink-500">No likes yet.</p>}</div></section></div>}
      {selectedCommentProfileId && <PublicProfileModal userId={selectedCommentProfileId} onClose={() => setSelectedCommentProfileId(null)} />}
      {selectedRelatedProfileId && <PublicProfileModal userId={selectedRelatedProfileId} onClose={() => setSelectedRelatedProfileId(null)} />}
    </div>
  );
}
