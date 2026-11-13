create or replace function public.update_server_event_chat_poll(
  p_poll_id uuid,
  p_question text,
  p_options jsonb,
  p_allow_multiple boolean
)
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
  v_option_count integer;
  v_options jsonb;
begin
  if v_user_id is null then raise exception 'You must be logged in.'; end if;
  select * into v_poll from public.server_event_chat_polls where id = p_poll_id for update;
  if not found then raise exception 'Poll not found.'; end if;
  select e.server_id into v_server_id from public.server_events e where e.id = v_poll.event_id;
  select sm.role into v_role from public.server_members sm where sm.server_id = v_server_id and sm.user_id = v_user_id;
  if v_role is null then raise exception 'Poll is not accessible.'; end if;
  if v_poll.created_by <> v_user_id and v_role not in ('owner', 'admin', 'moderator') then
    raise exception 'Only the poll creator or a server moderator can edit this poll.';
  end if;
  if v_poll.closed_at is not null or (v_poll.expires_at is not null and v_poll.expires_at <= now()) then
    raise exception 'Closed polls cannot be edited.';
  end if;
  if exists (select 1 from public.server_event_chat_poll_votes where poll_id = p_poll_id) then
    raise exception 'A poll can only be edited before anyone votes.';
  end if;
  if p_question is null or char_length(btrim(p_question)) not between 1 and 200 then
    raise exception 'Poll question must contain 1–200 characters.';
  end if;
  if p_options is null or jsonb_typeof(p_options) <> 'array' then raise exception 'Poll options must be a JSON array.'; end if;
  select count(*) into v_option_count from jsonb_array_elements_text(p_options);
  if v_option_count < 2 or v_option_count > 6 then raise exception 'A poll must have between 2 and 6 options.'; end if;
  if exists (select 1 from jsonb_array_elements_text(p_options) as o(value) where char_length(btrim(o.value)) not between 1 and 80) then
    raise exception 'Each option must contain 1–80 characters.';
  end if;
  if (select count(distinct lower(btrim(o.value))) from jsonb_array_elements_text(p_options) as o(value)) <> v_option_count then
    raise exception 'Poll options must be unique.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', gen_random_uuid()::text, 'label', btrim(o.value)) order by o.ordinality), '[]'::jsonb)
  into v_options
  from jsonb_array_elements_text(p_options) with ordinality as o(value, ordinality);
  update public.server_event_chat_polls
  set question = btrim(p_question), options = v_options, allow_multiple = coalesce(p_allow_multiple, false)
  where id = p_poll_id;
end;
$$;

revoke all on function public.update_server_event_chat_poll(uuid, text, jsonb, boolean) from public, anon;
grant execute on function public.update_server_event_chat_poll(uuid, text, jsonb, boolean) to authenticated;
