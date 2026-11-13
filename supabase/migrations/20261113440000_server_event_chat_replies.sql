alter table public.server_event_chat_messages
  add column if not exists reply_to_id uuid
  references public.server_event_chat_messages(id) on delete set null;

create index if not exists server_event_chat_messages_reply_idx
  on public.server_event_chat_messages(reply_to_id)
  where reply_to_id is not null;

create or replace function public.validate_server_event_chat_reply()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_event_id uuid;
begin
  if new.reply_to_id is null then
    return new;
  end if;

  select m.event_id into parent_event_id
  from public.server_event_chat_messages m
  where m.id = new.reply_to_id;

  if parent_event_id is null or parent_event_id <> new.event_id then
    raise exception 'Reply target must belong to the same event chat';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_server_event_chat_reply on public.server_event_chat_messages;
create trigger validate_server_event_chat_reply
before insert or update of reply_to_id, event_id
on public.server_event_chat_messages
for each row execute function public.validate_server_event_chat_reply();

revoke all on function public.validate_server_event_chat_reply() from public, anon, authenticated;
