-- Extend public profiles with social links and secure profile image storage.
alter table public.profiles
  add column if not exists website_url text,
  add column if not exists instagram_url text,
  add column if not exists twitch_url text,
  add column if not exists youtube_url text;

grant update (display_name, bio, avatar_url, banner_url, website_url, instagram_url, twitch_url, youtube_url)
  on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-media',
  'profile-media',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public profile media is viewable" on storage.objects;
create policy "Public profile media is viewable"
  on storage.objects for select
  using (bucket_id = 'profile-media');

drop policy if exists "Users upload their own profile media" on storage.objects;
create policy "Users upload their own profile media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users update their own profile media" on storage.objects;
create policy "Users update their own profile media"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users delete their own profile media" on storage.objects;
create policy "Users delete their own profile media"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'profile-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
