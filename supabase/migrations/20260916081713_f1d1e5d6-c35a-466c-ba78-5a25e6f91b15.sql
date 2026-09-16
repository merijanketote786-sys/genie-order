CREATE OR REPLACE FUNCTION public.current_workspace()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.workspace_id FROM public.profiles p WHERE p.id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_active_team_member(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = _user_id AND p.is_active
  ) AND EXISTS (
    SELECT 1 FROM public.user_roles r WHERE r.user_id = _user_id AND r.role IN ('admin','staff')
  )
$$;

REVOKE ALL ON FUNCTION public.current_workspace() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_active_team_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_workspace() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_active_team_member(uuid) TO authenticated, service_role;