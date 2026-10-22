CREATE TABLE IF NOT EXISTS public.pos_firms (
  id uuid PRIMARY KEY,
  owner_id uuid NOT NULL,
  root_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pos_firms TO authenticated;
GRANT ALL ON public.pos_firms TO service_role;
ALTER TABLE public.pos_firms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read their firms" ON public.pos_firms FOR SELECT TO authenticated USING (owner_id = auth.uid());
CREATE INDEX IF NOT EXISTS pos_firms_owner_idx ON public.pos_firms(owner_id);

CREATE OR REPLACE FUNCTION public.firm_root(_ws uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((SELECT root_id FROM public.pos_firms WHERE id = _ws), _ws)
$$;

CREATE OR REPLACE FUNCTION public.ws_active(_ws uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_subscriptions s WHERE s.workspace_id = public.firm_root(_ws) AND (s.expires_at IS NULL OR s.expires_at > now()))
$$;

CREATE OR REPLACE FUNCTION public.my_subscription() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('active', public.is_platform_owner() OR public.ws_active(public.current_workspace()),
    'expires_at', (SELECT expires_at FROM public.workspace_subscriptions WHERE workspace_id = public.firm_root(public.current_workspace())),
    'pos', public.is_platform_owner() OR coalesce((SELECT pos_enabled FROM public.workspace_subscriptions WHERE workspace_id = public.firm_root(public.current_workspace())), true),
    'workspace', public.is_platform_owner() OR coalesce((SELECT ws_enabled FROM public.workspace_subscriptions WHERE workspace_id = public.firm_root(public.current_workspace())), true),
    'owner', public.is_platform_owner())
$$;

DO $migration$
DECLARE def text;
BEGIN
  def := pg_get_functiondef('public.sub_guard()'::regprocedure);
  IF position('FROM public.workspace_subscriptions WHERE workspace_id = ws;' IN def) = 0 THEN
    RAISE EXCEPTION 'sub_guard has unexpected shape';
  END IF;
  def := replace(def, 'FROM public.workspace_subscriptions WHERE workspace_id = ws;', 'FROM public.workspace_subscriptions WHERE workspace_id = public.firm_root(ws);');
  EXECUTE def;
END $migration$;

CREATE OR REPLACE FUNCTION public.profiles_guard_privileged_columns() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  if auth.uid() is null then
    return new;
  end if;
  -- workspace_id may only change to a firm owned by this same user (firm switch)
  if new.workspace_id is distinct from old.workspace_id then
    if not (new.id = auth.uid() and (new.workspace_id = new.id
        or exists (select 1 from public.pos_firms f where f.id = new.workspace_id and f.owner_id = new.id))) then
      new.workspace_id := old.workspace_id;
    end if;
  end if;
  if public.has_role(auth.uid(), 'admin') then
    return new;
  end if;
  new.role := old.role;
  new.is_active := old.is_active;
  return new;
end
$$;

CREATE OR REPLACE FUNCTION public.pos_list_firms() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH me AS (SELECT auth.uid() AS uid),
  own AS (
    SELECT me.uid AS id, coalesce((SELECT name FROM public.pos_firms WHERE id = me.uid), nullif((SELECT business_name FROM public.workspace_settings WHERE workspace_id = me.uid), ''), 'Main firm') AS name, (SELECT created_at FROM auth.users WHERE id = me.uid) AS created_at
    FROM me WHERE EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = me.uid AND r.workspace_id = me.uid AND r.role = 'admin')
    UNION ALL
    SELECT f.id, f.name, f.created_at FROM public.pos_firms f, me WHERE f.owner_id = me.uid AND f.id <> me.uid
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'current', id = public.current_workspace()) ORDER BY created_at), '[]'::jsonb) FROM own
$$;

CREATE OR REPLACE FUNCTION public.pos_create_firm(_name text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); nm text := btrim(coalesce(_name, '')); nid uuid := gen_random_uuid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = uid AND workspace_id = uid AND role = 'admin') THEN
    RAISE EXCEPTION 'Only the business owner can add firms';
  END IF;
  IF length(nm) < 1 OR length(nm) > 120 THEN RAISE EXCEPTION 'Enter a firm name (max 120 characters)'; END IF;
  IF (SELECT count(*) FROM public.pos_firms WHERE owner_id = uid) >= 20 THEN RAISE EXCEPTION 'Firm limit reached'; END IF;
  INSERT INTO public.pos_firms(id, owner_id, root_id, name)
    VALUES (uid, uid, uid, coalesce(nullif((SELECT business_name FROM public.workspace_settings WHERE workspace_id = uid), ''), 'Main firm'))
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.pos_firms(id, owner_id, root_id, name) VALUES (nid, uid, uid, nm);
  INSERT INTO public.user_roles(user_id, role, workspace_id) VALUES (uid, 'admin', nid) ON CONFLICT DO NOTHING;
  INSERT INTO public.workspace_settings(workspace_id, business_name, updated_by) VALUES (nid, nm, uid) ON CONFLICT DO NOTHING;
  PERFORM public.pos_default_store(nid);
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.pos_rename_firm(_id uuid, _name text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); nm text := btrim(coalesce(_name, ''));
BEGIN
  IF length(nm) < 1 OR length(nm) > 120 THEN RAISE EXCEPTION 'Enter a firm name (max 120 characters)'; END IF;
  UPDATE public.pos_firms SET name = nm WHERE id = _id AND owner_id = uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Firm not found'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.pos_switch_firm(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF NOT (_id = uid AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = uid AND workspace_id = uid AND role = 'admin'))
     AND NOT EXISTS (SELECT 1 FROM public.pos_firms WHERE id = _id AND owner_id = uid) THEN
    RAISE EXCEPTION 'Firm not found';
  END IF;
  UPDATE public.profiles SET workspace_id = _id WHERE id = uid;
  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, created_by) VALUES (_id, 'switch', 'firm', _id, uid);
END $$;

REVOKE ALL ON FUNCTION public.firm_root(uuid), public.pos_list_firms(), public.pos_create_firm(text), public.pos_rename_firm(uuid, text), public.pos_switch_firm(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_list_firms(), public.pos_create_firm(text), public.pos_rename_firm(uuid, text), public.pos_switch_firm(uuid) TO authenticated;