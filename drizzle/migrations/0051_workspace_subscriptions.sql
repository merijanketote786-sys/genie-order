CREATE TABLE public.workspace_subscriptions (
  workspace_id uuid PRIMARY KEY,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.workspace_subscriptions TO authenticated;
GRANT ALL ON public.workspace_subscriptions TO service_role;
ALTER TABLE public.workspace_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own workspace sub read" ON public.workspace_subscriptions FOR SELECT TO authenticated USING (workspace_id = public.current_workspace());

-- existing workspaces stay unlimited
INSERT INTO public.workspace_subscriptions (workspace_id, expires_at)
SELECT DISTINCT workspace_id, NULL::timestamptz FROM public.profiles ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_platform_owner() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT lower(coalesce(auth.jwt() ->> 'email','')) IN ('hhtraders008@gmail.com','merijanketote786@gmail.com')
$$;

CREATE OR REPLACE FUNCTION public.ws_active(_ws uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_subscriptions s WHERE s.workspace_id = _ws AND (s.expires_at IS NULL OR s.expires_at > now()))
$$;

CREATE OR REPLACE FUNCTION public.my_subscription() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('active', public.is_platform_owner() OR public.ws_active(public.current_workspace()),
    'expires_at', (SELECT expires_at FROM public.workspace_subscriptions WHERE workspace_id = public.current_workspace()),
    'owner', public.is_platform_owner())
$$;

CREATE OR REPLACE FUNCTION public.sub_list() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_owner() THEN RAISE EXCEPTION 'permission denied'; END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
      'workspace_id', w.ws, 'email', w.email, 'name', w.name, 'created_at', w.created_at,
      'business', (SELECT business_name FROM public.workspace_settings ws WHERE ws.workspace_id = w.ws),
      'expires_at', s.expires_at) ORDER BY w.created_at DESC)
    FROM (SELECT p.workspace_id ws, min(u.email) FILTER (WHERE p.id = p.workspace_id) email,
                 min(p.full_name) FILTER (WHERE p.id = p.workspace_id) name, min(p.created_at) created_at
          FROM public.profiles p LEFT JOIN auth.users u ON u.id = p.id GROUP BY p.workspace_id) w
    LEFT JOIN public.workspace_subscriptions s ON s.workspace_id = w.ws), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.sub_set(_ws uuid, _expires timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_owner() THEN RAISE EXCEPTION 'permission denied'; END IF;
  INSERT INTO public.workspace_subscriptions (workspace_id, expires_at, updated_at) VALUES (_ws, _expires, now())
  ON CONFLICT (workspace_id) DO UPDATE SET expires_at = EXCLUDED.expires_at, updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.sub_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ws uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN ws := (to_jsonb(OLD) ->> 'workspace_id')::uuid; ELSE ws := (to_jsonb(NEW) ->> 'workspace_id')::uuid; END IF;
  IF auth.uid() IS NOT NULL AND ws IS NOT NULL AND NOT public.is_platform_owner() AND NOT public.ws_active(ws) THEN
    RAISE EXCEPTION 'Subscription expired. Your account is read-only. Please contact the admin to renew.';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['acc_accounts','acc_journal_lines','acc_journals','acc_settings','att_days','att_devices','att_labour','att_payments','courier_profiles','customers','expenses','invoices','orders','pos_cash_counts','pos_cash_entries','pos_categories','pos_payments','pos_recipes','pos_sale_items','pos_sales','pos_settings','pos_store_stock','pos_stores','pos_units','products','purchase_items','purchases','stock_movements','suppliers','workspace_settings'] LOOP
    EXECUTE format('CREATE TRIGGER zz_sub_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.sub_guard()', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.sub_on_profile() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- no trial: new workspaces start expired (read-only) until the owner activates them
  INSERT INTO public.workspace_subscriptions (workspace_id, expires_at) VALUES (NEW.workspace_id, now()) ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER sub_on_profile_insert AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sub_on_profile();