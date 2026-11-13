-- Profile 3.0: selectable profile accent themes.
alter table public.profiles
  add column if not exists profile_theme text not null default 'blue';

alter table public.profiles
  drop constraint if exists profiles_profile_theme_check;

alter table public.profiles
  add constraint profiles_profile_theme_check
  check (profile_theme in ('blue', 'violet', 'crimson', 'emerald', 'amber'));

grant update (profile_theme)
  on public.profiles to authenticated;
