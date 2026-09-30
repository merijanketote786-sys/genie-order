ALTER TABLE public.pos_member_roles ADD COLUMN IF NOT EXISTS perms text[];

CREATE OR REPLACE FUNCTION public.pos_user_perms(_uid uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN public.has_role(_uid, 'admin') THEN public.pos_perms('admin')
    ELSE coalesce((SELECT perms FROM public.pos_member_roles WHERE user_id = _uid AND workspace_id = public.current_workspace()), public.pos_perms(public.pos_role(_uid))) END
$$;

CREATE OR REPLACE FUNCTION public.pos_can(_perm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT auth.uid() IS NOT NULL AND public.is_active_team_member(auth.uid()) AND _perm = ANY(public.pos_user_perms(auth.uid()))
$$;

CREATE OR REPLACE FUNCTION public.pos_my_access()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object('role', public.pos_role(auth.uid()), 'perms', to_jsonb(public.pos_user_perms(auth.uid())),
    'hasPin', EXISTS (SELECT 1 FROM public.pos_settings WHERE workspace_id = public.current_workspace() AND pin_hash IS NOT NULL))
$$;

CREATE OR REPLACE FUNCTION public.pos_set_member_role(_user uuid, _role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ws uuid := public.current_workspace();
BEGIN
  IF NOT public.pos_can('manage_users') THEN RAISE EXCEPTION 'Ijazat nahi'; END IF;
  IF _role NOT IN ('manager','cashier','salesman','staff') THEN RAISE EXCEPTION 'bad role'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user AND workspace_id = ws) THEN RAISE EXCEPTION 'user not in workspace'; END IF;
  INSERT INTO public.pos_member_roles(workspace_id, user_id, role, perms) VALUES (ws, _user, _role, NULL)
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role, perms = NULL, updated_at = now();
  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by) VALUES (ws, 'set_role', 'pos_member', _user, jsonb_build_object('role', _role), auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.pos_set_member_perms(_user uuid, _perms text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ws uuid := public.current_workspace(); clean text[];
BEGIN
  IF NOT public.pos_can('manage_users') THEN RAISE EXCEPTION 'Ijazat nahi'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user AND workspace_id = ws) THEN RAISE EXCEPTION 'user not in workspace'; END IF;
  SELECT coalesce(array_agg(DISTINCT p), '{}') INTO clean FROM unnest(_perms) p WHERE p = ANY(public.pos_perms('admin'));
  INSERT INTO public.pos_member_roles(workspace_id, user_id, role, perms) VALUES (ws, _user, 'manager', clean)
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET perms = EXCLUDED.perms, updated_at = now();
  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by) VALUES (ws, 'set_perms', 'pos_member', _user, jsonb_build_object('perms', clean), auth.uid());
END $$;