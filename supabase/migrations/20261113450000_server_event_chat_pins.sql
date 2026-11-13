create unique index if not exists server_event_chat_messages_id_event_uidx
  on public.server_event_chat_messages(id, event_id);

create table if not exists public.server_event_chat_pins (
  event_id uuid not null references public.server_events(id) on delete cascade,
  message_id uuid not null,
  pinned_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, message_id),
  constraint server_event_chat_pins_message_event_fk
    foreign key (message_id, event_id)
    references public.server_event_chat_messages(id, event_id)
    on delete cascade
);

create index if not exists server_event_chat_pins_event_created_idx
  on public.server_event_chat_pins(event_id, created_at desc);

alter table public.server_event_chat_pins enable row level security;

drop policy if exists server_event_chat_pins_read_members on public.server_event_chat_pins;
create policy server_event_chat_pins_read_members
on public.server_event_chat_pins for select to authenticated
using (
  exists (
    select 1
    from public.server_events e
    join public.server_members sm on sm.server_id = e.server_id
    where e.id = server_event_chat_pins.event_id
      and sm.user_id = auth.uid()
  )
);

drop policy if exists server_event_chat_pins_insert_moderators on public.server_event_chat_pins;
create policy server_event_chat_pins_insert_moderators
on public.server_event_chat_pins for insert to authenticated
with check (
  pinned_by = auth.uid()
  and exists (
    select 1
    from public.server_events e
    join public.server_members sm on sm.server_id = e.server_id
    where e.id = server_event_chat_pins.event_id
      and sm.user_id = auth.uid()
      and sm.role in ('owner', 'admin', 'moderator')
  )
);

drop policy if exists server_event_chat_pins_delete_moderators on public.server_event_chat_pins;
create policy server_event_chat_pins_delete_moderators
on public.server_event_chat_pins for delete to authenticated
using (
  exists (
    select 1
    from public.server_events e
    join public.server_members sm on sm.server_id = e.server_id
    where e.id = server_event_chat_pins.event_id
      and sm.user_id = auth.uid()
      and sm.role in ('owner', 'admin', 'moderator')
  )
);

grant select, insert, delete on public.server_event_chat_pins to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'server_event_chat_pins'
     ) then
    alter publication supabase_realtime add table public.server_event_chat_pins;
  end if;
end;
$$;
