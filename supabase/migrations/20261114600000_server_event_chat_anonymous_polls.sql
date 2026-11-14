alter table public.server_event_chat_polls
  add column if not exists is_anonymous boolean not null default false;

drop policy if exists server_event_chat_poll_votes_read on public.server_event_chat_poll_votes;
create policy server_event_chat_poll_votes_read on public.server_event_chat_poll_votes
  for select to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.server_event_chat_polls p
      join public.server_events e on e.id = p.event_id
      join public.server_members sm on sm.server_id = e.server_id
      where p.id = server_event_chat_poll_votes.poll_id
        and sm.user_id = auth.uid()
        and p.is_anonymous = false
    )
  );

drop function if exists public.create_server_event_chat_poll(uuid, text, jsonb, boolean, timestamptz);
create function public.create_server_event_chat_poll(
  p_event_id uuid,
  p_question text,
  p_options jsonb,
  p_allow_multiple boolean default false,
  p_expires_at timestamptz default null,
  p_is_anonymous boolean default false
)
returns table (poll_id uuid, message_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_server_id uuid;
  v_message_id uuid;
  v_poll_id uuid;
  v_options jsonb;
  v_option_count integer;
begin
  if v_user_id is null then raise exception 'You must be logged in.'; end if;
  select e.server_id into v_server_id from public.server_events e where e.id = p_event_id;
  if v_server_id is null or not exists (
    select 1 from public.server_members sm where sm.server_id = v_server_id and sm.user_id = v_user_id
  ) then raise exception 'You must be an event server member to create a poll.'; end if;
  if p_question is null or char_length(btrim(p_question)) not between 1 and 200 then
    raise exception 'Poll question must contain 1–200 characters.';
  end if;
  if p_options is null or jsonb_typeof(p_options) <> 'array' then raise exception 'Poll options must be a JSON array.'; end if;
  select count(*) into v_option_count from jsonb_array_elements(p_options);
  if v_option_count < 2 or v_option_count > 6 then raise exception 'A poll must have between 2 and 6 options.'; end if;
  if exists (
    select 1 from jsonb_array_elements_text(p_options) as o(value)
    where char_length(btrim(o.value)) not between 1 and 80
  ) then raise exception 'Each option must contain 1–80 characters.'; end if;
  if (select count(distinct lower(btrim(o.value))) from jsonb_array_elements_text(p_options) as o(value)) <> v_option_count then
    raise exception 'Poll options must be unique.';
  end if;
  if p_expires_at is not null and (p_expires_at <= now() or p_expires_at > now() + interval '30 days') then
    raise exception 'Poll expiration must be within the next 30 days.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', gen_random_uuid()::text, 'label', btrim(o.value)) order by o.ordinality), '[]'::jsonb)
  into v_options
  from jsonb_array_elements_text(p_options) with ordinality as o(value, ordinality);

  insert into public.server_event_chat_messages(event_id, author_id, body)
  values (p_event_id, v_user_id, 'Poll')
  returning id into v_message_id;

  insert into public.server_event_chat_polls(event_id, message_id, created_by, question, options, allow_multiple, expires_at, is_anonymous)
  values (p_event_id, v_message_id, v_user_id, btrim(p_question), v_options, coalesce(p_allow_multiple, false), p_expires_at, coalesce(p_is_anonymous, false))
  returning id into v_poll_id;

  return query select v_poll_id, v_message_id;
end;
$$;

drop function if exists public.update_server_event_chat_poll(uuid, text, jsonb, boolean);
create function public.update_server_event_chat_poll(
  p_poll_id uuid,
  p_question text,
  p_options jsonb,
  p_allow_multiple boolean,
  p_is_anonymous boolean default false
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
  set question = btrim(p_question),
      options = v_options,
      allow_multiple = coalesce(p_allow_multiple, false),
      is_anonymous = coalesce(p_is_anonymous, false)
  where id = p_poll_id;
end;
$$;

create or replace function public.fetch_server_event_chat_poll_votes(p_event_id uuid)
returns table (
  id uuid,
  poll_id uuid,
  option_id text,
  user_id uuid,
  created_at timestamptz,
  voter_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'You must be logged in.'; end if;
  if not exists (
    select 1 from public.server_events e
    join public.server_members sm on sm.server_id = e.server_id
    where e.id = p_event_id and sm.user_id = auth.uid()
  ) then raise exception 'You must be an event server member.'; end if;

  return query
  select
    v.id,
    v.poll_id,
    v.option_id,
    case when p.is_anonymous and v.user_id <> auth.uid() then null::uuid else v.user_id end,
    v.created_at,
    counts.voter_count
  from public.server_event_chat_poll_votes v
  join public.server_event_chat_polls p on p.id = v.poll_id
  join (
    select poll_id, count(distinct user_id) as voter_count
    from public.server_event_chat_poll_votes
    group by poll_id
  ) counts on counts.poll_id = v.poll_id
  where p.event_id = p_event_id
  order by v.created_at asc;
end;
$$;

revoke all on function public.create_server_event_chat_poll(uuid, text, jsonb, boolean, timestamptz, boolean) from public, anon;
revoke all on function public.update_server_event_chat_poll(uuid, text, jsonb, boolean, boolean) from public, anon;
revoke all on function public.fetch_server_event_chat_poll_votes(uuid) from public, anon;
grant execute on function public.create_server_event_chat_poll(uuid, text, jsonb, boolean, timestamptz, boolean) to authenticated;
grant execute on function public.update_server_event_chat_poll(uuid, text, jsonb, boolean, boolean) to authenticated;
grant execute on function public.fetch_server_event_chat_poll_votes(uuid) to authenticated;
