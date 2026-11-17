/*
  Private Realtime signaling for multiparty voice rooms in group DMs.
  Media is peer-to-peer WebRTC; Supabase only relays signaling and presence.
  Every participant must be a member of the referenced direct conversation.
*/
drop policy if exists dm_group_voice_read_conversation_members on realtime.messages;
create policy dm_group_voice_read_conversation_members
on realtime.messages
for select
to authenticated
using (
  realtime.topic() like 'dm-group-voice:%'
  and exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id::text = split_part(realtime.topic(), ':', 2)
      and cm.user_id = (select auth.uid())
  )
);

drop policy if exists dm_group_voice_send_conversation_members on realtime.messages;
create policy dm_group_voice_send_conversation_members
on realtime.messages
for insert
to authenticated
with check (
  realtime.topic() like 'dm-group-voice:%'
  and exists (
    select 1
    from public.conversation_members cm
    where cm.conversation_id::text = split_part(realtime.topic(), ':', 2)
      and cm.user_id = (select auth.uid())
  )
);
