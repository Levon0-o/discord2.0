-- Deliver event reminders once per RSVP and reminder window.
create table if not exists public.server_event_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.server_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reminder_offset_minutes integer not null check (reminder_offset_minutes in (1440, 60, 15)),
  delivered_at timestamptz not null default now(),
  unique (event_id, user_id, reminder_offset_minutes)
);

create index if not exists server_event_reminder_deliveries_user_idx
  on public.server_event_reminder_deliveries(user_id, delivered_at desc);

alter table public.server_event_reminder_deliveries enable row level security;
revoke all on public.server_event_reminder_deliveries from anon, authenticated;

-- Only the scheduled database worker writes reminders. No client-facing write policy exists.
create or replace function public.dispatch_server_event_reminders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created integer := 0;
begin
  with reminder_windows(offset_minutes, notification_type) as (
    values
      (1440, 'event_reminder_24h'),
      (60, 'event_reminder_1h'),
      (15, 'event_reminder_15m')
  ),
  due as (
    select
      e.id as event_id,
      e.created_by as actor_id,
      r.user_id,
      w.offset_minutes,
      w.notification_type
    from public.server_events e
    join public.server_event_rsvps r on r.event_id = e.id
    join reminder_windows w
      on e.starts_at > now() + make_interval(mins => w.offset_minutes - 1)
     and e.starts_at <= now() + make_interval(mins => w.offset_minutes)
    where r.status in ('going', 'interested')
      and e.starts_at > now()
  ),
  claimed as (
    insert into public.server_event_reminder_deliveries(event_id, user_id, reminder_offset_minutes)
    select d.event_id, d.user_id, d.offset_minutes
    from due d
    on conflict (event_id, user_id, reminder_offset_minutes) do nothing
    returning event_id, user_id, reminder_offset_minutes
  ),
  notified as (
    insert into public.notifications(recipient_id, actor_id, type, entity_id)
    select c.user_id, e.created_by, d.notification_type, c.event_id
    from claimed c
    join due d
      on d.event_id = c.event_id
     and d.user_id = c.user_id
     and d.offset_minutes = c.reminder_offset_minutes
    join public.server_events e on e.id = c.event_id
    returning id
  )
  select count(*)::integer into v_created from notified;

  return v_created;
end;
$$;

revoke all on function public.dispatch_server_event_reminders() from public, anon, authenticated;

-- pg_cron runs inside Postgres, so reminders are generated even when nobody has the app open.
create extension if not exists pg_cron with schema pg_catalog;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id from cron.job where jobname = 'afterdark-server-event-reminders';
  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;

  perform cron.schedule(
    'afterdark-server-event-reminders',
    '* * * * *',
    'select public.dispatch_server_event_reminders();'
  );
end;
$$;
