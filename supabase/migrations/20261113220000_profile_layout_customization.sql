-- Profile 5.0: public layout presets and per-section visibility.
alter table public.profiles
  add column if not exists profile_layout text not null default 'standard',
  add column if not exists profile_sections jsonb not null
    default '{"about":true,"featured":true,"links":true,"stats":true,"posts":true}'::jsonb;

alter table public.profiles drop constraint if exists profiles_profile_layout_check;
alter table public.profiles add constraint profiles_profile_layout_check check (profile_layout in ('standard', 'creator', 'minimal'));

alter table public.profiles drop constraint if exists profiles_profile_sections_check;
alter table public.profiles add constraint profiles_profile_sections_check check (
  jsonb_typeof(profile_sections) = 'object'
  and jsonb_typeof(profile_sections->'about') = 'boolean'
  and jsonb_typeof(profile_sections->'featured') = 'boolean'
  and jsonb_typeof(profile_sections->'links') = 'boolean'
  and jsonb_typeof(profile_sections->'stats') = 'boolean'
  and jsonb_typeof(profile_sections->'posts') = 'boolean'
);

grant update (profile_layout, profile_sections) on public.profiles to authenticated;
