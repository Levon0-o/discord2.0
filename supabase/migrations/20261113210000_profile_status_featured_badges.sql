-- Profile 4.0: public status, featured post and staff-awarded badges.
alter table public.profiles
  add column if not exists user_status text not null default 'online',
  add column if not exists status_message text not null default '',
  add column if not exists featured_post_id uuid null references public.posts(id) on delete set null;

alter table public.profiles
  drop constraint if exists profiles_user_status_check;
alter table public.profiles
  add constraint profiles_user_status_check
  check (user_status in ('online', 'away', 'busy', 'dnd'));

alter table public.profiles
  drop constraint if exists profiles_status_message_length_check;
alter table public.profiles
  add constraint profiles_status_message_length_check
  check (char_length(status_message) <= 60);

create index if not exists profiles_featured_post_idx
  on public.profiles(featured_post_id)
  where featured_post_id is not null;

create or replace function public.validate_profile_featured_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.featured_post_id is not null and not exists (
    select 1
    from public.posts p
    where p.id = new.featured_post_id
      and p.author_id = new.id
      and p.server_id is null
  ) then
    raise exception 'Featured post must be one of your own public posts.';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_profile_featured_post on public.profiles;
create trigger validate_profile_featured_post
before insert or update of featured_post_id on public.profiles
for each row execute function public.validate_profile_featured_post();

revoke all on function public.validate_profile_featured_post() from public, anon, authenticated;

grant update (user_status, status_message, featured_post_id)
  on public.profiles to authenticated;

create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_key text not null check (badge_key in ('founder', 'early_member', 'verified', 'creator')),
  granted_at timestamptz not null default now(),
  granted_by uuid null references public.profiles(id) on delete set null,
  unique (user_id, badge_key)
);

create index if not exists user_badges_user_idx
  on public.user_badges(user_id, granted_at desc);

alter table public.user_badges enable row level security;

drop policy if exists "Badges are publicly readable" on public.user_badges;
create policy "Badges are publicly readable"
  on public.user_badges for select to authenticated
  using (true);

revoke all on public.user_badges from public, anon, authenticated;
grant select on public.user_badges to authenticated;
