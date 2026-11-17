/*
  Complete automatic custom-role assignment.
  Rules are evaluated inside the database when a server membership is created,
  so public joins and invitation redemption use the same trusted execution path.
*/
DELETE FROM public.auto_role_rules WHERE event_type NOT IN ('join', 'account_age');

ALTER TABLE public.auto_role_rules
  DROP CONSTRAINT IF EXISTS auto_role_rules_event_type;

ALTER TABLE public.auto_role_rules
  ADD CONSTRAINT auto_role_rules_event_type
  CHECK (event_type IN ('join', 'account_age'));

CREATE OR REPLACE FUNCTION public.apply_auto_roles_on_member_join()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_created_at timestamptz;
BEGIN
  SELECT u.created_at
    INTO v_account_created_at
    FROM auth.users AS u
   WHERE u.id = NEW.user_id;

  INSERT INTO public.member_roles (server_id, user_id, role_id)
  SELECT r.server_id, NEW.user_id, r.role_id
    FROM public.auto_role_rules AS r
   WHERE r.server_id = NEW.server_id
     AND r.is_enabled = true
     AND (
       r.event_type = 'join'
       OR (
         r.event_type = 'account_age'
         AND v_account_created_at IS NOT NULL
         AND COALESCE(r.conditions ->> 'min_days', '') ~ '^[0-9]{1,4}$'
         AND v_account_created_at <= now() - make_interval(days => (r.conditions ->> 'min_days')::integer)
       )
     )
  ON CONFLICT (server_id, user_id, role_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS server_members_apply_auto_roles ON public.server_members;
CREATE TRIGGER server_members_apply_auto_roles
AFTER INSERT ON public.server_members
FOR EACH ROW
EXECUTE FUNCTION public.apply_auto_roles_on_member_join();

REVOKE EXECUTE ON FUNCTION public.apply_auto_roles_on_member_join() FROM PUBLIC, anon, authenticated;
