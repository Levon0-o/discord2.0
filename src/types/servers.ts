export type ServerVisibility = 'public' | 'private';

export type ServerRoleName = 'owner' | 'admin' | 'moderator' | 'member';

export interface Server {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  icon_url: string | null;
  banner_url: string | null;
  theme_color: string;
  visibility: ServerVisibility;
  created_at: string;
  updated_at: string;
}

export interface ServerMember {
  server_id: string;
  user_id: string;
  role: ServerRoleName;
  joined_at: string;
}

export interface Channel {
  id: string;
  server_id: string;
  name: string;
  topic: string;
  category: string;
  position: number;
  is_restricted: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProfileLite {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

export interface ServerWithMeta extends Server {
  member_count: number;
  my_role: ServerRoleName | null;
}

export interface MemberWithProfile extends ServerMember {
  profile: ProfileLite | null;
}

export interface CreateServerInput {
  name: string;
  description: string;
  visibility: ServerVisibility;
  icon_url?: string | null;
  theme_color?: string;
}

export interface CreateChannelInput {
  server_id: string;
  name: string;
  topic?: string;
  category?: string;
  position?: number;
  is_restricted?: boolean;
}
