-- Allow server members to pin messages in their text channels.
create table if not exists public.channel_pinned_messages (
  channel_id uuid not null references public.channels(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  pinned_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  pinned_at timestamptz not null default now(),
  primary key (channel_id, message_id)
);

alter table public.channel_pinned_messages enable row level security;

drop policy if exists "Channel members can view pinned messages" on public.channel_pinned_messages;
create policy "Channel members can view pinned messages"
on public.channel_pinned_messages for select to authenticated
using (public.can_view_channel(channel_id));

drop policy if exists "Channel members can pin messages" on public.channel_pinned_messages;
create policy "Channel members can pin messages"
on public.channel_pinned_messages for insert to authenticated
with check (
  pinned_by = auth.uid()
  and public.can_view_channel(channel_id)
  and exists (
    select 1 from public.messages m
    where m.id = channel_pinned_messages.message_id
      and m.channel_id = channel_pinned_messages.channel_id
  )
);

drop policy if exists "Channel members can unpin messages" on public.channel_pinned_messages;
create policy "Channel members can unpin messages"
on public.channel_pinned_messages for delete to authenticated
using (public.can_view_channel(channel_id));

revoke all on public.channel_pinned_messages from anon, public;
grant select, insert, delete on public.channel_pinned_messages to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'channel_pinned_messages'
  ) then
    alter publication supabase_realtime add table public.channel_pinned_messages;
  end if;
end
$$;
