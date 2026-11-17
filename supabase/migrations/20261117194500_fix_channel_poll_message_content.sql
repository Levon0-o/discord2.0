-- Poll messages need a non-empty body to satisfy messages_has_content.
-- The UI hides this internal marker and renders the poll card instead.
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
  values (p_channel_id, v_user_id, '[poll]')
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

revoke all on function public.create_channel_poll(uuid, text, jsonb, boolean, timestamptz, boolean, text) from public, anon;
grant execute on function public.create_channel_poll(uuid, text, jsonb, boolean, timestamptz, boolean, text) to authenticated;
