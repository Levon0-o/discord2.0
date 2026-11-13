/*
  Private Realtime signaling for server event voice rooms.
  Actual audio is peer-to-peer WebRTC; this policy limits signaling to server members.
*/
drop policy if exists server_event_voice_read_members on realtime.messages;
create policy server_event_voice_read_members
on realtime.messages
for select
to authenticated
using (
  realtime.topic() like 'server-event-voice:%'
  and exists (
    select 1
    from public.server_events e
    join public.server_members sm on sm.server_id = e.server_id
    where e.id::text = split_part(realtime.topic(), ':', 2)
      and sm.user_id = (select auth.uid())
  )
);

drop policy if exists server_event_voice_send_members on realtime.messages;
create policy server_event_voice_send_members
on realtime.messages
for insert
to authenticated
with check (
  realtime.topic() like 'server-event-voice:%'
  and exists (
    select 1
    from public.server_events e
    join public.server_members sm on sm.server_id = e.server_id
    where e.id::text = split_part(realtime.topic(), ':', 2)
      and sm.user_id = (select auth.uid())
  )
);
