import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Camera, ExternalLink, Image as ImageIcon, Loader2, Save, UserRound, BarChart3, Video } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

interface ProfileData {
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
  profile_theme: 'blue' | 'violet' | 'crimson' | 'emerald' | 'amber';
  user_status: 'online' | 'away' | 'busy' | 'dnd';
  status_message: string;
  featured_post_id: string | null;
  created_at: string;
}

interface ProfilePost {
  id: string;
  body: string;
  image_url: string | null;
  media_type: 'text' | 'image' | 'video';
  created_at: string;
  is_pinned: boolean;
}

type ProfileTheme = 'blue' | 'violet' | 'crimson' | 'emerald' | 'amber';

interface ProfileDraft {
  display_name: string;
  profile_theme: ProfileTheme;
  bio: string;
  website_url: string;
  instagram_url: string;
  twitch_url: string;
  youtube_url: string;
  user_status: 'online' | 'away' | 'busy' | 'dnd';
  status_message: string;
  featured_post_id: string;
}

const emptyProfile: ProfileDraft = {
  display_name: '',
  profile_theme: 'blue' as const,
  bio: '',
  website_url: '',
  instagram_url: '',
  twitch_url: '',
  youtube_url: '',
  user_status: 'online',
  status_message: '',
  featured_post_id: '',
};

const badgeLabels: Record<string, { label: string; description: string }> = {
  founder: { label: 'Founder', description: 'Founding member of AFTERDARK' },
  early_member: { label: 'Early Member', description: 'Joined during the early community period' },
  verified: { label: 'Verified', description: 'Identity or account verified by the team' },
  creator: { label: 'Creator', description: 'Recognized community creator' },
};

const statusOptions = [
  { value: 'online', label: 'Online', color: '#34d399' },
  { value: 'away', label: 'Away', color: '#fbbf24' },
  { value: 'busy', label: 'Busy', color: '#fb7185' },
  { value: 'dnd', label: 'Do Not Disturb', color: '#f87171' },
] as const;

const themeOptions = [
  { value: 'blue', label: 'Electric blue', swatch: '#38bdf8', panel: 'from-sky-500/30 via-ink-900 to-ink-950' },
  { value: 'violet', label: 'Violet', swatch: '#a78bfa', panel: 'from-violet-500/30 via-ink-900 to-ink-950' },
  { value: 'crimson', label: 'Crimson', swatch: '#fb7185', panel: 'from-rose-500/30 via-ink-900 to-ink-950' },
  { value: 'emerald', label: 'Emerald', swatch: '#34d399', panel: 'from-emerald-500/30 via-ink-900 to-ink-950' },
  { value: 'amber', label: 'Amber', swatch: '#fbbf24', panel: 'from-amber-500/30 via-ink-900 to-ink-950' },
] as const;

function initials(value: string) {
  return value.trim().slice(0, 2).toUpperCase() || 'AD';
}

function safeUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function ProfileSection() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>(emptyProfile);
  const [posts, setPosts] = useState<ProfilePost[]>([]);
  const [stats, setStats] = useState({ posts: 0, followers: 0, following: 0 });
  const [badges, setBadges] = useState<string[]>([]);
  const [postTab, setPostTab] = useState<'all' | 'videos'>('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'avatar_url' | 'banner_url' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadProfile = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const [profileResult, postsResult, postCountResult, followersResult, followingResult, badgesResult] = await Promise.all([
      supabase.from('profiles')
        .select('id, username, display_name, bio, avatar_url, banner_url, website_url, instagram_url, twitch_url, youtube_url, profile_theme, user_status, status_message, featured_post_id, created_at')
        .eq('id', userId)
        .maybeSingle(),
      supabase.from('posts')
        .select('id, body, image_url, media_type, created_at, is_pinned')
        .eq('author_id', userId)
        .is('server_id', null)
        .order('created_at', { ascending: false })
        .limit(24),
      supabase.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', userId).is('server_id', null),
      supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', userId),
      supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', userId),
      supabase.from('user_badges').select('badge_key').eq('user_id', userId),
    ]);
    if (profileResult.error) setError(profileResult.error.message);
    else if (profileResult.data) {
      const data = profileResult.data as ProfileData;
      setProfile(data);
      setDraft({
        display_name: data.display_name ?? '',
        profile_theme: data.profile_theme ?? 'blue',
        user_status: data.user_status ?? 'online',
        status_message: data.status_message ?? '',
        featured_post_id: data.featured_post_id ?? '',
        bio: data.bio ?? '',
        website_url: data.website_url ?? '',
        instagram_url: data.instagram_url ?? '',
        twitch_url: data.twitch_url ?? '',
        youtube_url: data.youtube_url ?? '',
      });
    } else setError('Your profile has not been created yet. Sign out and sign in again, then retry.');
    if (postsResult.error) setError(postsResult.error.message);
    else setPosts((postsResult.data ?? []) as ProfilePost[]);
    setStats({ posts: postCountResult.count ?? 0, followers: followersResult.count ?? 0, following: followingResult.count ?? 0 });
    setBadges((badgesResult.data ?? []).map((item) => item.badge_key));
    setLoading(false);
  }, [userId]);

  useEffect(() => { void loadProfile(); }, [loadProfile]);

  const uploadImage = async (event: ChangeEvent<HTMLInputElement>, field: 'avatar_url' | 'banner_url') => {
    const file = event.target.files?.[0];
    if (!file || !userId || !profile) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const maxSize = field === 'avatar_url' ? 5 * 1024 * 1024 : 8 * 1024 * 1024;
    if (!allowed.includes(file.type)) {
      setError('Use a JPG, PNG, WebP or GIF image.');
      event.target.value = '';
      return;
    }
    if (file.size > maxSize) {
      setError(field === 'avatar_url' ? 'Avatar must be 5 MB or smaller.' : 'Banner must be 8 MB or smaller.');
      event.target.value = '';
      return;
    }
    setUploading(field);
    setError('');
    setNotice('');
    const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${userId}/${field === 'avatar_url' ? 'avatar' : 'banner'}-${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from('profile-media').upload(path, file, {
      contentType: file.type,
      upsert: false,
    });
    if (uploadError) setError(uploadError.message);
    else {
      const url = supabase.storage.from('profile-media').getPublicUrl(path).data.publicUrl;
      const { error: updateError } = await supabase.from('profiles').update({ [field]: url }).eq('id', userId);
      if (updateError) setError(updateError.message);
      else {
        setProfile((current) => current ? { ...current, [field]: url } : current);
        setNotice(field === 'avatar_url' ? 'Avatar updated.' : 'Banner updated.');
      }
    }
    setUploading(null);
    event.target.value = '';
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!userId || saving || !profile) return;
    const links = {
      website_url: safeUrl(draft.website_url),
      instagram_url: safeUrl(draft.instagram_url),
      twitch_url: safeUrl(draft.twitch_url),
      youtube_url: safeUrl(draft.youtube_url),
    };
    const invalidLink = Object.entries(draft).find(([key, value]) =>
      ['website_url', 'instagram_url', 'twitch_url', 'youtube_url'].includes(key) && value.trim() && !safeUrl(value),
    );
    if (invalidLink) {
      setError(`Enter a valid http:// or https:// address for ${invalidLink[0].replace('_url', '').replace('_', ' ')}.`);
      return;
    }
    if (draft.display_name.trim().length > 50 || draft.bio.length > 280) {
      setError('Display name is limited to 50 characters and bio to 280.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    const { data, error: updateError } = await supabase.from('profiles').update({
      display_name: draft.display_name.trim() || null,
      bio: draft.bio.trim(),
      profile_theme: draft.profile_theme,
      user_status: draft.user_status,
      status_message: draft.status_message.trim(),
      featured_post_id: draft.featured_post_id || null,
      ...links,
    }).eq('id', userId)
      .select('id, username, display_name, bio, avatar_url, banner_url, website_url, instagram_url, twitch_url, youtube_url, profile_theme, created_at')
      .single();
    if (updateError) setError(updateError.message);
    else {
      setProfile(data as ProfileData);
      setNotice('Profile saved successfully.');
    }
    setSaving(false);
  };

  const selectedTheme = themeOptions.find((theme) => theme.value === draft.profile_theme) ?? themeOptions[0];
  const visiblePosts = postTab === 'videos' ? posts.filter((post) => post.media_type === 'video') : posts;

  const socialLinks = profile ? [
    { label: 'Website', url: profile.website_url },
    { label: 'Instagram', url: profile.instagram_url },
    { label: 'Twitch', url: profile.twitch_url },
    { label: 'YouTube', url: profile.youtube_url },
  ].filter((item): item is { label: string; url: string } => Boolean(item.url)) : [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className={`rounded-3xl border border-white/[0.08] bg-gradient-to-br ${selectedTheme.panel} p-6 sm:p-8`}>
        <div className="flex items-center gap-3 text-primary-300"><UserRound size={19} /><span className="text-xs font-semibold uppercase tracking-[0.18em]">Your identity</span></div>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">Your profile<span className="text-primary-300">.</span></h1>
        <p className="mt-2 text-sm text-ink-300">Customize how people see you across AFTERDARK.</p>
      </header>

      {error && <p role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{notice}</p>}

      {loading ? (
        <div className="flex items-center justify-center gap-3 rounded-2xl border border-white/[0.06] bg-ink-900/50 py-16 text-sm text-ink-400"><Loader2 size={18} className="animate-spin" /> Loading your profile…</div>
      ) : profile ? (
        <>
          <section className="overflow-hidden rounded-3xl border border-white/[0.07] bg-ink-900/60">
            <div className={`relative h-36 bg-gradient-to-br ${selectedTheme.panel} sm:h-48`}>
              {profile.banner_url && <img src={profile.banner_url} alt="Profile banner" className="h-full w-full object-cover" />}
              <label className="absolute bottom-3 right-3 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-black/65 px-3 py-2 text-xs font-semibold text-white backdrop-blur hover:bg-black/80">
                {uploading === 'banner_url' ? <Loader2 size={14} className="animate-spin" /> : <ImageIcon size={14} />} Change banner
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" disabled={Boolean(uploading)} onChange={(event) => void uploadImage(event, 'banner_url')} />
              </label>
            </div>
            <div className="flex flex-wrap items-end gap-4 px-5 pb-5">
              <div className="-mt-12 flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl border-4 border-ink-900 bg-ink-800 text-2xl font-bold text-ink-200">
                {profile.avatar_url ? <img src={profile.avatar_url} alt="Profile avatar" className="h-full w-full object-cover" /> : initials(profile.display_name || profile.username)}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <h2 className="truncate text-xl font-bold text-white">{profile.display_name || profile.username}</h2>
                <p className="text-sm text-ink-400">@{profile.username}</p>
              </div>
              <label className="mb-1 inline-flex cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-ink-200 hover:bg-white/[0.08]">
                {uploading === 'avatar_url' ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />} Change avatar
                <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" disabled={Boolean(uploading)} onChange={(event) => void uploadImage(event, 'avatar_url')} />
              </label>
            </div>
          </section>

          <form onSubmit={(event) => void saveProfile(event)} className="space-y-5 rounded-3xl border border-white/[0.07] bg-ink-900/60 p-5 sm:p-6">
            <div>
              <h2 className="text-base font-semibold text-white">Profile details</h2>
              <p className="mt-1 text-xs text-ink-500">Username is fixed here. You can customize the rest.</p>
            </div>
            <label className="block space-y-2">
              <span className="text-xs font-semibold text-ink-300">Display name</span>
              <input value={draft.display_name} onChange={(event) => setDraft((current) => ({ ...current, display_name: event.target.value.slice(0, 50) }))} maxLength={50} placeholder="How people should call you" className="w-full rounded-xl border border-white/[0.08] bg-ink-950 px-4 py-3 text-sm text-white outline-none focus:border-primary-400/50" />
              <span className="block text-right text-[11px] text-ink-500">{draft.display_name.length}/50</span>
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-semibold text-ink-300">Bio</span>
              <textarea value={draft.bio} onChange={(event) => setDraft((current) => ({ ...current, bio: event.target.value.slice(0, 280) }))} maxLength={280} rows={4} placeholder="Tell people a little about yourself…" className="w-full resize-y rounded-xl border border-white/[0.08] bg-ink-950 px-4 py-3 text-sm leading-6 text-white outline-none focus:border-primary-400/50" />
              <span className="block text-right text-[11px] text-ink-500">{draft.bio.length}/280</span>
            </label>

            <div className="border-t border-white/[0.06] pt-5">
              <h3 className="text-sm font-semibold text-white">Status</h3>
              <p className="mt-1 text-xs text-ink-500">Choose how your presence appears to other members.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block space-y-2"><span className="text-xs font-semibold text-ink-300">Presence</span><select value={draft.user_status} onChange={(event) => setDraft((current) => ({ ...current, user_status: event.target.value as ProfileDraft['user_status'] }))} className="w-full rounded-xl border border-white/[0.08] bg-ink-950 px-3 py-3 text-sm text-white">{statusOptions.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
                <label className="block space-y-2"><span className="text-xs font-semibold text-ink-300">Status message</span><input value={draft.status_message} maxLength={60} onChange={(event) => setDraft((current) => ({ ...current, status_message: event.target.value.slice(0, 60) }))} placeholder="What are you up to?" className="w-full rounded-xl border border-white/[0.08] bg-ink-950 px-3 py-3 text-sm text-white" /><span className="block text-right text-[11px] text-ink-500">{draft.status_message.length}/60</span></label>
              </div>
            </div>
            <div className="border-t border-white/[0.06] pt-5">
              <h3 className="text-sm font-semibold text-white">Profile appearance</h3>
              <p className="mt-1 text-xs text-ink-500">Choose the accent theme shown on your public profile.</p>
              <div className="mt-3 flex flex-wrap gap-2">{themeOptions.map((theme) => <button key={theme.value} type="button" onClick={() => setDraft((current) => ({ ...current, profile_theme: theme.value }))} aria-pressed={draft.profile_theme === theme.value} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${draft.profile_theme === theme.value ? 'border-white/30 bg-white/[0.09] text-white' : 'border-white/[0.08] text-ink-400 hover:bg-white/[0.04]'}`}><span className="h-3 w-3 rounded-full" style={{ backgroundColor: theme.swatch }} />{theme.label}</button>)}</div>
            </div>
            <div className="border-t border-white/[0.06] pt-5">
              <h3 className="text-sm font-semibold text-white">Featured post</h3>
              <p className="mt-1 text-xs text-ink-500">Choose one of your public posts to highlight at the top of your profile.</p>
              <select value={draft.featured_post_id} onChange={(event) => setDraft((current) => ({ ...current, featured_post_id: event.target.value }))} className="mt-3 w-full rounded-xl border border-white/[0.08] bg-ink-950 px-3 py-3 text-sm text-white"><option value="">No featured post</option>{posts.map((post) => <option key={post.id} value={post.id}>{(post.body || (post.media_type === 'video' ? 'Video post' : 'Image post')).slice(0, 90)}</option>)}</select>
            </div>
            <div className="border-t border-white/[0.06] pt-5">
              <h3 className="text-sm font-semibold text-white">Social links</h3>
              <p className="mt-1 text-xs text-ink-500">Use complete links starting with https://</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {([
                  ['website_url', 'Website', 'https://example.com'],
                  ['instagram_url', 'Instagram', 'https://instagram.com/username'],
                  ['twitch_url', 'Twitch', 'https://twitch.tv/username'],
                  ['youtube_url', 'YouTube', 'https://youtube.com/@username'],
                ] as const).map(([key, label, placeholder]) => (
                  <label key={key} className="block space-y-2">
                    <span className="text-xs font-semibold text-ink-300">{label}</span>
                    <input type="url" value={draft[key]} onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))} placeholder={placeholder} className="w-full rounded-xl border border-white/[0.08] bg-ink-950 px-3 py-3 text-sm text-white outline-none focus:border-primary-400/50" />
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end border-t border-white/[0.06] pt-5">
              <button type="submit" disabled={saving || Boolean(uploading)} className="inline-flex items-center gap-2 rounded-xl bg-primary-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-400 disabled:cursor-not-allowed disabled:opacity-50">
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save profile
              </button>
            </div>
          </form>

          <section className="space-y-4 rounded-3xl border border-white/[0.07] bg-ink-900/60 p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h2 className="text-base font-semibold text-white">Public profile preview</h2><p className="mt-1 text-xs text-ink-500">This is what other AFTERDARK users can see.</p></div>
              <span className="text-xs text-ink-500">Joined {new Date(profile.created_at).toLocaleDateString()}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-ink-950/70 px-3 py-1.5 text-xs text-ink-200"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: statusOptions.find((item) => item.value === draft.user_status)?.color }} />{statusOptions.find((item) => item.value === draft.user_status)?.label}</span>{draft.status_message && <span className="text-xs text-ink-400">{draft.status_message}</span>}</div>
            {badges.length > 0 && <div className="flex flex-wrap gap-2">{badges.map((key) => <span key={key} title={badgeLabels[key]?.description} className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-2.5 py-1 text-xs font-semibold text-amber-200">{badgeLabels[key]?.label ?? key}</span>)}</div>}
            {draft.bio && <p className="whitespace-pre-wrap break-words text-sm leading-6 text-ink-300">{draft.bio}</p>}
            {socialLinks.length > 0 && <div className="flex flex-wrap gap-2">{socialLinks.map((item) => <a key={item.label} href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-primary-300 hover:bg-white/[0.07]">{item.label}<ExternalLink size={12} /></a>)}</div>}
            <div className="grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-4">
              {[{ label: 'Public posts', value: stats.posts }, { label: 'Followers', value: stats.followers }, { label: 'Following', value: stats.following }].map((item) => <div key={item.label} className="rounded-xl border border-white/[0.06] bg-ink-950/60 p-3"><BarChart3 size={14} className="mb-2 text-primary-300" /><p className="text-lg font-bold text-white">{item.value.toLocaleString()}</p><p className="text-[11px] text-ink-500">{item.label}</p></div>)}
            </div>
            <div className="border-t border-white/[0.06] pt-4">
              <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-ink-100">Your content</h3><div className="flex rounded-lg border border-white/[0.08] p-1"><button type="button" onClick={() => setPostTab('all')} className={`rounded-md px-3 py-1.5 text-xs ${postTab === 'all' ? 'bg-primary-500/20 text-primary-200' : 'text-ink-400'}`}>All posts</button><button type="button" onClick={() => setPostTab('videos')} className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs ${postTab === 'videos' ? 'bg-primary-500/20 text-primary-200' : 'text-ink-400'}`}><Video size={12} />Videos</button></div></div>
              {visiblePosts.length === 0 ? <p className="py-6 text-center text-sm text-ink-500">{postTab === 'videos' ? 'No videos published yet.' : 'You have not published any public posts yet.'}</p> : <div className="grid gap-3 sm:grid-cols-2">{[...visiblePosts].sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((post) => <article key={post.id} className="overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-950/70">
                {post.media_type === 'video' && post.image_url && <video src={post.image_url} controls playsInline preload="metadata" className="max-h-56 w-full bg-black object-contain" />}
                {post.media_type === 'image' && post.image_url && <img src={post.image_url} alt="Post media" loading="lazy" className="max-h-56 w-full object-cover" />}
                {post.body && <p className="whitespace-pre-wrap break-words p-3 text-sm text-ink-200">{post.body}</p>}
                <div className="flex items-center justify-between border-t border-white/[0.05] px-3 py-2 text-xs text-ink-500">{post.is_pinned && <span className="text-primary-300">Pinned</span>}<span>{new Date(post.created_at).toLocaleDateString()}</span></div>
              </article>)}</div>}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
