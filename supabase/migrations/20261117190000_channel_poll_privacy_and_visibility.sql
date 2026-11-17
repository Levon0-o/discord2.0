-- Bring server channel polls to parity with social polls, with privacy-safe aggregates.
alter table public.channel_polls
  add column if not exists is_anonymous boolean not null default false,
  add column if not exists results_visibility text not null default 'always'
    check (results_visibility in ('always', 'after_vote'));

-- Never expose the voter list through direct table reads. Aggregates are returned by a controlled RPC.
drop policy if exists channel_poll_votes_read on public.channel_poll_votes;
drop policy if exists channel_poll_votes_read_own on public.channel_poll_votes;
create policy channel_poll_votes_read_own on public.channel_poll_votes
  for select to authenticated using (user_id = auth.uid());

create or replace function public.get_channel_poll_results(p_poll_ids uuid[])
returns table (
  poll_id uuid,
  option_id text,
  vote_count bigint,
  voted_by_me boolean,
  total_votes bigint,
  has_votes boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with requested as (
    select p.id, p.channel_id, p.options, p.results_visibility, p.closed_at, p.expires_at
    from public.channel_polls p
    where p.id = any(coalesce(p_poll_ids, array[]::uuid[]))
      and public.can_view_channel(p.channel_id)
  ),
  totals as (
    select v.poll_id, v.option_id, count(*)::bigint as vote_count,
           bool_or(v.user_id = auth.uid()) as voted_by_me,
           sum(count(*)) over (partition by v.poll_id)::bigint as total_votes
    from public.channel_poll_votes v
    join requested p on p.id = v.poll_id
    group by v.poll_id, v.option_id
  ),
  options as (
    select p.id as poll_id, o->>'id' as option_id
    from requested p
    cross join lateral jsonb_array_elements(p.options) o
  ),
  merged as (
    select o.poll_id, o.option_id, coalesce(t.vote_count, 0)::bigint as vote_count,
           coalesce(t.voted_by_me, false) as voted_by_me,
           coalesce(t.total_votes, 0)::bigint as total_votes,
           p.results_visibility, p.closed_at, p.expires_at
    from options o
    join requested p on p.id = o.poll_id
    left join totals t on t.poll_id = o.poll_id and t.option_id = o.option_id
  )
  select m.poll_id, m.option_id,
         case when m.results_visibility = 'after_vote'
                   and not m.voted_by_me
                   and m.closed_at is null
                   and (m.expires_at is null or m.expires_at > now())
              then 0 else m.vote_count end,
         m.voted_by_me,
         case when m.results_visibility = 'after_vote'
                   and not m.voted_by_me
                   and m.closed_at is null
                   and (m.expires_at is null or m.expires_at > now())
              then 0 else m.total_votes end,
         m.total_votes > 0
  from merged m;
$$;

drop function if exists public.create_channel_poll(uuid, text, jsonb, boolean, timestamptz);
create or replace function public.create_channel_poll(
  p_channel_id uuid,
  p_question text,
  p_options jsonb,
  p_allow_multiple boolean default false,
  p_expires_at timestamptz default null,
  p_is_anonymous boolean default false,
  p_results_visibility text default 'always'
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
  if v_user_id is null then raise exception 'You must be logged in.'; end if;
  if not public.can_send_channel_message(p_channel_id) then
    raise exception 'You do not have permission to create a poll in this channel.';
  end if;
  if p_question is null or char_length(btrim(p_question)) not between 1 and 200 then
    raise exception 'Poll question must contain 1–200 characters.';
  end if;
  if p_options is null or jsonb_typeof(p_options) <> 'array' then
    raise exception 'Poll options must be a JSON array.';
  end if;
  select count(*) into v_option_count from jsonb_array_elements_text(p_options);
  if v_option_count not between 2 and 6 then raise exception 'A poll must have between 2 and 6 options.'; end if;
  if exists (select 1 from jsonb_array_elements_text(p_options) x(value)
             where char_length(btrim(value)) not between 1 and 80) then
    raise exception 'Each option must contain 1–80 characters.';
  end if;
  if exists (select 1 from jsonb_array_elements_text(p_options) with ordinality a(value,n)
             join jsonb_array_elements_text(p_options) with ordinality b(value,n) on a.n < b.n
             where lower(btrim(a.value)) = lower(btrim(b.value))) then
    raise exception 'Poll options must be unique.';
  end if;
  if p_expires_at is not null and (p_expires_at <= now() or p_expires_at > now() + interval '30 days') then
    raise exception 'Poll expiration must be within the next 30 days.';
  end if;
  if coalesce(p_results_visibility, 'always') not in ('always', 'after_vote') then
    raise exception 'Invalid results visibility.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', gen_random_uuid()::text, 'label', btrim(value)) order by n), '[]'::jsonb)
  into v_options
  from jsonb_array_elements_text(p_options) with ordinality options(value,n);

  insert into public.messages (channel_id, author_id, body)
  values (p_channel_id, v_user_id, '')
  returning id into v_message_id;

  insert into public.channel_polls
    (channel_id, message_id, created_by, question, options, allow_multiple, expires_at, is_anonymous, results_visibility)
  values
    (p_channel_id, v_message_id, v_user_id, btrim(p_question), v_options,
     coalesce(p_allow_multiple,false), p_expires_at, coalesce(p_is_anonymous,false), coalesce(p_results_visibility,'always'))
  returning id into v_poll_id;

  return query select v_poll_id, v_message_id;
end;
$$;

drop function if exists public.update_channel_poll(uuid, text, text[], boolean, timestamptz);
create or replace function public.update_channel_poll(
  p_poll_id uuid,
  p_question text,
  p_options text[],
  p_allow_multiple boolean default false,
  p_expires_at timestamptz default null,
  p_is_anonymous boolean default false,
  p_results_visibility text default 'always'
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
  if exists (select 1 from unnest(p_options) x(value) where char_length(btrim(coalesce(value,''))) not between 1 and 80) then
    raise exception 'Each option must be between 1 and 80 characters.';
  end if;
  if exists (select 1 from unnest(p_options) with ordinality a(value,n)
             join unnest(p_options) with ordinality b(value,n) on a.n < b.n
             where lower(btrim(a.value)) = lower(btrim(b.value))) then
    raise exception 'Poll options must be unique.';
  end if;
  if p_expires_at is not null and (p_expires_at <= now() or p_expires_at > now() + interval '30 days') then
    raise exception 'Poll expiration must be within the next 30 days.';
  end if;
  if coalesce(p_results_visibility, 'always') not in ('always', 'after_vote') then
    raise exception 'Invalid results visibility.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', gen_random_uuid()::text, 'label', btrim(value)) order by n), '[]'::jsonb)
  into v_options from unnest(p_options) with ordinality options(value,n);

  update public.channel_polls
  set question = btrim(p_question), options = v_options,
      allow_multiple = coalesce(p_allow_multiple,false), expires_at = p_expires_at,
      is_anonymous = coalesce(p_is_anonymous,false),
      results_visibility = coalesce(p_results_visibility,'always')
  where id = p_poll_id;
end;
$$;

revoke all on function public.get_channel_poll_results(uuid[]) from public, anon;
revoke all on function public.create_channel_poll(uuid, text, jsonb, boolean, timestamptz, boolean, text) from public, anon;
revoke all on function public.update_channel_poll(uuid, text, text[], boolean, timestamptz, boolean, text) from public, anon;
grant execute on function public.get_channel_poll_results(uuid[]) to authenticated;
grant execute on function public.create_channel_poll(uuid, text, jsonb, boolean, timestamptz, boolean, text) to authenticated;
grant execute on function public.update_channel_poll(uuid, text, text[], boolean, timestamptz, boolean, text) to authenticated;
