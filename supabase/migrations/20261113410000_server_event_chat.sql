create table if not exists public.server_event_chat_messages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.server_events(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists server_event_chat_messages_event_created_idx
  on public.server_event_chat_messages(event_id, created_at asc, id asc);

alter table public.server_event_chat_messages enable row level security;

drop policy if exists server_event_chat_read_members on public.server_event_chat_messages;
create policy server_event_chat_read_members
on public.server_event_chat_messages for select to authenticated
using (
  exists (
    select 1
    from public.server_events e
    join public.server_members sm on sm.server_id = e.server_id
    where e.id = server_event_chat_messages.event_id
      and sm.user_id = auth.uid()
  )
);

drop policy if exists server_event_chat_insert_members on public.server_event_chat_messages;
create policy server_event_chat_insert_members
on public.server_event_chat_messages for insert to authenticated
with check (
  author_id = auth.uid()
  and char_length(btrim(body)) between 1 and 2000
  and exists (
    select 1
    from public.server_events e
    join public.server_members sm on sm.server_id = e.server_id
    where e.id = server_event_chat_messages.event_id
      and sm.user_id = auth.uid()
  )
);

drop policy if exists server_event_chat_delete_author_or_mod on public.server_event_chat_messages;
create policy server_event_chat_delete_author_or_mod
on public.server_event_chat_messages for delete to authenticated
using (
  exists (
    select 1
    from public.server_events e
    join public.server_members sm on sm.server_id = e.server_id
    where e.id = server_event_chat_messages.event_id
      and sm.user_id = auth.uid()
      and (
        server_event_chat_messages.author_id = auth.uid()
        or sm.role in ('owner', 'admin', 'moderator')
      )
  )
);

grant select, insert, delete on public.server_event_chat_messages to authenticated;
revoke update on public.server_event_chat_messages from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'server_event_chat_messages'
     ) then
    alter publication supabase_realtime add table public.server_event_chat_messages;
  end if;
end;
$$;
