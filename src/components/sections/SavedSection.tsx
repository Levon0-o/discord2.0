import { useCallback, useEffect, useState } from 'react';
import { Bookmark, Loader2, Video } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

interface SavedPost {
  id: string;
  body: string;
  image_url: string | null;
  media_type: 'text' | 'image' | 'video';
  created_at: string;
  author: {
    username: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface SavedPostRow {
  post_id: string;
  created_at: string;
  post: SavedPost | null;
}

function nameOf(author: SavedPost['author']) {
  return author?.display_name || author?.username || 'AFTERDARK user';
}

export function SavedSection() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [posts, setPosts] = useState<SavedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadSaved = useCallback(async () => {
    if (!userId) {
      setPosts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const { data, error: queryError } = await supabase
      .from('saved_posts')
      .select('post_id, created_at, post:posts!saved_posts_post_id_fkey(id, body, image_url, media_type, created_at, author:profiles!posts_author_id_fkey(username, display_name, avatar_url))')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (queryError) setError(queryError.message);
    else {
      const rows = (data ?? []) as unknown as SavedPostRow[];
      setPosts(rows.map((row) => row.post).filter((post): post is SavedPost => Boolean(post)));
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void loadSaved();
    const channel = supabase
      .channel('saved-posts-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saved_posts', filter: userId ? `user_id=eq.${userId}` : undefined }, () => { void loadSaved(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadSaved, userId]);

  const unsave = async (postId: string) => {
    if (!userId || busyId) return;
    setBusyId(postId);
    const { error: deleteError } = await supabase.from('saved_posts').delete().eq('user_id', userId).eq('post_id', postId);
    if (deleteError) setError(deleteError.message);
    else setPosts((current) => current.filter((post) => post.id !== postId));
    setBusyId(null);
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="rounded-3xl border border-primary-400/15 bg-gradient-to-br from-primary-500/15 via-ink-900 to-ink-950 p-6 sm:p-8">
        <div className="flex items-center gap-3 text-primary-300"><Bookmark size={19} /><span className="text-xs font-semibold uppercase tracking-[0.18em]">Your collection</span></div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">Saved posts<span className="text-primary-300">.</span></h1>
        <p className="mt-2 text-sm text-ink-300">Posts and videos you want to find again.</p>
      </header>

      {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</p>}
      {loading ? (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-white/[0.06] bg-ink-900/50 py-14 text-sm text-ink-400"><Loader2 size={18} className="animate-spin" /> Loading saved posts…</div>
      ) : posts.length === 0 ? (
        <div className="rounded-2xl border border-white/[0.06] bg-ink-900/50 px-6 py-14 text-center">
          <Bookmark size={28} className="mx-auto text-ink-500" />
          <h2 className="mt-3 text-base font-semibold text-ink-100">Nothing saved yet</h2>
          <p className="mt-1 text-sm text-ink-400">Use the bookmark icon on a post to keep it here.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {posts.map((post) => <article key={post.id} className="overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-900/65">
            <div className="flex items-center gap-3 px-4 pt-4">
              <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-ink-800 text-xs font-bold text-ink-200">
                {post.author?.avatar_url ? <img src={post.author.avatar_url} alt="" className="h-full w-full object-cover" /> : nameOf(post.author).slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink-100">{nameOf(post.author)}</p>
                <p className="text-xs text-ink-500">@{post.author?.username || 'user'} · {new Date(post.created_at).toLocaleDateString()}</p>
              </div>
              <button type="button" onClick={() => void unsave(post.id)} disabled={busyId === post.id} aria-label="Remove saved post" className="rounded-lg p-2 text-primary-300 hover:bg-white/[0.06] disabled:opacity-40"><Bookmark size={17} className="fill-current" /></button>
            </div>
            {post.media_type === 'video' && post.image_url && <video src={post.image_url} controls playsInline preload="metadata" className="mt-3 max-h-[480px] w-full bg-black object-contain" />}
            {post.media_type === 'image' && post.image_url && <img src={post.image_url} alt="Post media" loading="lazy" className="mt-3 max-h-[480px] w-full object-cover" />}
            {post.body && <p className="whitespace-pre-wrap break-words px-4 py-4 text-sm leading-6 text-ink-200">{post.body}</p>}
            {post.media_type === 'video' && <div className="border-t border-white/[0.05] px-4 py-2 text-xs text-ink-500"><Video size={13} className="mr-1 inline" /> Video post</div>}
          </article>)}
        </div>
      )}
    </div>
  );
}
