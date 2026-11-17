# AFTERDARK Development Progress

## Project overview

AFTERDARK is a dark, blue-accented social and community platform built with React, Vite, TypeScript, Tailwind CSS and Supabase.

## Implemented

### Authentication and profiles
- Email/password registration, login, session persistence, password recovery and sign-out.
- Profile creation, profile pages, profile editing, avatars, banners, status and featured profile elements.

### Social
- Feed posts with image/video support.
- Comments, replies, likes and reactions.
- Editing, deleting, pinning and saving posts.
- Mentions, follows, user search and Explore views.
- Social polls with configurable voting options.

### Servers and channels
- Public/private servers, discovery, joining and invitation links.
- Server channels, categories, channel editing, restricted channels and slowmode.
- Channel-level member permissions.
- Custom roles, role permissions and member role assignment.
- Server events, RSVPs, calendar/list views, event chat and voice rooms.
- Global Events discovery for upcoming events hosted by public servers, with date filters, search, RSVP counts and one-step server joining.
- Event reminders delivered by scheduled database jobs.

### Messaging
- Direct conversations, friends and friend requests.
- Message attachments, edits, deletes, reactions, pins and read receipts.
- Typing indicators, unread counts and WebRTC voice calls.

### Moderation
- Server-level moderation dashboard for event-chat reports, with open/resolved/dismissed filters, search, and report review actions.

### Notifications and account settings
- Notification center with read/unread management.
- Notification preferences for social activity and server events.
- Account information, password updates and sign-out.

## Current work: centralized server settings

Server administration is being consolidated into one Discord-inspired **Server Settings** panel. The current panel includes:
- Overview: server name, description, visibility, theme color, icon URL and banner URL.
- Members: member search and custom-role assignment.
- Roles & Permissions: existing custom role manager.
- Auto Roles: create, enable/disable and delete automatic role rules.
- Channels: create, edit, delete and configure channel permissions.
- Invites: create, copy and revoke invitation links.

All user-facing labels and messages in the new settings interface are in English.

## Automatic roles

The database previously contained an automatic-role rules table but did not execute rules. The current implementation adds:
- Automatic custom-role assignment when a member joins.
- Minimum account-age rules, checked when a member joins.
- Database-trigger execution for both public joins and invitation redemption.
- Admin-only rule management through server settings.

The migration `supabase/migrations/20261117150000_complete_auto_roles.sql` must be applied to the Supabase project before automatic role rules work in production.

## Known gaps / future work

- Broader moderation tools beyond event-chat report review.

- Spotify/YouTube playback integration.
- Additional server settings and permission controls as the platform grows.
- Automated test coverage and a dedicated test suite.
- Review and refresh this document as features are completed.

## Global Events database setup
- Apply `supabase/migrations/20261119100000_global_public_event_discovery.sql` to expose only upcoming events from public servers through a restricted discovery RPC.

## Deployment and database notes

- Frontend deployment is handled by Vercel.
- Supabase schema changes are stored in `supabase/migrations`.
- A successful frontend deployment does not apply SQL migrations automatically; database migrations must be run separately.
