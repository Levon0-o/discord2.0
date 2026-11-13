alter table public.server_event_chat_messages
  add column if not exists edited_at timestamptz;

drop policy if exists server_event_chat_update_author on public.server_event_chat_messages;
create policy server_event_chat_update_author
on public.server_event_chat_messages for update to authenticated
using (
  author_id = auth.uid()
  and exists (
    select 1
    from public.server_events e
    join public.server_members sm on sm.server_id = e.server_id
    where e.id = server_event_chat_messages.event_id
      and sm.user_id = auth.uid()
  )
)
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

create or replace function public.set_server_event_chat_edited_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.edited_at = now();
  return new;
end;
$$;

drop trigger if exists server_event_chat_set_edited_at on public.server_event_chat_messages;
create trigger server_event_chat_set_edited_at
before update of body on public.server_event_chat_messages
for each row execute function public.set_server_event_chat_edited_at();

grant update (body) on public.server_event_chat_messages to authenticated;
revoke update on public.server_event_chat_messages from anon;
