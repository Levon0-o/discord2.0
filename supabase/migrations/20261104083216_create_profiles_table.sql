/*
# Create profiles table

Plain-English summary: every person who signs up gets one public profile holding their unique username, display name, bio, avatar and banner. Anyone signed in can view profiles, but each person can only create and edit their own.

1. New Tables
- `profiles`
  - `id` (uuid, primary key): the same ID as the person's sign-in account.
  - `username` (text, unique): lowercase, 3-30 characters, letters, numbers and underscores only.
  - `display_name` (text, optional): 1-50 characters.
  - `bio` (text): up to 280 characters, empty by default.
  - `avatar_url` / `banner_url` (text, optional): image addresses.
  - `created_at` / `updated_at` (timestamps).

2. Security
- Row Level Security enabled on `profiles`.
- Only the `authenticated` role is granted access. Anonymous visitors cannot read anything.
- Column-restricted writes: users can update only username, display name, bio, avatar and banner.
- Policies: any signed-in user can read profiles; users can insert and update only their own profile; deleting a profile happens only when the sign-in account is deleted.

3. Notes
- A shared `set_updated_at` helper keeps `updated_at` current on every update.
*/

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  display_name text,
  bio text NOT NULL DEFAULT '',
  avatar_url text,
  banner_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_username_format CHECK (username ~ '^[a-z0-9_]{3,30}$'),
  CONSTRAINT profiles_display_name_length CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 1 AND 50),
  CONSTRAINT profiles_bio_length CHECK (char_length(bio) <= 280)
);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_key ON public.profiles (username);

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.profiles TO authenticated;
GRANT INSERT (id, username, display_name, bio, avatar_url, banner_url) ON public.profiles TO authenticated;
GRANT UPDATE (username, display_name, bio, avatar_url, banner_url) ON public.profiles TO authenticated;

DROP POLICY IF EXISTS "profiles_select_signed_in" ON public.profiles;
CREATE POLICY "profiles_select_signed_in" ON public.profiles FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT
TO authenticated WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE
TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
