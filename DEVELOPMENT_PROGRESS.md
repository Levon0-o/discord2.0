# AFTERDARK Development Progress

## Current state (audit)

- The project was a blank Vite + React + TypeScript template with Tailwind and Lucide icons.
- Supabase database: no tables and no migrations existed.
- Authentication: not implemented.
- The attached `AFTERDARK-Phase1.zip` could not be read as a project archive, so its code was not merged. Its contents must be re-supplied in readable form if they should be carried over.

## Stage 1: Visual foundation and responsive layout (done)

- Design tokens: primary (electric blue), secondary (cyan), accent (sky), success, warning, error, and an `ink` neutral ramp, all in Tailwind config.
- Typography: Inter with three weights (400, 500, 600, 700 loaded; used sparingly).
- Desktop: left navigation (icons only on tablet, icons with labels on large screens).
- Tablet: icon-only navigation rail.
- Mobile: top bar, bottom navigation for Home, Explore, Messages, Notifications and Profile, and a Menu drawer for all sections.
- Right panel (large screens and up) with Activity and Recommendations areas.
- Section navigation by URL hash, so refresh keeps the current section.
- Sections (Home, Explore, Servers, Messages, Notifications, Profile, Settings) are visible shells marked "Not built yet".

## Remaining stages

2. Supabase foundation: schema for profiles, posts, comments, likes, follows, servers, server_members, server_roles, channels, messages, conversations, conversation_members, notifications and invitations, with RLS.
3. Authentication: email/password sign-up, login, logout, persistent sessions, password recovery, unique usernames, protected routes.
4. Profiles and social feed: posts, likes, comments, follows, explore, profile editing, avatar and banner uploads.
5. Servers and communities: create/edit/delete servers, channels and categories, roles, invitations, discovery, membership checks.
6. Messaging: one-to-one and group conversations, realtime updates, replies, reactions, edits, image sharing, unread indicators.
7. Music sharing: Spotify and YouTube links with embeds where permitted, link previews, shared music activity.
8. Notifications: new messages, comments, likes, followers, invitations, with unread indicators.
9. Settings: profile customization, blue accent theme, server colors, Polish/English language, notification preferences.
