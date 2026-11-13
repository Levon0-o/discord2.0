create or replace function public.update_server_event(
  p_event_id uuid,
  p_title text,
  p_description text,
  p_location text,
  p_starts_at timestamptz,
  p_ends_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_event public.server_events%rowtype;
  v_role text;
begin
  if v_user_id is null then raise exception 'You must be logged in.'; end if;
  select * into v_event from public.server_events where id = p_event_id for update;
  if not found then raise exception 'Event not found.'; end if;

  select sm.role into v_role
  from public.server_members sm
  where sm.server_id = v_event.server_id and sm.user_id = v_user_id;
  if v_role is null then raise exception 'You must be a server member.'; end if;
  if v_event.created_by <> v_user_id and v_role not in ('owner', 'admin', 'moderator') then
    raise exception 'Only the event creator or a server moderator can edit this event.';
  end if;

  if p_title is null or char_length(btrim(p_title)) not between 1 and 120 then
    raise exception 'Event title must contain 1–120 characters.';
  end if;
  if p_description is not null and char_length(p_description) > 2000 then
    raise exception 'Event description is too long.';
  end if;
  if p_location is not null and char_length(p_location) > 160 then
    raise exception 'Event location is too long.';
  end if;
  if p_starts_at is null then raise exception 'Event start is required.'; end if;
  if p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'Event end must be after its start.';
  end if;

  update public.server_events
  set title = btrim(p_title),
      description = coalesce(p_description, ''),
      location = coalesce(p_location, ''),
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      updated_at = now()
  where id = p_event_id;
end;
$$;

create or replace function public.delete_server_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_event public.server_events%rowtype;
  v_role text;
begin
  if v_user_id is null then raise exception 'You must be logged in.'; end if;
  select * into v_event from public.server_events where id = p_event_id for update;
  if not found then raise exception 'Event not found.'; end if;

  select sm.role into v_role
  from public.server_members sm
  where sm.server_id = v_event.server_id and sm.user_id = v_user_id;
  if v_role is null then raise exception 'You must be a server member.'; end if;
  if v_event.created_by <> v_user_id and v_role not in ('owner', 'admin', 'moderator') then
    raise exception 'Only the event creator or a server moderator can cancel this event.';
  end if;

  delete from public.server_events where id = p_event_id;
end;
$$;

revoke all on function public.update_server_event(uuid, text, text, text, timestamptz, timestamptz) from public, anon;
revoke all on function public.delete_server_event(uuid) from public, anon;
grant execute on function public.update_server_event(uuid, text, text, text, timestamptz, timestamptz) to authenticated;
grant execute on function public.delete_server_event(uuid) to authenticated;
