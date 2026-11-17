-- Configurable social poll voting: one choice per user or multiple choices, plus duration.
alter table public.social_polls
  add column if not exists allow_multiple boolean not null default false;

alter table public.social_poll_votes
  drop constraint if exists social_poll_votes_one_per_user;

create unique index if not exists social_poll_votes_one_per_option_per_user
  on public.social_poll_votes (poll_id, option_id, user_id);

drop function if exists public.create_social_poll(text, text[], timestamptz);
create or replace function public.create_social_poll(
  p_question text,
  p_options text[],
  p_ends_at timestamptz default null,
  p_allow_multiple boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_post_id uuid;
  v_poll_id uuid;
  v_option text;
  v_position integer := 0;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  if char_length(btrim(coalesce(p_question, ''))) not between 1 and 200 then
    raise exception 'Question must be between 1 and 200 characters';
  end if;
  if p_options is null or cardinality(p_options) not between 2 and 6 then
    raise exception 'A poll needs between 2 and 6 options';
  end if;
  if p_ends_at is not null and p_ends_at <= now() then
    raise exception 'Poll end time must be in the future';
  end if;

  insert into public.posts (author_id, body) values (v_user, btrim(p_question))
  returning id into v_post_id;
  insert into public.social_polls (post_id, ends_at, allow_multiple)
  values (v_post_id, p_ends_at, coalesce(p_allow_multiple, false))
  returning id into v_poll_id;

  foreach v_option in array p_options loop
    if char_length(btrim(coalesce(v_option, ''))) not between 1 and 100 then
      raise exception 'Each option must be between 1 and 100 characters';
    end if;
    if exists (
      select 1 from unnest(p_options[1:v_position]) prior(value)
      where lower(btrim(prior.value)) = lower(btrim(v_option))
    ) then raise exception 'Poll options must be unique'; end if;
    insert into public.social_poll_options (poll_id, label, position)
    values (v_poll_id, btrim(v_option), v_position);
    v_position := v_position + 1;
  end loop;
  return v_post_id;
end;
$$;

drop function if exists public.cast_social_poll_vote(uuid, uuid);
create or replace function public.cast_social_poll_vote(
  p_poll_id uuid,
  p_option_id uuid,
  p_selected boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_allow_multiple boolean;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select allow_multiple into v_allow_multiple
  from public.social_polls
  where id = p_poll_id and (ends_at is null or ends_at > now())
  for update;
  if not found then raise exception 'Poll is closed or does not exist'; end if;
  if not exists (
    select 1 from public.social_poll_options
    where id = p_option_id and poll_id = p_poll_id
  ) then raise exception 'Invalid poll option'; end if;

  if not coalesce(v_allow_multiple, false) and exists (
    select 1 from public.social_poll_votes
    where poll_id = p_poll_id and user_id = v_user
  ) then raise exception 'You have already voted in this poll'; end if;

  if not coalesce(p_selected, true) then
    if not coalesce(v_allow_multiple, false) then
      raise exception 'You cannot remove or change a single-choice vote';
    end if;
    delete from public.social_poll_votes
    where poll_id = p_poll_id and option_id = p_option_id and user_id = v_user;
    return;
  end if;

  insert into public.social_poll_votes (poll_id, option_id, user_id)
  values (p_poll_id, p_option_id, v_user)
  on conflict (poll_id, option_id, user_id) do nothing;
end;
$$;

drop function if exists public.update_social_poll(uuid, text, text[], timestamptz);
create or replace function public.update_social_poll(
  p_poll_id uuid,
  p_question text,
  p_options text[],
  p_ends_at timestamptz default null,
  p_allow_multiple boolean default false
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
    ) then raise exception 'Poll options must be unique'; end if;
    v_position := v_position + 1;
  end loop;

  update public.posts set body = btrim(p_question) where id = v_post_id;
  update public.social_polls
  set ends_at = p_ends_at, allow_multiple = coalesce(p_allow_multiple, false)
  where id = p_poll_id;
  delete from public.social_poll_options where poll_id = p_poll_id;
  v_position := 0;
  foreach v_option in array p_options loop
    insert into public.social_poll_options (poll_id, label, position)
    values (p_poll_id, btrim(v_option), v_position);
    v_position := v_position + 1;
  end loop;
end;
$$;

revoke all on function public.create_social_poll(text, text[], timestamptz, boolean) from public, anon;
grant execute on function public.create_social_poll(text, text[], timestamptz, boolean) to authenticated;
revoke all on function public.cast_social_poll_vote(uuid, uuid, boolean) from public, anon;
grant execute on function public.cast_social_poll_vote(uuid, uuid, boolean) to authenticated;
revoke all on function public.update_social_poll(uuid, text, text[], timestamptz, boolean) from public, anon;
grant execute on function public.update_social_poll(uuid, text, text[], timestamptz, boolean) to authenticated;
