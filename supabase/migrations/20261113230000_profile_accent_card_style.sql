-- Profile 6.0: custom accent color and profile card surface.
alter table public.profiles
  add column if not exists profile_accent_color text not null default '#38bdf8',
  add column if not exists profile_card_style text not null default 'glass';

alter table public.profiles
  drop constraint if exists profiles_profile_accent_color_check;
alter table public.profiles
  add constraint profiles_profile_accent_color_check
  check (profile_accent_color ~ '^#[0-9a-fA-F]{6}$');

alter table public.profiles
  drop constraint if exists profiles_profile_card_style_check;
alter table public.profiles
  add constraint profiles_profile_card_style_check
  check (profile_card_style in ('glass', 'solid', 'gradient'));

grant update (profile_accent_color, profile_card_style)
  on public.profiles to authenticated;
