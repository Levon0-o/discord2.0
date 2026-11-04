import { Bell, Compass, Home, MessageSquare, Settings, User, Users, type LucideIcon } from 'lucide-react';

export const SECTION_IDS = ['feed', 'explore', 'servers', 'messages', 'notifications', 'profile', 'settings'] as const;

export type SectionId = (typeof SECTION_IDS)[number];

export interface NavSection {
  id: SectionId;
  label: string;
  description: string;
  icon: LucideIcon;
  mobilePrimary: boolean;
}

export const NAV_SECTIONS: NavSection[] = [
  { id: 'feed', label: 'Home', description: 'Posts from people and communities you follow.', icon: Home, mobilePrimary: true },
  { id: 'explore', label: 'Explore', description: 'Discover people, posts and public servers.', icon: Compass, mobilePrimary: true },
  { id: 'servers', label: 'Servers', description: 'Your communities, channels and invitations.', icon: Users, mobilePrimary: false },
  { id: 'messages', label: 'Messages', description: 'Private and group conversations.', icon: MessageSquare, mobilePrimary: true },
  { id: 'notifications', label: 'Notifications', description: 'Likes, comments, followers and invitations.', icon: Bell, mobilePrimary: true },
  { id: 'profile', label: 'Profile', description: 'Your public profile and posts.', icon: User, mobilePrimary: true },
  { id: 'settings', label: 'Settings', description: 'Account, appearance, language and notifications.', icon: Settings, mobilePrimary: false },
];

export function isSectionId(value: string): value is SectionId {
  return (SECTION_IDS as readonly string[]).includes(value);
}
