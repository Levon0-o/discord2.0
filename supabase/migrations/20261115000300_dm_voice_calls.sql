/*
  Private Realtime signaling for one-to-one direct-message voice calls.
  Audio travels peer-to-peer over WebRTC; Supabase only relays call setup signals.
  Both users must belong to the conversation to read or send its signaling events.
*/
drop policy if exists dm_voice_read_conversation_members on realtime.messages;
create policy dm_voice_read_conversation_members
on realtime.messages
for select
to authenticated
using (
  realtime.topic() like 'dm-voice:%'
  and exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id::text = split_part(realtime.topic(), ':', 2)
      and cm.user_id = (select auth.uid())
  )
);

drop policy if exists dm_voice_send_conversation_members on realtime.messages;
create policy dm_voice_send_conversation_members
on realtime.messages
for insert
to authenticated
with check (
  realtime.topic() like 'dm-voice:%'
  and exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id::text = split_part(realtime.topic(), ':', 2)
      and cm.user_id = (select auth.uid())
  )
);
