
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
  slowmode_seconds: number;
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
  custom_roles?: CustomRole[];
}

export type ServerPermission =
  | 'manage_server'
  | 'manage_channels'
  | 'manage_members'
  | 'manage_invites'
  | 'manage_roles'
  | 'moderate_messages'
  | 'manage_messages'
  | 'view_restricted_channels';

export type ServerPermissions = Partial<Record<ServerPermission, boolean>>;

export interface CustomRole {
  id: string;
  server_id: string;
  name: string;
  color: string;
  icon: string | null;
  description: string;
  position: number;
  permissions: ServerPermissions;
  created_at: string;
}

export interface MemberRole {
  server_id: string;
  user_id: string;
  role_id: string;
  assigned_at: string;
}

export interface MemberWithCustomRoles extends MemberWithProfile {
  custom_roles: CustomRole[];
}

export type AutoRoleEventType =
  | 'join'
  | 'account_age'
  | 'profile_verified'
  | 'activity';

export interface AutoRoleRule {
  id: string;
  server_id: string;
  role_id: string;
  event_type: AutoRoleEventType;
  conditions: Record<string, unknown>;
  is_enabled: boolean;
  created_at: string;
}

export interface CreateCustomRoleInput {
  server_id: string;
  name: string;
  color: string;
  icon?: string | null;
  description?: string;
  position: number;
  permissions?: ServerPermissions;
}

export interface UpdateCustomRoleInput {
  name?: string;
  color?: string;
  icon?: string | null;
  description?: string;
  position?: number;
  permissions?: ServerPermissions;
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
