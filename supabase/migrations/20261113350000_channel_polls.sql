create table if not exists public.channel_polls (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  message_id uuid not null unique references public.messages(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  question text not null check (char_length(question) between 1 and 200),
  options jsonb not null check (jsonb_typeof(options) = 'array'),
  allow_multiple boolean not null default false,
  expires_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint channel_polls_options_count check (jsonb_array_length(options) between 2 and 6)
);

create table if not exists public.channel_poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.channel_polls(id) on delete cascade,
  option_id text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (poll_id, option_id, user_id)
);

create index if not exists channel_polls_channel_created_idx
  on public.channel_polls(channel_id, created_at desc);
create index if not exists channel_poll_votes_poll_idx
  on public.channel_poll_votes(poll_id);

alter table public.channel_polls enable row level security;
alter table public.channel_poll_votes enable row level security;

drop policy if exists channel_polls_read on public.channel_polls;
create policy channel_polls_read on public.channel_polls
  for select to authenticated
  using (public.can_view_channel(channel_id));

drop policy if exists channel_poll_votes_read on public.channel_poll_votes;
create policy channel_poll_votes_read on public.channel_poll_votes
  for select to authenticated
  using (
    exists (
      select 1
      from public.channel_polls p
      where p.id = channel_poll_votes.poll_id
        and public.can_view_channel(p.channel_id)
    )
  );

grant select on public.channel_polls, public.channel_poll_votes to authenticated;
revoke insert, update, delete on public.channel_polls, public.channel_poll_votes from anon, authenticated;

create or replace function public.create_channel_poll(
  p_channel_id uuid,
  p_question text,
  p_options jsonb,
  p_allow_multiple boolean default false,
  p_expires_at timestamptz default null
)
returns table (poll_id uuid, message_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_message_id uuid;
  v_poll_id uuid;
  v_options jsonb;
  v_option_count integer;
begin
  if v_user_id is null then
    raise exception 'You must be logged in.';
  end if;
  if not public.can_send_channel_message(p_channel_id) then
    raise exception 'You do not have permission to create a poll in this channel.';
  end if;
  if p_question is null or char_length(btrim(p_question)) not between 1 and 200 then
    raise exception 'Poll question must contain 1–200 characters.';
  end if;
  if p_options is null or jsonb_typeof(p_options) <> 'array' then
    raise exception 'Poll options must be a JSON array.';
  end if;

  select count(*) into v_option_count from jsonb_array_elements(p_options);
  if v_option_count < 2 or v_option_count > 6 then
    raise exception 'A poll must have between 2 and 6 options.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(p_options) as option_value
    where char_length(btrim(option_value)) not between 1 and 80
  ) then
    raise exception 'Each option must contain 1–80 characters.';
  end if;
  if (
    select count(distinct lower(btrim(option_value)))
    from jsonb_array_elements_text(p_options) as option_value
  ) <> v_option_count then
    raise exception 'Poll options must be unique.';
  end if;
  if p_expires_at is not null and (p_expires_at <= now() or p_expires_at > now() + interval '30 days') then
    raise exception 'Poll expiration must be within the next 30 days.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('id', gen_random_uuid()::text, 'label', btrim(option_value))
      order by option_number
    ),
    '[]'::jsonb
  )
  into v_options
  from jsonb_array_elements_text(p_options) with ordinality as options(option_value, option_number);

  insert into public.messages (channel_id, author_id, body)
  values (p_channel_id, v_user_id, '')
  returning id into v_message_id;

  insert into public.channel_polls (
    channel_id, message_id, created_by, question, options, allow_multiple, expires_at
  )
  values (
    p_channel_id, v_message_id, v_user_id, btrim(p_question), v_options,
    coalesce(p_allow_multiple, false), p_expires_at
  )
  returning id into v_poll_id;

  return query select v_poll_id, v_message_id;
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
  if v_user_id is null then
    raise exception 'You must be logged in.';
  end if;
  select * into v_poll
  from public.channel_polls
  where id = p_poll_id
  for update;

  if not found or not public.can_view_channel(v_poll.channel_id) then
    raise exception 'Poll not found or not accessible.';
  end if;
  if v_poll.closed_at is not null or (v_poll.expires_at is not null and v_poll.expires_at <= now()) then
    raise exception 'This poll is closed.';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_poll.options) option_row
    where option_row->>'id' = p_option_id
  ) then
    raise exception 'Invalid poll option.';
  end if;

  if not coalesce(p_selected, true) then
    delete from public.channel_poll_votes
    where poll_id = p_poll_id and option_id = p_option_id and user_id = v_user_id;
    return;
  end if;

  if not v_poll.allow_multiple then
    delete from public.channel_poll_votes
    where poll_id = p_poll_id and user_id = v_user_id;
  end if;

  insert into public.channel_poll_votes (poll_id, option_id, user_id)
  values (p_poll_id, p_option_id, v_user_id)
  on conflict (poll_id, option_id, user_id) do nothing;
end;
$$;

create or replace function public.close_channel_poll(p_poll_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_poll public.channel_polls%rowtype;
begin
  if v_user_id is null then
    raise exception 'You must be logged in.';
  end if;
  select * into v_poll
  from public.channel_polls
  where id = p_poll_id
  for update;

  if not found or not public.can_view_channel(v_poll.channel_id) then
    raise exception 'Poll not found or not accessible.';
  end if;
  if v_poll.created_by <> v_user_id and not public.can_manage_channel_messages(v_poll.channel_id) then
    raise exception 'Only the poll creator or a channel moderator can close this poll.';
  end if;

  update public.channel_polls
  set closed_at = coalesce(closed_at, now())
  where id = p_poll_id;
end;
$$;

revoke all on function public.create_channel_poll(uuid, text, jsonb, boolean, timestamptz) from public, anon;
revoke all on function public.cast_channel_poll_vote(uuid, text, boolean) from public, anon;
revoke all on function public.close_channel_poll(uuid) from public, anon;
grant execute on function public.create_channel_poll(uuid, text, jsonb, boolean, timestamptz) to authenticated;
grant execute on function public.cast_channel_poll_vote(uuid, text, boolean) to authenticated;
grant execute on function public.close_channel_poll(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'channel_polls'
    ) then
      execute 'alter publication supabase_realtime add table public.channel_polls';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'channel_poll_votes'
    ) then
      execute 'alter publication supabase_realtime add table public.channel_poll_votes';
    end if;
  end if;
end;
$$;
