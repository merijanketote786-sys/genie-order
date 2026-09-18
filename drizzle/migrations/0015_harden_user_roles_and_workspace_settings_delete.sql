-- 1) Keep user_roles.workspace_id consistent with the target user's profile,
--    and block non-admin role/workspace tampering at the data layer.
CREATE OR REPLACE FUNCTION public.user_roles_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  target_ws uuid;
BEGIN
  -- trusted server-side context (service role, triggers on auth.users)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'only workspace admins can manage roles';
  END IF;

  SELECT p.workspace_id INTO target_ws FROM public.profiles p WHERE p.id = NEW.user_id;
  IF target_ws IS NULL THEN
    RAISE EXCEPTION 'target user has no profile';
  END IF;

  -- admins may only grant roles inside their own workspace
  IF target_ws <> public.current_workspace() THEN
    RAISE EXCEPTION 'cannot manage roles outside your workspace';
  END IF;

  -- workspace_id always mirrors the target profile; it can never be forged
  NEW.workspace_id := target_ws;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_roles_guard_ins ON public.user_roles;
CREATE TRIGGER user_roles_guard_ins
BEFORE INSERT ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.user_roles_guard();

DROP TRIGGER IF EXISTS user_roles_guard_upd ON public.user_roles;
CREATE TRIGGER user_roles_guard_upd
BEFORE UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.user_roles_guard();

-- 2) workspace_settings must never be deleted from a client session.
REVOKE DELETE ON public.workspace_settings FROM authenticated;
REVOKE DELETE ON public.workspace_settings FROM anon;

DROP POLICY IF EXISTS "No one can delete workspace settings" ON public.workspace_settings;
CREATE POLICY "No one can delete workspace settings"
ON public.workspace_settings
FOR DELETE
TO authenticated
USING (false);
