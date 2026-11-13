create or replace function public.delete_server_event_chat_poll(p_poll_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_poll public.server_event_chat_polls%rowtype;
  v_server_id uuid;
  v_role text;
begin
  if v_user_id is null then
    raise exception 'You must be logged in.';
  end if;

  select * into v_poll
  from public.server_event_chat_polls
  where id = p_poll_id
  for update;

  if not found then
    raise exception 'Poll not found.';
  end if;

  select e.server_id into v_server_id
  from public.server_events e
  where e.id = v_poll.event_id;

  select sm.role into v_role
  from public.server_members sm
  where sm.server_id = v_server_id
    and sm.user_id = v_user_id;

  if v_role is null then
    raise exception 'Poll is not accessible.';
  end if;

  if v_poll.created_by <> v_user_id
    and v_role not in ('owner', 'admin', 'moderator') then
    raise exception 'Only the poll creator or a server moderator can delete this poll.';
  end if;

  delete from public.server_event_chat_poll_votes
  where poll_id = p_poll_id;

  delete from public.server_event_chat_polls
  where id = p_poll_id;

  delete from public.server_event_chat_messages
  where id = v_poll.message_id;
end;
$$;

revoke all on function public.delete_server_event_chat_poll(uuid) from public, anon;
grant execute on function public.delete_server_event_chat_poll(uuid) to authenticated;
