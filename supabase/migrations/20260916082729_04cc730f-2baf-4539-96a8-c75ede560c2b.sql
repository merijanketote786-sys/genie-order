create or replace function public.is_active_team_member(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _user_id
      AND p.is_active
      AND p.workspace_id = (SELECT p2.workspace_id FROM public.profiles p2 WHERE p2.id = auth.uid())
  ) AND EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = _user_id AND r.role IN ('admin','staff')
  )
$function$;