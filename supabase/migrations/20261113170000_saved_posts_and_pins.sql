-- User bookmarks and profile-pinned public posts.
alter table public.posts
  add column if not exists is_pinned boolean not null default false;

create index if not exists posts_author_pinned_created_idx
  on public.posts (author_id, is_pinned desc, created_at desc)
  where server_id is null;

create table if not exists public.saved_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint saved_posts_user_post_unique unique (user_id, post_id)
);

create index if not exists saved_posts_user_created_idx
  on public.saved_posts (user_id, created_at desc);

alter table public.saved_posts enable row level security;

drop policy if exists "Users can view their saved posts" on public.saved_posts;
create policy "Users can view their saved posts"
  on public.saved_posts for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Users can save public posts" on public.saved_posts;
create policy "Users can save public posts"
  on public.saved_posts for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.posts p
      where p.id = post_id and p.server_id is null
    )
  );

drop policy if exists "Users can unsave their posts" on public.saved_posts;
create policy "Users can unsave their posts"
  on public.saved_posts for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.saved_posts from public, anon;
grant select, insert, delete on public.saved_posts to authenticated;
