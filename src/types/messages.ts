
export interface Message {
  id: string;
  conversation_id: string | null;
  channel_id: string | null;
  author_id: string;
  reply_to_id: string | null;
  body: string;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}
