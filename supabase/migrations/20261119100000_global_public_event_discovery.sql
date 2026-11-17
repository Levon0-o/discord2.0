create or replace function public.discover_public_server_events(p_limit integer default 100)
returns table (
  id uuid,
  server_id uuid,
  created_by uuid,
  title text,
  description text,
  location text,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  server_name text,
  server_icon_url text,
  server_member_count bigint,
  going_count bigint,
  interested_count bigint,
  my_rsvp text,
  is_member boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    e.id,
    e.server_id,
    e.created_by,
    e.title,
    e.description,
    e.location,
    e.starts_at,
    e.ends_at,
    e.created_at,
    e.updated_at,
    s.name,
    s.icon_url,
    (select count(*) from public.server_members smc where smc.server_id = s.id),
    (select count(*) from public.server_event_rsvps r where r.event_id = e.id and r.status = 'going'),
    (select count(*) from public.server_event_rsvps r where r.event_id = e.id and r.status = 'interested'),
    (select r.status from public.server_event_rsvps r where r.event_id = e.id and r.user_id = auth.uid()),
    exists (
      select 1 from public.server_members sm
      where sm.server_id = s.id and sm.user_id = auth.uid()
    )
  from public.server_events e
  join public.servers s on s.id = e.server_id
  where s.visibility = 'public'
    and e.starts_at >= now()
  order by e.starts_at asc
  limit greatest(1, least(coalesce(p_limit, 100), 200));
$$;

revoke all on function public.discover_public_server_events(integer) from public, anon;
grant execute on function public.discover_public_server_events(integer) to authenticated;
