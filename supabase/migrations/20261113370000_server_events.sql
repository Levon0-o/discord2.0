create table if not exists public.server_events (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 2000),
  location text not null default '' check (char_length(location) <= 160),
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint server_events_end_after_start check (ends_at is null or ends_at > starts_at)
);

create index if not exists server_events_server_starts_idx
  on public.server_events(server_id, starts_at asc);

create table if not exists public.server_event_rsvps (
  event_id uuid not null references public.server_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('going', 'interested', 'not_going')),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists server_event_rsvps_event_status_idx
  on public.server_event_rsvps(event_id, status);

alter table public.server_events enable row level security;
alter table public.server_event_rsvps enable row level security;

drop policy if exists server_events_member_read on public.server_events;
create policy server_events_member_read on public.server_events
  for select to authenticated
  using (exists (
    select 1 from public.server_members sm
    where sm.server_id = server_events.server_id and sm.user_id = auth.uid()
  ));

drop policy if exists server_event_rsvps_member_read on public.server_event_rsvps;
create policy server_event_rsvps_member_read on public.server_event_rsvps
  for select to authenticated
  using (exists (
    select 1
    from public.server_events e
    join public.server_members sm on sm.server_id = e.server_id
    where e.id = server_event_rsvps.event_id and sm.user_id = auth.uid()
  ));

grant select on public.server_events, public.server_event_rsvps to authenticated;
revoke insert, update, delete on public.server_events, public.server_event_rsvps from anon, authenticated;

create or replace function public.create_server_event(
  p_server_id uuid,
  p_title text,
  p_description text,
  p_location text,
  p_starts_at timestamptz,
  p_ends_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_event_id uuid;
  v_role text;
begin
  if v_user_id is null then raise exception 'You must be logged in.'; end if;
  select sm.role into v_role
  from public.server_members sm
  where sm.server_id = p_server_id and sm.user_id = v_user_id;

  if v_role is null then raise exception 'You must be a server member to create events.'; end if;
  if v_role not in ('owner', 'admin', 'moderator') then
    raise exception 'Only server moderators and administrators can create events.';
  end if;
  if p_title is null or char_length(btrim(p_title)) not between 1 and 120 then
    raise exception 'Event title must contain 1–120 characters.';
  end if;
  if p_description is not null and char_length(p_description) > 2000 then
    raise exception 'Event description is too long.';
  end if;
  if p_location is not null and char_length(p_location) > 160 then
    raise exception 'Event location is too long.';
  end if;
  if p_starts_at is null or p_starts_at < now() - interval '1 minute' then
    raise exception 'Event start must be in the future.';
  end if;
  if p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'Event end must be after its start.';
  end if;

  insert into public.server_events(server_id, created_by, title, description, location, starts_at, ends_at)
  values (p_server_id, v_user_id, btrim(p_title), coalesce(p_description, ''), coalesce(p_location, ''), p_starts_at, p_ends_at)
  returning id into v_event_id;

  return v_event_id;
end;
$$;

create or replace function public.set_server_event_rsvp(p_event_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_server_id uuid;
begin
  if v_user_id is null then raise exception 'You must be logged in.'; end if;
  if p_status not in ('going', 'interested', 'not_going') then raise exception 'Invalid RSVP status.'; end if;

  select e.server_id into v_server_id
  from public.server_events e
  where e.id = p_event_id;

  if v_server_id is null then raise exception 'Event not found.'; end if;
  if not exists (
    select 1 from public.server_members sm
    where sm.server_id = v_server_id and sm.user_id = v_user_id
  ) then raise exception 'You must be a server member to respond.'; end if;

  insert into public.server_event_rsvps(event_id, user_id, status, updated_at)
  values (p_event_id, v_user_id, p_status, now())
  on conflict (event_id, user_id) do update
    set status = excluded.status, updated_at = now();
end;
$$;

revoke all on function public.create_server_event(uuid, text, text, text, timestamptz, timestamptz) from public, anon;
revoke all on function public.set_server_event_rsvp(uuid, text) from public, anon;
grant execute on function public.create_server_event(uuid, text, text, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.set_server_event_rsvp(uuid, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'server_events'
    ) then execute 'alter publication supabase_realtime add table public.server_events'; end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'server_event_rsvps'
    ) then execute 'alter publication supabase_realtime add table public.server_event_rsvps'; end if;
  end if;
end;
$$;
