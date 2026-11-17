create table if not exists public.shared_listening_rooms (
  id uuid primary key default gen_random_uuid(),
  room_type text not null check (room_type in ('conversation', 'channel', 'event')),
  room_id uuid not null,
  created_by uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  current_item_id uuid,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_type, room_id)
);

create table if not exists public.shared_listening_queue (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.shared_listening_rooms(id) on delete cascade,
  provider text not null check (provider in ('spotify', 'youtube')),
  external_url text not null check (
    char_length(external_url) between 12 and 2048
    and external_url ~ '^https://(open\\.spotify\\.com/|youtu\\.be/|([a-z0-9-]+\\.)?youtube\\.com/|music\\.youtube\\.com/)'
  ),
  added_by uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists shared_listening_queue_room_created_idx
  on public.shared_listening_queue(room_id, created_at, id);

create or replace function public.can_access_shared_listening_room(p_room_type text, p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_room_type
    when 'conversation' then public.is_conversation_member(p_room_id)
    when 'channel' then public.can_view_channel(p_room_id)
    when 'event' then exists (
      select 1
      from public.server_events e
      join public.server_members sm on sm.server_id = e.server_id
      where e.id = p_room_id and sm.user_id = auth.uid()
    )
    else false
  end;
$$;

create or replace function public.get_or_create_shared_listening_room(p_room_type text, p_room_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room_id uuid;
begin
  if auth.uid() is null then raise exception 'You must be logged in.'; end if;
  if p_room_type not in ('conversation', 'channel', 'event')
    or not public.can_access_shared_listening_room(p_room_type, p_room_id) then
    raise exception 'You do not have access to this listening room.';
  end if;

  insert into public.shared_listening_rooms(room_type, room_id, created_by)
  values (p_room_type, p_room_id, auth.uid())
  on conflict (room_type, room_id) do nothing;

  select id into v_room_id
  from public.shared_listening_rooms
  where room_type = p_room_type and room_id = p_room_id;

  return v_room_id;
end;
$$;

alter table public.shared_listening_rooms enable row level security;
alter table public.shared_listening_queue enable row level security;

grant select, insert on public.shared_listening_rooms to authenticated;
grant update (current_item_id, updated_by) on public.shared_listening_rooms to authenticated;
grant select, insert, delete on public.shared_listening_queue to authenticated;

drop policy if exists shared_listening_rooms_select_members on public.shared_listening_rooms;
create policy shared_listening_rooms_select_members on public.shared_listening_rooms
for select to authenticated
using (public.can_access_shared_listening_room(room_type, room_id));

drop policy if exists shared_listening_rooms_insert_members on public.shared_listening_rooms;
create policy shared_listening_rooms_insert_members on public.shared_listening_rooms
for insert to authenticated
with check (
  created_by = auth.uid()
  and public.can_access_shared_listening_room(room_type, room_id)
);

drop policy if exists shared_listening_rooms_update_members on public.shared_listening_rooms;
create policy shared_listening_rooms_update_members on public.shared_listening_rooms
for update to authenticated
using (public.can_access_shared_listening_room(room_type, room_id))
with check (
  updated_by = auth.uid()
  and public.can_access_shared_listening_room(room_type, room_id)
  and true
);

drop policy if exists shared_listening_queue_select_members on public.shared_listening_queue;
create policy shared_listening_queue_select_members on public.shared_listening_queue
for select to authenticated
using (exists (
  select 1 from public.shared_listening_rooms r
  where r.id = shared_listening_queue.room_id
    and public.can_access_shared_listening_room(r.room_type, r.room_id)
));

drop policy if exists shared_listening_queue_insert_members on public.shared_listening_queue;
create policy shared_listening_queue_insert_members on public.shared_listening_queue
for insert to authenticated
with check (
  added_by = auth.uid()
  and exists (
    select 1 from public.shared_listening_rooms r
    where r.id = shared_listening_queue.room_id
      and public.can_access_shared_listening_room(r.room_type, r.room_id)
  )
);

drop policy if exists shared_listening_queue_delete_members on public.shared_listening_queue;
create policy shared_listening_queue_delete_members on public.shared_listening_queue
for delete to authenticated
using (exists (
  select 1 from public.shared_listening_rooms r
  where r.id = shared_listening_queue.room_id
    and public.can_access_shared_listening_room(r.room_type, r.room_id)
));

revoke all on function public.can_access_shared_listening_room(text, uuid) from public, anon;
grant execute on function public.can_access_shared_listening_room(text, uuid) to authenticated;
revoke all on function public.get_or_create_shared_listening_room(text, uuid) from public, anon;
grant execute on function public.get_or_create_shared_listening_room(text, uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'shared_listening_rooms'
  ) then
    alter publication supabase_realtime add table public.shared_listening_rooms;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'shared_listening_queue'
  ) then
    alter publication supabase_realtime add table public.shared_listening_queue;
  end if;
end;
$$;
