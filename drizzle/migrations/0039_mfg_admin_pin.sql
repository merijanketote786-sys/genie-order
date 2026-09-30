ALTER TABLE public.pos_settings ADD COLUMN IF NOT EXISTS mfg_pin_hash text;

CREATE OR REPLACE FUNCTION public.pos_is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin') AND public.is_active_team_member(auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.pos_set_mfg_pin(_pin text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE ws uuid := public.current_workspace();
BEGIN
  IF ws IS NULL OR NOT public.pos_is_admin() THEN RAISE EXCEPTION 'Only admin can set the manufacturing PIN'; END IF;
  IF _pin IS NOT NULL AND _pin !~ '^[0-9]{4,8}$' THEN RAISE EXCEPTION 'PIN must be 4 to 8 digits'; END IF;
  INSERT INTO pos_settings(workspace_id, config, mfg_pin_hash, updated_at, updated_by)
  VALUES (ws, '{}'::jsonb, CASE WHEN _pin IS NULL THEN NULL ELSE extensions.crypt(_pin, extensions.gen_salt('bf')) END, now(), auth.uid())
  ON CONFLICT (workspace_id) DO UPDATE SET mfg_pin_hash = EXCLUDED.mfg_pin_hash, updated_at = now(), updated_by = auth.uid();
  INSERT INTO audit_log(workspace_id, action, entity, details, created_by) VALUES (ws, 'mfg_pin_change', 'pos', jsonb_build_object('cleared', _pin IS NULL), auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.pos_mfg_status() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('isAdmin', public.pos_is_admin(),
    'hasPin', EXISTS (SELECT 1 FROM pos_settings WHERE workspace_id = public.current_workspace() AND mfg_pin_hash IS NOT NULL))
$$;

CREATE OR REPLACE FUNCTION public.pos_verify_mfg_pin(_pin text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE h text;
BEGIN
  IF NOT public.pos_is_admin() THEN RETURN false; END IF;
  SELECT mfg_pin_hash INTO h FROM pos_settings WHERE workspace_id = public.current_workspace();
  IF h IS NULL THEN RETURN true; END IF;
  RETURN coalesce(_pin,'') <> '' AND extensions.crypt(_pin, h) = h;
END $$;

CREATE OR REPLACE FUNCTION public.pos_guard_mfg_admin() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'stock_movements' AND NEW.kind NOT IN ('manufacture_in','manufacture_out') THEN RETURN NEW; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.pos_is_admin() THEN RAISE EXCEPTION 'Only admin can use manufacturing'; END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS pos_recipes_admin_only ON public.pos_recipes;
CREATE TRIGGER pos_recipes_admin_only BEFORE INSERT OR UPDATE OR DELETE ON public.pos_recipes FOR EACH ROW EXECUTE FUNCTION public.pos_guard_mfg_admin();
DROP TRIGGER IF EXISTS stock_mfg_admin_only ON public.stock_movements;
CREATE TRIGGER stock_mfg_admin_only BEFORE INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.pos_guard_mfg_admin();

REVOKE EXECUTE ON FUNCTION public.pos_set_mfg_pin(text), public.pos_verify_mfg_pin(text), public.pos_mfg_status(), public.pos_is_admin() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.pos_set_mfg_pin(text), public.pos_verify_mfg_pin(text), public.pos_mfg_status(), public.pos_is_admin() TO authenticated;