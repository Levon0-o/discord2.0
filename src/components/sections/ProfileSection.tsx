import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Camera, ExternalLink, Image as ImageIcon, Loader2, Save, UserRound } from 'lucide-react';
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

const emptyProfile = {
  display_name: '',
  bio: '',
  website_url: '',
  instagram_url: '',
  twitch_url: '',
  youtube_url: '',
};

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
  const [draft, setDraft] = useState(emptyProfile);
  const [posts, setPosts] = useState<ProfilePost[]>([]);
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
    const [profileResult, postsResult] = await Promise.all([
      supabase.from('profiles')
        .select('id, username, display_name, bio, avatar_url, banner_url, website_url, instagram_url, twitch_url, youtube_url, created_at')
        .eq('id', userId)
        .maybeSingle(),
      supabase.from('posts')
        .select('id, body, image_url, media_type, created_at, is_pinned')
        .eq('author_id', userId)
        .is('server_id', null)
        .order('created_at', { ascending: false })
        .limit(24),
    ]);
    if (profileResult.error) setError(profileResult.error.message);
    else if (profileResult.data) {
      const data = profileResult.data as ProfileData;
      setProfile(data);
      setDraft({
        display_name: data.display_name ?? '',
        bio: data.bio ?? '',
        website_url: data.website_url ?? '',
        instagram_url: data.instagram_url ?? '',
        twitch_url: data.twitch_url ?? '',
        youtube_url: data.youtube_url ?? '',
      });
    } else setError('Your profile has not been created yet. Sign out and sign in again, then retry.');
    if (postsResult.error) setError(postsResult.error.message);
    else setPosts((postsResult.data ?? []) as ProfilePost[]);
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
      ...links,
    }).eq('id', userId)
      .select('id, username, display_name, bio, avatar_url, banner_url, website_url, instagram_url, twitch_url, youtube_url, created_at')
      .single();
    if (updateError) setError(updateError.message);
    else {
      setProfile(data as ProfileData);
      setNotice('Profile saved successfully.');
    }
    setSaving(false);
  };

  const socialLinks = profile ? [
    { label: 'Website', url: profile.website_url },
    { label: 'Instagram', url: profile.instagram_url },
    { label: 'Twitch', url: profile.twitch_url },
    { label: 'YouTube', url: profile.youtube_url },
  ].filter((item): item is { label: string; url: string } => Boolean(item.url)) : [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="rounded-3xl border border-primary-400/15 bg-gradient-to-br from-primary-500/15 via-ink-900 to-ink-950 p-6 sm:p-8">
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
            <div className="relative h-36 bg-gradient-to-br from-primary-500/35 via-ink-800 to-ink-900 sm:h-48">
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
            {draft.bio && <p className="whitespace-pre-wrap break-words text-sm leading-6 text-ink-300">{draft.bio}</p>}
            {socialLinks.length > 0 && <div className="flex flex-wrap gap-2">{socialLinks.map((item) => <a key={item.label} href={item.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-primary-300 hover:bg-white/[0.07]">{item.label}<ExternalLink size={12} /></a>)}</div>}
            <div className="border-t border-white/[0.06] pt-4">
              <h3 className="mb-3 text-sm font-semibold text-ink-100">Your public posts</h3>
              {posts.length === 0 ? <p className="py-6 text-center text-sm text-ink-500">You have not published any public posts yet.</p> : <div className="grid gap-3 sm:grid-cols-2">{[...posts].sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).map((post) => <article key={post.id} className="overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-950/70">
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
