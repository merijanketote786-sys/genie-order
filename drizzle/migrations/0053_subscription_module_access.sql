ALTER TABLE public.workspace_subscriptions ADD COLUMN IF NOT EXISTS pos_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.workspace_subscriptions ADD COLUMN IF NOT EXISTS ws_enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.sub_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE ws uuid; s record; t text := TG_TABLE_NAME;
BEGIN
  IF TG_OP = 'DELETE' THEN ws := (to_jsonb(OLD) ->> 'workspace_id')::uuid; ELSE ws := (to_jsonb(NEW) ->> 'workspace_id')::uuid; END IF;
  IF auth.uid() IS NOT NULL AND ws IS NOT NULL AND NOT public.is_platform_owner() THEN
    IF NOT public.ws_active(ws) THEN
      RAISE EXCEPTION 'Subscription expired. Your account is read-only. Please contact the admin to renew.';
    END IF;
    SELECT pos_enabled, ws_enabled INTO s FROM public.workspace_subscriptions WHERE workspace_id = ws;
    IF FOUND THEN
      IF NOT s.pos_enabled AND (t LIKE 'pos\_%' OR t LIKE 'acc\_%' OR t LIKE 'att\_%' OR t IN ('purchases','purchase_items','suppliers','stock_movements','expenses')) THEN
        RAISE EXCEPTION 'POS is not included in your subscription. Please contact the admin.';
      END IF;
      IF NOT s.ws_enabled AND t IN ('orders','invoices','courier_profiles','workspace_settings') THEN
        RAISE EXCEPTION 'Workspace is not included in your subscription. Please contact the admin.';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.sub_list()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_owner() THEN RAISE EXCEPTION 'permission denied'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
      'workspace_id', w.ws, 'email', w.email, 'name', w.name, 'created_at', w.created_at,
      'business', (SELECT business_name FROM public.workspace_settings ws WHERE ws.workspace_id = w.ws),
      'expires_at', s.expires_at,
      'pos_enabled', coalesce(s.pos_enabled, true), 'ws_enabled', coalesce(s.ws_enabled, true)) ORDER BY w.created_at DESC)
    FROM (SELECT p.workspace_id ws, min(u.email) FILTER (WHERE p.id = p.workspace_id) email,
                 min(p.full_name) FILTER (WHERE p.id = p.workspace_id) name, min(p.created_at) created_at
          FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id GROUP BY p.workspace_id) w
    LEFT JOIN public.workspace_subscriptions s ON s.workspace_id = w.ws), '[]'::jsonb);
END $function$;

CREATE OR REPLACE FUNCTION public.my_subscription()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object('active', public.is_platform_owner() OR public.ws_active(public.current_workspace()),
    'expires_at', (SELECT expires_at FROM public.workspace_subscriptions WHERE workspace_id = public.current_workspace()),
    'pos', public.is_platform_owner() OR coalesce((SELECT pos_enabled FROM public.workspace_subscriptions WHERE workspace_id = public.current_workspace()), true),
    'workspace', public.is_platform_owner() OR coalesce((SELECT ws_enabled FROM public.workspace_subscriptions WHERE workspace_id = public.current_workspace()), true),
    'owner', public.is_platform_owner())
$function$;

CREATE OR REPLACE FUNCTION public.sub_set_modules(_ws uuid, _pos boolean, _workspace boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_platform_owner() THEN RAISE EXCEPTION 'permission denied'; END IF;
  IF NOT _pos AND NOT _workspace THEN RAISE EXCEPTION 'Keep at least one of POS or Workspace enabled'; END IF;
  INSERT INTO public.workspace_subscriptions (workspace_id, expires_at, pos_enabled, ws_enabled, updated_at) VALUES (_ws, now(), _pos, _workspace, now())
  ON CONFLICT (workspace_id) DO UPDATE SET pos_enabled = EXCLUDED.pos_enabled, ws_enabled = EXCLUDED.ws_enabled, updated_at = now();
END $function$;
REVOKE ALL ON FUNCTION public.sub_set_modules(uuid, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sub_set_modules(uuid, boolean, boolean) TO authenticated;