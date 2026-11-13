-- Per-user saved channel messages (bookmarks).
create table if not exists public.channel_saved_messages (
  channel_id uuid not null references public.channels(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  saved_at timestamptz not null default now(),
  primary key (user_id, message_id)
);

create index if not exists channel_saved_messages_user_channel_idx
  on public.channel_saved_messages(user_id, channel_id, saved_at desc);

alter table public.channel_saved_messages enable row level security;

drop policy if exists channel_saved_messages_select_own on public.channel_saved_messages;
create policy channel_saved_messages_select_own
  on public.channel_saved_messages for select to authenticated
  using (user_id = auth.uid() and public.can_view_channel(channel_id));

drop policy if exists channel_saved_messages_insert_own on public.channel_saved_messages;
create policy channel_saved_messages_insert_own
  on public.channel_saved_messages for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.can_view_channel(channel_id)
    and exists (
      select 1 from public.messages m
      where m.id = message_id and m.channel_id = channel_id
    )
  );

drop policy if exists channel_saved_messages_delete_own on public.channel_saved_messages;
create policy channel_saved_messages_delete_own
  on public.channel_saved_messages for delete to authenticated
  using (user_id = auth.uid() and public.can_view_channel(channel_id));

comment on table public.channel_saved_messages is
  'Private per-user bookmarks for messages in server channels.';
