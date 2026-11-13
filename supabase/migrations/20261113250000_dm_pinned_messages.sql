create table if not exists public.conversation_pinned_messages (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  pinned_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  pinned_at timestamptz not null default now(),
  primary key (conversation_id, message_id)
);

alter table public.conversation_pinned_messages enable row level security;

drop policy if exists "Conversation members can view pinned messages" on public.conversation_pinned_messages;
create policy "Conversation members can view pinned messages"
on public.conversation_pinned_messages for select to authenticated
using (
  exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = conversation_pinned_messages.conversation_id
      and cm.user_id = auth.uid()
  )
);

drop policy if exists "Conversation members can pin messages" on public.conversation_pinned_messages;
create policy "Conversation members can pin messages"
on public.conversation_pinned_messages for insert to authenticated
with check (
  pinned_by = auth.uid()
  and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = conversation_pinned_messages.conversation_id
      and cm.user_id = auth.uid()
  )
  and exists (
    select 1 from public.messages m
    where m.id = conversation_pinned_messages.message_id
      and m.conversation_id = conversation_pinned_messages.conversation_id
  )
);

drop policy if exists "Conversation members can unpin messages" on public.conversation_pinned_messages;
create policy "Conversation members can unpin messages"
on public.conversation_pinned_messages for delete to authenticated
using (
  exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = conversation_pinned_messages.conversation_id
      and cm.user_id = auth.uid()
  )
);

revoke all on public.conversation_pinned_messages from anon, public;
grant select, insert, delete on public.conversation_pinned_messages to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversation_pinned_messages'
  ) then
    alter publication supabase_realtime
      add table public.conversation_pinned_messages;
  end if;
end
$$;
