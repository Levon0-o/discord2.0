/*
# Enforce message access on edits and deletes

A former server member must not be able to edit or delete old channel messages
after losing access to the channel. Conversation messages remain available only
while the user is a member of that conversation.
*/

DROP POLICY IF EXISTS "messages_update_own" ON public.messages;
CREATE POLICY "messages_update_own" ON public.messages
FOR UPDATE TO authenticated
USING (
  author_id = auth.uid()
  AND (
    (conversation_id IS NOT NULL AND public.is_conversation_member(conversation_id))
    OR (channel_id IS NOT NULL AND public.can_view_channel(channel_id))
  )
)
WITH CHECK (
  author_id = auth.uid()
  AND (
    (conversation_id IS NOT NULL AND public.is_conversation_member(conversation_id))
    OR (channel_id IS NOT NULL AND public.can_view_channel(channel_id))
  )
);

DROP POLICY IF EXISTS "messages_delete_author_or_channel_moderator" ON public.messages;
CREATE POLICY "messages_delete_author_or_channel_moderator" ON public.messages
FOR DELETE TO authenticated
USING (
  (
    author_id = auth.uid()
    OR (channel_id IS NOT NULL AND public.can_moderate_channel(channel_id))
  )
  AND (
    (conversation_id IS NOT NULL AND public.is_conversation_member(conversation_id))
    OR (channel_id IS NOT NULL AND public.can_view_channel(channel_id))
  )
);
