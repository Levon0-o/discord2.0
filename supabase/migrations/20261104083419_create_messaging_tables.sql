/*
# Create conversations, members, messages and reactions

Plain-English summary: adds private one-to-one and group conversations, and the messages used both in those conversations and in server channels. Each message can be a reply to another message, carry an image, and receive emoji reactions. Each member tracks when they last read a conversation so unread indicators work.

1. New Tables
- `conversations`: kind (direct or group), optional group title, creator, and the time of the latest message.
- `conversation_members`: who is in each conversation, when they joined, and when they last read it.
- `messages`: a message in exactly one place, either a conversation or a server channel. Holds text (up to 4000 characters), an optional image, an optional reply target, and timestamps.
- `message_reactions`: one emoji reaction per person per emoji per message.

2. Security
- Row Level Security enabled on every table.
- Conversations and their messages are visible only to their members (plus the creator while setting up a new conversation).
- Channel messages follow the server channel permissions: members can read and post, restricted channels need moderator rank, and moderators can delete messages.
- Only authors can edit their own messages; authors or channel moderators can delete them.
- Members can rename group conversations, update only their own read marker, and leave conversations.
- A reply must reference a message in the same conversation or channel.

3. Notes
- A trigger keeps each conversation's latest-message time current.
- Notifications for new messages are added in the next migration.
*/

CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  title text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_kind_values CHECK (kind IN ('direct', 'group')),
  CONSTRAINT conversations_title_rules CHECK (
    (kind = 'group' AND (title IS NULL OR char_length(title) BETWEEN 1 AND 80))
    OR (kind = 'direct' AND title IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS conversations_created_by_idx ON public.conversations (created_by);
CREATE INDEX IF NOT EXISTS conversations_last_message_idx ON public.conversations (last_message_at DESC);

CREATE TABLE IF NOT EXISTS public.conversation_members (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS conversation_members_user_id_idx ON public.conversation_members (user_id);

CREATE OR REPLACE FUNCTION public.is_conversation_member(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.conversation_members cm
     WHERE cm.conversation_id = p_conversation_id
       AND cm.user_id = auth.uid()
  );
$$;

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  channel_id uuid REFERENCES public.channels(id) ON DELETE CASCADE,
  author_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  reply_to_id uuid REFERENCES public.messages(id) ON DELETE SET NULL,
  body text NOT NULL DEFAULT '',
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messages_one_destination CHECK ((conversation_id IS NULL) <> (channel_id IS NULL)),
  CONSTRAINT messages_body_length CHECK (char_length(body) <= 4000),
  CONSTRAINT messages_has_content CHECK (char_length(btrim(body)) > 0 OR image_url IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS messages_conversation_created_idx ON public.messages (conversation_id, created_at DESC) WHERE conversation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_channel_created_idx ON public.messages (channel_id, created_at DESC) WHERE channel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_reply_to_idx ON public.messages (reply_to_id) WHERE reply_to_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_author_id_idx ON public.messages (author_id);

CREATE TABLE IF NOT EXISTS public.message_reactions (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji),
  CONSTRAINT message_reactions_emoji_length CHECK (char_length(emoji) BETWEEN 1 AND 16)
);

CREATE INDEX IF NOT EXISTS message_reactions_user_id_idx ON public.message_reactions (user_id);

CREATE OR REPLACE FUNCTION public.validate_message_reply()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.reply_to_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.messages m
     WHERE m.id = NEW.reply_to_id
       AND m.conversation_id IS NOT DISTINCT FROM NEW.conversation_id
       AND m.channel_id IS NOT DISTINCT FROM NEW.channel_id
  ) THEN
    RAISE EXCEPTION 'Reply target must be in the same conversation or channel';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_validate_reply ON public.messages;
CREATE TRIGGER messages_validate_reply
BEFORE INSERT OR UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.validate_message_reply();

DROP TRIGGER IF EXISTS messages_set_updated_at ON public.messages;
CREATE TRIGGER messages_set_updated_at
BEFORE UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.touch_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.conversation_id IS NOT NULL THEN
    UPDATE public.conversations
       SET last_message_at = NEW.created_at
     WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_touch_conversation ON public.messages;
CREATE TRIGGER messages_touch_conversation
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.touch_conversation_on_message();

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.conversations TO authenticated;
GRANT INSERT (kind, title, created_by) ON public.conversations TO authenticated;
GRANT UPDATE (title) ON public.conversations TO authenticated;
GRANT SELECT ON public.conversation_members TO authenticated;
GRANT INSERT (conversation_id, user_id) ON public.conversation_members TO authenticated;
GRANT UPDATE (last_read_at) ON public.conversation_members TO authenticated;
GRANT DELETE ON public.conversation_members TO authenticated;
GRANT SELECT ON public.messages TO authenticated;
GRANT INSERT (conversation_id, channel_id, author_id, reply_to_id, body, image_url) ON public.messages TO authenticated;
GRANT UPDATE (body, image_url) ON public.messages TO authenticated;
GRANT DELETE ON public.messages TO authenticated;
GRANT SELECT ON public.message_reactions TO authenticated;
GRANT INSERT (message_id, user_id, emoji) ON public.message_reactions TO authenticated;
GRANT DELETE ON public.message_reactions TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_conversation_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_message_reply() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_conversation_on_message() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "conversations_select_members_or_creator" ON public.conversations;
CREATE POLICY "conversations_select_members_or_creator" ON public.conversations FOR SELECT
TO authenticated USING (created_by = auth.uid() OR public.is_conversation_member(id));

DROP POLICY IF EXISTS "conversations_insert_as_creator" ON public.conversations;
CREATE POLICY "conversations_insert_as_creator" ON public.conversations FOR INSERT
TO authenticated WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "conversations_update_group_members" ON public.conversations;
CREATE POLICY "conversations_update_group_members" ON public.conversations FOR UPDATE
TO authenticated USING (kind = 'group' AND public.is_conversation_member(id))
WITH CHECK (kind = 'group' AND public.is_conversation_member(id));

DROP POLICY IF EXISTS "conversation_members_select_members" ON public.conversation_members;
CREATE POLICY "conversation_members_select_members" ON public.conversation_members FOR SELECT
TO authenticated USING (
  public.is_conversation_member(conversation_id)
  OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_members.conversation_id AND c.created_by = auth.uid())
);

DROP POLICY IF EXISTS "conversation_members_insert_by_members_or_creator" ON public.conversation_members;
CREATE POLICY "conversation_members_insert_by_members_or_creator" ON public.conversation_members FOR INSERT
TO authenticated WITH CHECK (
  public.is_conversation_member(conversation_id)
  OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_members.conversation_id AND c.created_by = auth.uid())
);

DROP POLICY IF EXISTS "conversation_members_update_own_read_marker" ON public.conversation_members;
CREATE POLICY "conversation_members_update_own_read_marker" ON public.conversation_members FOR UPDATE
TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "conversation_members_delete_own" ON public.conversation_members;
CREATE POLICY "conversation_members_delete_own" ON public.conversation_members FOR DELETE
TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "messages_select_accessible" ON public.messages;
CREATE POLICY "messages_select_accessible" ON public.messages FOR SELECT
TO authenticated USING (
  (conversation_id IS NOT NULL AND public.is_conversation_member(conversation_id))
  OR (channel_id IS NOT NULL AND public.can_view_channel(channel_id))
);

DROP POLICY IF EXISTS "messages_insert_own_accessible" ON public.messages;
CREATE POLICY "messages_insert_own_accessible" ON public.messages FOR INSERT
TO authenticated WITH CHECK (
  author_id = auth.uid()
  AND (
    (conversation_id IS NOT NULL AND public.is_conversation_member(conversation_id))
    OR (channel_id IS NOT NULL AND public.can_view_channel(channel_id))
  )
);

DROP POLICY IF EXISTS "messages_update_own" ON public.messages;
CREATE POLICY "messages_update_own" ON public.messages FOR UPDATE
TO authenticated USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "messages_delete_author_or_channel_moderator" ON public.messages;
CREATE POLICY "messages_delete_author_or_channel_moderator" ON public.messages FOR DELETE
TO authenticated USING (
  author_id = auth.uid()
  OR (channel_id IS NOT NULL AND public.can_moderate_channel(channel_id))
);

DROP POLICY IF EXISTS "message_reactions_select_accessible" ON public.message_reactions;
CREATE POLICY "message_reactions_select_accessible" ON public.message_reactions FOR SELECT
TO authenticated USING (EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_reactions.message_id));

DROP POLICY IF EXISTS "message_reactions_insert_own_accessible" ON public.message_reactions;
CREATE POLICY "message_reactions_insert_own_accessible" ON public.message_reactions FOR INSERT
TO authenticated WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.messages m WHERE m.id = message_reactions.message_id)
);

DROP POLICY IF EXISTS "message_reactions_delete_own" ON public.message_reactions;
CREATE POLICY "message_reactions_delete_own" ON public.message_reactions FOR DELETE
TO authenticated USING (user_id = auth.uid());
