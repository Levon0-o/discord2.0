-- Poll editing and immutable single-choice votes for social and channel polls.
-- Editing is allowed only before the first vote so existing vote records cannot become ambiguous.

create or replace function public.cast_social_poll_vote(p_poll_id uuid, p_option_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Authentication required'; end if;

  perform 1
  from public.social_polls
  where id = p_poll_id and (ends_at is null or ends_at > now())
  for update;
  if not found then raise exception 'Poll is closed or does not exist'; end if;

  if not exists (
    select 1 from public.social_poll_options
    where id = p_option_id and poll_id = p_poll_id
  ) then raise exception 'Invalid poll option'; end if;

  if exists (
    select 1 from public.social_poll_votes
    where poll_id = p_poll_id and user_id = v_user
  ) then
    raise exception 'You have already voted in this poll';
  end if;

  insert into public.social_poll_votes (poll_id, option_id, user_id)
  values (p_poll_id, p_option_id, v_user);
end;
$$;

create or replace function public.update_social_poll(
  p_poll_id uuid,
  p_question text,
  p_options text[],
  p_ends_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_post_id uuid;
  v_option text;
  v_position integer := 0;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select sp.post_id into v_post_id
  from public.social_polls sp
  join public.posts p on p.id = sp.post_id
  where sp.id = p_poll_id and p.author_id = v_user
  for update of sp, p;
  if not found then raise exception 'Only the poll author can edit this poll'; end if;

  if exists (select 1 from public.social_poll_votes where poll_id = p_poll_id) then
    raise exception 'A poll cannot be edited after voting has started';
  end if;
  if p_question is null or char_length(btrim(p_question)) not between 1 and 200 then
    raise exception 'Poll question must contain 1–200 characters';
  end if;
  if p_options is null or cardinality(p_options) not between 2 and 6 then
    raise exception 'A poll must have between 2 and 6 options';
  end if;
  if p_ends_at is not null and p_ends_at <= now() then
    raise exception 'Poll end time must be in the future';
  end if;

  foreach v_option in array p_options loop
    if char_length(btrim(coalesce(v_option, ''))) not between 1 and 100 then
      raise exception 'Each option must be between 1 and 100 characters';
    end if;
    if exists (
      select 1 from unnest(p_options[1:v_position]) prior(value)
      where lower(btrim(prior.value)) = lower(btrim(v_option))
    ) then
      raise exception 'Poll options must be unique';
    end if;
    v_position := v_position + 1;
  end loop;

  update public.posts set body = btrim(p_question) where id = v_post_id;
  update public.social_polls set ends_at = p_ends_at where id = p_poll_id;
  delete from public.social_poll_options where poll_id = p_poll_id;
  v_position := 0;
  foreach v_option in array p_options loop
    insert into public.social_poll_options (poll_id, label, position)
    values (p_poll_id, btrim(v_option), v_position);
    v_position := v_position + 1;
  end loop;
end;
$$;

create or replace function public.cast_channel_poll_vote(
  p_poll_id uuid,
  p_option_id text,
  p_selected boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_poll public.channel_polls%rowtype;
begin
  if v_user_id is null then raise exception 'You must be logged in.'; end if;
  select * into v_poll from public.channel_polls where id = p_poll_id for update;
  if not found or not public.can_view_channel(v_poll.channel_id) then
    raise exception 'Poll not found or not accessible.';
  end if;
  if v_poll.closed_at is not null or (v_poll.expires_at is not null and v_poll.expires_at <= now()) then
    raise exception 'This poll is closed.';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_poll.options) option_row
    where option_row->>'id' = p_option_id
  ) then raise exception 'Invalid poll option.'; end if;

  if not v_poll.allow_multiple and exists (
    select 1 from public.channel_poll_votes
    where poll_id = p_poll_id and user_id = v_user_id
  ) then
    raise exception 'You have already voted in this poll.';
  end if;

  if not p_selected then
    if not v_poll.allow_multiple then
      raise exception 'You cannot remove or change a single-choice vote.';
    end if;
    delete from public.channel_poll_votes
    where poll_id = p_poll_id and option_id = p_option_id and user_id = v_user_id;
    return;
  end if;

  insert into public.channel_poll_votes (poll_id, option_id, user_id)
  values (p_poll_id, p_option_id, v_user_id)
  on conflict (poll_id, option_id, user_id) do nothing;
end;
$$;

create or replace function public.update_channel_poll(
  p_poll_id uuid,
  p_question text,
  p_options text[],
  p_allow_multiple boolean default false,
  p_expires_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_poll public.channel_polls%rowtype;
  v_options jsonb;
  v_option_count integer;
begin
  if v_user is null then raise exception 'You must be logged in.'; end if;
  select * into v_poll from public.channel_polls where id = p_poll_id for update;
  if not found or not public.can_view_channel(v_poll.channel_id) then
    raise exception 'Poll not found or not accessible.';
  end if;
  if v_poll.created_by <> v_user and not public.can_manage_channel_messages(v_poll.channel_id) then
    raise exception 'Only the poll creator or a channel moderator can edit this poll.';
  end if;
  if exists (select 1 from public.channel_poll_votes where poll_id = p_poll_id) then
    raise exception 'A poll cannot be edited after voting has started.';
  end if;
  if v_poll.closed_at is not null or (v_poll.expires_at is not null and v_poll.expires_at <= now()) then
    raise exception 'A closed poll cannot be edited.';
  end if;
  if p_question is null or char_length(btrim(p_question)) not between 1 and 200 then
    raise exception 'Poll question must contain 1–200 characters.';
  end if;
  if p_options is null then raise exception 'Poll options are required.'; end if;
  select count(*) into v_option_count from unnest(p_options);
  if v_option_count not between 2 and 6 then raise exception 'A poll must have between 2 and 6 options.'; end if;
  if exists (select 1 from unnest(p_options) as opts(value) where char_length(btrim(coalesce(value, ''))) not between 1 and 80) then
    raise exception 'Each option must be between 1 and 80 characters.';
  end if;
  if exists (
    select 1 from unnest(p_options) with ordinality a(value, n)
    join unnest(p_options) with ordinality b(value, n) on a.n < b.n
    where lower(btrim(a.value)) = lower(btrim(b.value))
  ) then raise exception 'Poll options must be unique.'; end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Poll end time must be in the future.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', gen_random_uuid()::text, 'label', btrim(value)) order by n), '[]'::jsonb)
  into v_options
  from unnest(p_options) with ordinality options(value, n);

  update public.channel_polls
  set question = btrim(p_question),
      options = v_options,
      allow_multiple = coalesce(p_allow_multiple, false),
      expires_at = p_expires_at
  where id = p_poll_id;
end;
$$;

revoke all on function public.update_social_poll(uuid, text, text[], timestamptz) from public, anon;
grant execute on function public.update_social_poll(uuid, text, text[], timestamptz) to authenticated;
revoke all on function public.update_channel_poll(uuid, text, text[], boolean, timestamptz) from public, anon;
grant execute on function public.update_channel_poll(uuid, text, text[], boolean, timestamptz) to authenticated;

-- Event-chat polls use a separate voting RPC; apply the same single-choice lock.
create or replace function public.cast_server_event_chat_poll_vote(
  p_poll_id uuid, p_option_id text, p_selected boolean default true
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
begin
  if v_user_id is null then raise exception 'You must be logged in.'; end if;
  select * into v_poll from public.server_event_chat_polls where id = p_poll_id for update;
  if not found then raise exception 'Poll not found.'; end if;
  select e.server_id into v_server_id from public.server_events e where e.id = v_poll.event_id;
  if not exists (
    select 1 from public.server_members sm
    where sm.server_id = v_server_id and sm.user_id = v_user_id
  ) then raise exception 'Poll is not accessible.'; end if;
  if v_poll.closed_at is not null or (v_poll.expires_at is not null and v_poll.expires_at <= now()) then
    raise exception 'This poll is closed.';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_poll.options) o where o->>'id' = p_option_id
  ) then raise exception 'Invalid poll option.'; end if;

  if not v_poll.allow_multiple and exists (
    select 1 from public.server_event_chat_poll_votes
    where poll_id = p_poll_id and user_id = v_user_id
  ) then raise exception 'You have already voted in this poll.'; end if;

  if not coalesce(p_selected, true) then
    if not v_poll.allow_multiple then
      raise exception 'You cannot remove or change a single-choice vote.';
    end if;
    delete from public.server_event_chat_poll_votes
    where poll_id = p_poll_id and option_id = p_option_id and user_id = v_user_id;
    return;
  end if;

  insert into public.server_event_chat_poll_votes(poll_id, option_id, user_id)
  values (p_poll_id, p_option_id, v_user_id)
  on conflict (poll_id, option_id, user_id) do nothing;
end;
$$;

revoke all on function public.cast_server_event_chat_poll_vote(uuid, text, boolean) from public, anon;
grant execute on function public.cast_server_event_chat_poll_vote(uuid, text, boolean) to authenticated;
