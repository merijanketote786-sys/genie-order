-- 1) Lock workspace_id (and role/is_active) for ALL session users on profiles updates
CREATE OR REPLACE FUNCTION public.profiles_guard_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  -- service role / server-side context (no session user) is trusted
  if auth.uid() is null then
    return new;
  end if;

  -- workspace_id can never be changed from a client session
  new.workspace_id := old.workspace_id;

  -- workspace admins may change the remaining privileged fields
  if public.has_role(auth.uid(), 'admin') then
    return new;
  end if;

  new.role := old.role;
  new.is_active := old.is_active;
  return new;
end
$function$;

-- 2) Scope roles to a workspace
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS workspace_id uuid;

UPDATE public.user_roles r
SET workspace_id = p.workspace_id
FROM public.profiles p
WHERE p.id = r.user_id AND r.workspace_id IS NULL;

DELETE FROM public.user_roles WHERE workspace_id IS NULL;

ALTER TABLE public.user_roles ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.user_roles ALTER COLUMN workspace_id SET DEFAULT public.current_workspace();

ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_user_role_workspace_key
  ON public.user_roles (user_id, role, workspace_id);

-- 3) Role checks must match the caller's workspace
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND ur.workspace_id = p.workspace_id
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_active_team_member(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _user_id
      AND p.is_active
      AND p.workspace_id = (SELECT p2.workspace_id FROM public.profiles p2 WHERE p2.id = auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.user_roles r
        WHERE r.user_id = _user_id
          AND r.role IN ('admin','staff')
          AND r.workspace_id = p.workspace_id
      )
  )
$function$;

-- 4) Signup triggers must stamp the workspace
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ws uuid;
BEGIN
  ws := CASE WHEN lower(NEW.email) = 'merijanketote786@gmail.com'
    THEN COALESCE((SELECT id FROM auth.users WHERE lower(email) = 'hhtraders008@gmail.com' LIMIT 1), NEW.id)
    ELSE NEW.id END;

  INSERT INTO public.profiles (id, full_name, workspace_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', ''),
    ws
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role, workspace_id)
  VALUES (NEW.id, 'staff', (SELECT workspace_id FROM public.profiles WHERE id = NEW.id))
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.grant_admin_for_owner_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  ws uuid;
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND lower(NEW.email) = 'hhtraders008@gmail.com' THEN
    SELECT workspace_id INTO ws FROM public.profiles WHERE id = NEW.id;
    IF ws IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role, workspace_id)
      VALUES (NEW.id, 'admin', ws)
      ON CONFLICT DO NOTHING;
      UPDATE public.profiles SET role = 'admin' WHERE id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 5) RLS policies on user_roles scoped by workspace
DROP POLICY IF EXISTS "Users can read their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Workspace admins can view roles" ON public.user_roles;
DROP POLICY IF EXISTS "Workspace admins manage roles" ON public.user_roles;

CREATE POLICY "Users can read their own roles"
ON public.user_roles FOR SELECT TO authenticated
USING (auth.uid() = user_id AND workspace_id = public.current_workspace());

CREATE POLICY "Workspace admins can view roles"
ON public.user_roles FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  AND workspace_id = public.current_workspace()
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_roles.user_id AND p.workspace_id = public.current_workspace())
);

CREATE POLICY "Workspace admins manage roles"
ON public.user_roles FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  AND workspace_id = public.current_workspace()
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_roles.user_id AND p.workspace_id = public.current_workspace())
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  AND workspace_id = public.current_workspace()
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = user_roles.user_id AND p.workspace_id = public.current_workspace())
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;