-- Social poll privacy, result visibility, and custom closing time.
alter table public.social_polls
  add column if not exists is_anonymous boolean not null default false,
  add column if not exists results_visibility text not null default 'always'
    check (results_visibility in ('always', 'after_vote'));

-- Anonymous polls must not expose individual voter identities through table reads.
drop policy if exists "social_poll_votes_read_visible_polls" on public.social_poll_votes;
create policy "social_poll_votes_read_own" on public.social_poll_votes
for select to authenticated using (user_id = auth.uid());

create or replace function public.get_social_poll_results(p_poll_ids uuid[])
returns table (
  poll_id uuid,
  option_id uuid,
  vote_count bigint,
  voted_by_me boolean,
  total_votes bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.poll_id, v.option_id, count(*)::bigint,
         bool_or(v.user_id = auth.uid()),
         sum(count(*)) over (partition by v.poll_id)::bigint
  from public.social_poll_votes v
  where v.poll_id = any(coalesce(p_poll_ids, array[]::uuid[]))
  group by v.poll_id, v.option_id
  union all
  select o.poll_id, o.id, 0::bigint, false, 0::bigint
  from public.social_poll_options o
  where o.poll_id = any(coalesce(p_poll_ids, array[]::uuid[]))
    and not exists (
      select 1 from public.social_poll_votes v
      where v.poll_id = o.poll_id and v.option_id = o.id
    );
$$;

drop function if exists public.create_social_poll(text, text[], timestamptz, boolean);
create or replace function public.create_social_poll(
  p_question text,
  p_options text[],
  p_ends_at timestamptz default null,
  p_allow_multiple boolean default false,
  p_is_anonymous boolean default false,
  p_results_visibility text default 'always'
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
  if p_ends_at is not null and p_ends_at <= now() then raise exception 'Poll end time must be in the future'; end if;
  if p_results_visibility not in ('always', 'after_vote') then raise exception 'Invalid results visibility'; end if;
  insert into public.posts (author_id, body) values (v_user, btrim(p_question)) returning id into v_post_id;
  insert into public.social_polls (post_id, ends_at, allow_multiple, is_anonymous, results_visibility)
  values (v_post_id, p_ends_at, coalesce(p_allow_multiple,false), coalesce(p_is_anonymous,false), p_results_visibility)
  returning id into v_poll_id;
  foreach v_option in array p_options loop
    if char_length(btrim(coalesce(v_option,''))) not between 1 and 100 then raise exception 'Each option must be between 1 and 100 characters'; end if;
    if exists (select 1 from unnest(p_options[1:v_position]) prior(value) where lower(btrim(prior.value)) = lower(btrim(v_option))) then raise exception 'Poll options must be unique'; end if;
    insert into public.social_poll_options (poll_id,label,position) values (v_poll_id,btrim(v_option),v_position);
    v_position := v_position + 1;
  end loop;
  return v_post_id;
end;
$$;

drop function if exists public.update_social_poll(uuid, text, text[], timestamptz, boolean);
create or replace function public.update_social_poll(
  p_poll_id uuid,
  p_question text,
  p_options text[],
  p_ends_at timestamptz default null,
  p_allow_multiple boolean default false,
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
  v_post_id uuid;
  v_option text;
  v_position integer := 0;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  select sp.post_id into v_post_id from public.social_polls sp join public.posts p on p.id=sp.post_id
  where sp.id=p_poll_id and p.author_id=v_user for update of sp,p;
  if not found then raise exception 'Only the poll author can edit this poll'; end if;
  if exists(select 1 from public.social_poll_votes where poll_id=p_poll_id) then raise exception 'A poll cannot be edited after voting has started'; end if;
  if char_length(btrim(coalesce(p_question,''))) not between 1 and 200 then raise exception 'Question must be between 1 and 200 characters'; end if;
  if p_options is null or cardinality(p_options) not between 2 and 6 then raise exception 'A poll must have between 2 and 6 options'; end if;
  if p_ends_at is not null and p_ends_at <= now() then raise exception 'Poll end time must be in the future'; end if;
  if p_results_visibility not in ('always','after_vote') then raise exception 'Invalid results visibility'; end if;
  foreach v_option in array p_options loop
    if char_length(btrim(coalesce(v_option,''))) not between 1 and 100 then raise exception 'Each option must be between 1 and 100 characters'; end if;
    if exists(select 1 from unnest(p_options[1:v_position]) prior(value) where lower(btrim(prior.value))=lower(btrim(v_option))) then raise exception 'Poll options must be unique'; end if;
    v_position := v_position + 1;
  end loop;
  update public.posts set body=btrim(p_question) where id=v_post_id;
  update public.social_polls set ends_at=p_ends_at, allow_multiple=coalesce(p_allow_multiple,false),
    is_anonymous=coalesce(p_is_anonymous,false), results_visibility=p_results_visibility where id=p_poll_id;
  delete from public.social_poll_options where poll_id=p_poll_id;
  v_position := 0;
  foreach v_option in array p_options loop
    insert into public.social_poll_options(poll_id,label,position) values(p_poll_id,btrim(v_option),v_position);
    v_position := v_position + 1;
  end loop;
end;
$$;

revoke all on function public.create_social_poll(text,text[],timestamptz,boolean,boolean,text) from public,anon;
grant execute on function public.create_social_poll(text,text[],timestamptz,boolean,boolean,text) to authenticated;
revoke all on function public.update_social_poll(uuid,text,text[],timestamptz,boolean,boolean,text) from public,anon;
grant execute on function public.update_social_poll(uuid,text,text[],timestamptz,boolean,boolean,text) to authenticated;
revoke all on function public.get_social_poll_results(uuid[]) from public,anon;
grant execute on function public.get_social_poll_results(uuid[]) to authenticated;
