-- Notify event creators when a member changes their RSVP.
create or replace function public.notify_server_event_rsvp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creator uuid;
  v_title text;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  select e.created_by, e.title
    into v_creator, v_title
  from public.server_events e
  where e.id = new.event_id;

  if v_creator is null or v_creator = new.user_id then
    return new;
  end if;

  insert into public.notifications (recipient_id, actor_id, type, entity_id)
  values (v_creator, new.user_id, 'event_rsvp', new.event_id);

  return new;
end;
$$;

drop trigger if exists notifications_after_server_event_rsvp on public.server_event_rsvps;
create trigger notifications_after_server_event_rsvp
after insert or update of status on public.server_event_rsvps
for each row
execute function public.notify_server_event_rsvp();

-- Notify members who are going or interested when an event's details change.
create or replace function public.notify_server_event_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.title is not distinct from new.title
     and old.description is not distinct from new.description
     and old.location is not distinct from new.location
     and old.starts_at is not distinct from new.starts_at
     and old.ends_at is not distinct from new.ends_at then
    return new;
  end if;

  insert into public.notifications (recipient_id, actor_id, type, entity_id)
  select r.user_id, auth.uid(), 'event_update', new.id
  from public.server_event_rsvps r
  where r.event_id = new.id
    and r.user_id <> auth.uid()
    and r.status in ('going', 'interested');

  return new;
end;
$$;

drop trigger if exists notifications_after_server_event_update on public.server_events;
create trigger notifications_after_server_event_update
after update on public.server_events
for each row
execute function public.notify_server_event_update();

revoke execute on function public.notify_server_event_rsvp() from public, anon, authenticated;
revoke execute on function public.notify_server_event_update() from public, anon, authenticated;
