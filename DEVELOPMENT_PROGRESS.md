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
- Spotify and YouTube link embeds in direct messages, server channels and event chats, with click-to-load playback.
- Shared Listening rooms in DMs, server channels and event chats, with a persistent realtime queue and synchronized current-item selection.
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


- Additional server settings and permission controls as the platform grows.
- Automated test coverage and a dedicated test suite.
- Review and refresh this document as features are completed.

## Global Events database setup
- Apply `supabase/migrations/20261119100000_global_public_event_discovery.sql` to expose only upcoming events from public servers through a restricted discovery RPC.

## Shared Listening
- Persistent per-chat rooms for DMs, channels and event chats, protected by chat membership checks.
- Collaborative Spotify/YouTube queue, realtime queue updates and shared current-item selection.
- Each member loads the official provider embed locally; synchronized playback position, automatic play/pause and provider-account controls are not available in this implementation.

## Video calls and screen sharing
- Direct one-to-one WebRTC calls now include optional camera activation during a connected call.
- Direct calls support browser screen/window sharing, local preview, remote video and restoration of the camera after sharing ends.
- Existing server event voice rooms now support optional camera video and screen sharing for connected participants.
- Video is negotiated as a WebRTC transceiver so camera and screen tracks can be switched without restarting the call.
- Camera and screen permissions are requested only when the user activates those controls.
- Current server-side implementation extends event voice rooms; dedicated always-available voice channels inside ordinary server channel lists are still future work.
- The existing peer-to-peer mesh is suitable for small rooms only. Larger rooms will need an SFU/media server rather than one peer connection per participant.
- This frontend work has not yet been build-tested or deployed; the Vercel daily deployment quota was previously reached.

## Media embeds
- Recognizes supported Spotify track, album, playlist, episode and show links, plus YouTube videos, Shorts and live links.
- Uses official provider embed players and click-to-load behavior; playback and account restrictions remain controlled by Spotify and YouTube.
- Playback is embedded per message; synchronized group listening is not implemented.

## Deployment and database notes

- Frontend deployment is handled by Vercel.
- Supabase schema changes are stored in `supabase/migrations`.
- A successful frontend deployment does not apply SQL migrations automatically; database migrations must be run separately.
