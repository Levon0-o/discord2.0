create table if not exists public.server_event_chat_reactions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.server_events(id) on delete cascade,
  message_id uuid not null references public.server_event_chat_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('👍','❤️','😂','😮','🎉')),
  created_at timestamptz not null default now(),
  unique (message_id, user_id, emoji)
);

create index if not exists server_event_chat_reactions_event_idx
  on public.server_event_chat_reactions(event_id, message_id);

alter table public.server_event_chat_reactions enable row level security;

drop policy if exists server_event_chat_reactions_read_members on public.server_event_chat_reactions;
create policy server_event_chat_reactions_read_members
on public.server_event_chat_reactions for select to authenticated
using (
  exists (
    select 1 from public.server_events e
    join public.server_members sm on sm.server_id = e.server_id
    where e.id = server_event_chat_reactions.event_id
      and sm.user_id = auth.uid()
  )
);

drop policy if exists server_event_chat_reactions_insert_members on public.server_event_chat_reactions;
create policy server_event_chat_reactions_insert_members
on public.server_event_chat_reactions for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.server_event_chat_messages m
    join public.server_events e on e.id = m.event_id
    join public.server_members sm on sm.server_id = e.server_id
    where m.id = server_event_chat_reactions.message_id
      and m.event_id = server_event_chat_reactions.event_id
      and sm.user_id = auth.uid()
  )
);

drop policy if exists server_event_chat_reactions_delete_own on public.server_event_chat_reactions;
create policy server_event_chat_reactions_delete_own
on public.server_event_chat_reactions for delete to authenticated
using (user_id = auth.uid());

grant select, insert, delete on public.server_event_chat_reactions to authenticated;
revoke update on public.server_event_chat_reactions from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'server_event_chat_reactions'
     ) then
    alter publication supabase_realtime add table public.server_event_chat_reactions;
  end if;
end;
$$;
