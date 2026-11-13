import { useCallback, useEffect, useState } from 'react';
import { Heart, MessageCircle, Send, Loader2, RefreshCw, MessageSquareText } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

interface FeedAuthor {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface FeedComment {
  id: string;
  body: string;
  image_url: string | null;
  media_type: 'text' | 'image' | 'video';
  created_at: string;
  author: FeedAuthor | null;
}

interface FeedPost {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: FeedAuthor | null;
  likes: { user_id: string }[];
  comments: { id: string }[];
}

function displayName(author: FeedAuthor | null) {
  return author?.display_name || author?.username || 'Unknown user';
}

function initials(value: string) {
  return value.trim().slice(0, 2).toUpperCase() || 'AD';
}

function timeAgo(value: string) {
  const date = new Date(value);
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

export function SocialFeed() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, FeedComment[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentBusy, setCommentBusy] = useState<string | null>(null);
  const [likeBusy, setLikeBusy] = useState<string | null>(null);

  const loadPosts = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    const { data, error: queryError } = await supabase
      .from('posts')
      .select('id, author_id, body, image_url, media_type, created_at, author:profiles!posts_author_id_fkey(username, display_name, avatar_url), likes(user_id), comments(id)')
      .is('server_id', null)
      .order('created_at', { ascending: false })
      .limit(40);

    if (queryError) {
      setError(queryError.message);
    } else {
      setPosts((data ?? []) as unknown as FeedPost[]);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void loadPosts();
    const channel = supabase
      .channel('social-feed-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => { void loadPosts(true); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'likes' }, () => { void loadPosts(true); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => { void loadPosts(true); })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [loadPosts]);

  const publishPost = async () => {
    const body = draft.trim();
    if (!body || !userId || publishing) return;
    setPublishing(true);
    setError('');

    const { error: insertError } = await supabase.from('posts').insert({ body });
    if (insertError) {
      setError(insertError.message);
    } else {
      setDraft('');
      await loadPosts(true);
    }
    setPublishing(false);
  };

  const toggleLike = async (post: FeedPost) => {
    if (!userId || likeBusy) return;
    setLikeBusy(post.id);
    const liked = post.likes.some((like) => like.user_id === userId);

    const result = liked
      ? await supabase.from('likes').delete().eq('post_id', post.id).eq('user_id', userId)
      : await supabase.from('likes').insert({ post_id: post.id, user_id: userId });

    if (result.error) setError(result.error.message);
    else await loadPosts(true);
    setLikeBusy(null);
  };

  const loadComments = async (postId: string) => {
    const { data, error: queryError } = await supabase
      .from('comments')
      .select('id, body, created_at, author:profiles!comments_author_id_fkey(username, display_name, avatar_url)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (queryError) setError(queryError.message);
    else setComments((current) => ({ ...current, [postId]: (data ?? []) as unknown as FeedComment[] }));
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
    if (!body || commentBusy) return;
    setCommentBusy(postId);
    const { error: insertError } = await supabase.from('comments').insert({ post_id: postId, body });
    if (insertError) {
      setError(insertError.message);
    } else {
      setCommentDrafts((current) => ({ ...current, [postId]: '' }));
      await loadComments(postId);
      await loadPosts(true);
    }
    setCommentBusy(null);
  };

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary-300">Community</p>
          <h2 className="mt-1 text-xl font-semibold text-ink-50">Your feed</h2>
          <p className="mt-1 text-sm text-ink-400">Updates from people across AFTERDARK.</p>
        </div>
        <button type="button" onClick={() => void loadPosts(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] px-3 py-2 text-xs font-semibold text-ink-300 transition hover:bg-white/[0.05] disabled:opacity-50">
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
        </button>
      </header>

      <div className="rounded-2xl border border-white/[0.07] bg-ink-900/70 p-4 sm:p-5">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-500/15 text-xs font-bold text-primary-200">YOU</div>
          <div className="min-w-0 flex-1">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value.slice(0, 2000))}
              placeholder="What's happening?"
              rows={3}
              maxLength={2000}
              className="w-full resize-y rounded-xl border border-white/[0.07] bg-ink-950/70 px-4 py-3 text-sm text-ink-100 outline-none transition placeholder:text-ink-500 focus:border-primary-400/40"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-ink-500">{draft.length}/2000</span>
              <button type="button" onClick={() => void publishPost()} disabled={!draft.trim() || publishing} className="inline-flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-40">
                {publishing ? <Loader2 size={16} className="animate-spin" /> : <Send size={15} />}
                Publish
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div>}

      {loading ? (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-white/[0.06] bg-ink-900/50 py-12 text-sm text-ink-400"><Loader2 size={18} className="animate-spin" /> Loading feed…</div>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-ink-900/50 px-6 py-12 text-center">
          <MessageSquareText size={28} className="mx-auto text-ink-500" />
          <h3 className="mt-3 text-base font-semibold text-ink-100">The feed is quiet</h3>
          <p className="mt-1 text-sm text-ink-400">Publish the first post and start the conversation.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => {
            const authorName = displayName(post.author);
            const liked = Boolean(userId && post.likes.some((like) => like.user_id === userId));
            return (
              <article key={post.id} className="overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-900/65">
                <div className="flex items-center gap-3 px-4 pt-4 sm:px-5">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink-800 text-xs font-bold text-ink-200 ring-1 ring-white/10">
                    {post.author?.avatar_url ? <img src={post.author.avatar_url} alt="" className="h-full w-full object-cover" /> : initials(authorName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink-100">{authorName}</p>
                    <p className="text-xs text-ink-500">@{post.author?.username || 'user'} · {timeAgo(post.created_at)}</p>
                  </div>
                </div>
                {post.media_type === 'video' && post.image_url && <video src={post.image_url} controls playsInline preload="metadata" className="max-h-[560px] w-full bg-black object-contain" />}
                {post.media_type === 'image' && post.image_url && <img src={post.image_url} alt="Post media" loading="lazy" className="max-h-[560px] w-full object-cover" />}
                {post.body && <p className="whitespace-pre-wrap break-words px-4 py-4 text-sm leading-6 text-ink-200 sm:px-5">{post.body}</p>}
                <div className="flex items-center gap-2 border-t border-white/[0.05] px-3 py-2 sm:px-4">
                  <button type="button" onClick={() => void toggleLike(post)} disabled={likeBusy === post.id} aria-pressed={liked} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition hover:bg-white/[0.05] ${liked ? 'text-rose-300' : 'text-ink-400 hover:text-ink-100'}`}>
                    <Heart size={16} className={liked ? 'fill-current' : ''} /> {post.likes.length} {post.likes.length === 1 ? 'like' : 'likes'}
                  </button>
                  <button type="button" onClick={() => void toggleComments(post.id)} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-ink-400 transition hover:bg-white/[0.05] hover:text-ink-100">
                    <MessageCircle size={16} /> {post.comments.length} {post.comments.length === 1 ? 'comment' : 'comments'}
                  </button>
                </div>
                {expandedPost === post.id && (
                  <div className="border-t border-white/[0.06] bg-ink-950/35 px-4 py-4 sm:px-5">
                    <div className="mb-4 space-y-3">
                      {(comments[post.id] ?? []).length === 0 ? <p className="text-xs text-ink-500">No comments yet. Start the discussion.</p> : (comments[post.id] ?? []).map((comment) => (
                        <div key={comment.id} className="flex gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ink-800 text-[10px] font-bold text-ink-300">
                            {comment.author?.avatar_url ? <img src={comment.author.avatar_url} alt="" className="h-full w-full object-cover" /> : initials(displayName(comment.author))}
                          </div>
                          <div className="min-w-0 flex-1 rounded-xl bg-white/[0.035] px-3 py-2">
                            <p className="text-xs font-semibold text-ink-200">{displayName(comment.author)} <span className="ml-1 font-normal text-ink-500">{timeAgo(comment.created_at)}</span></p>
                            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-300">{comment.body}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input value={commentDrafts[post.id] ?? ''} onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value.slice(0, 1000) }))} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void publishComment(post.id); } }} placeholder="Write a comment…" className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-ink-900 px-3 py-2.5 text-sm text-ink-100 outline-none placeholder:text-ink-500 focus:border-primary-400/40" />
                      <button type="button" onClick={() => void publishComment(post.id)} disabled={!(commentDrafts[post.id] ?? '').trim() || commentBusy === post.id} aria-label="Send comment" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-500 text-white transition hover:bg-primary-400 disabled:opacity-40"><Send size={16} /></button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
