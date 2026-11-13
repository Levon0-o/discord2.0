/* Event Chat 25.0 — personal saved messages */

create table if not exists public.server_event_chat_saved_messages (
  event_id uuid not null references public.server_events(id) on delete cascade,
  message_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '',
  saved_at timestamptz not null default now(),
  primary key (user_id, message_id),
  constraint server_event_chat_saved_message_event_fk
    foreign key (message_id, event_id)
    references public.server_event_chat_messages(id, event_id)
    on delete cascade
);

create index if not exists server_event_chat_saved_messages_user_event_idx
  on public.server_event_chat_saved_messages(user_id, event_id, saved_at desc);

alter table public.server_event_chat_saved_messages enable row level security;

drop policy if exists server_event_chat_saved_select_own on public.server_event_chat_saved_messages;
create policy server_event_chat_saved_select_own
on public.server_event_chat_saved_messages for select to authenticated
using (user_id = auth.uid());

drop policy if exists server_event_chat_saved_insert_own on public.server_event_chat_saved_messages;
create policy server_event_chat_saved_insert_own
on public.server_event_chat_saved_messages for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.server_events e
    join public.server_members sm on sm.server_id = e.server_id
    where e.id = server_event_chat_saved_messages.event_id
      and sm.user_id = auth.uid()
  )
  and exists (
    select 1 from public.server_event_chat_messages m
    where m.id = server_event_chat_saved_messages.message_id
      and m.event_id = server_event_chat_saved_messages.event_id
      and m.author_id = server_event_chat_saved_messages.author_id
      and m.body = server_event_chat_saved_messages.body
  )
);

drop policy if exists server_event_chat_saved_delete_own on public.server_event_chat_saved_messages;
create policy server_event_chat_saved_delete_own
on public.server_event_chat_saved_messages for delete to authenticated
using (user_id = auth.uid());

grant select, insert, delete on public.server_event_chat_saved_messages to authenticated;
