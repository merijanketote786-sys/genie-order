CREATE OR REPLACE FUNCTION public.pos_set_firm_pin(_firm uuid, _pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF NOT (_firm = uid AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = uid AND workspace_id = uid AND role = 'admin'))
     AND NOT EXISTS (SELECT 1 FROM public.pos_firms WHERE id = _firm AND owner_id = uid) THEN
    RAISE EXCEPTION 'Firm not found';
  END IF;
  IF _pin IS NOT NULL AND _pin <> '' AND _pin !~ '^[0-9]{4,8}$' THEN RAISE EXCEPTION 'PIN must be 4 to 8 digits'; END IF;
  -- The main firm has no pos_firms row until a second firm is created; create it so the PIN has somewhere to live.
  IF NOT EXISTS (SELECT 1 FROM public.pos_firms WHERE id = _firm) THEN
    INSERT INTO public.pos_firms(id, owner_id, root_id, name)
    VALUES (_firm, uid, uid, coalesce(nullif((SELECT business_name FROM public.workspace_settings WHERE workspace_id = uid), ''), 'Main firm'));
  END IF;
  UPDATE public.pos_firms SET pin_hash = CASE WHEN _pin IS NULL OR _pin = '' THEN NULL ELSE extensions.crypt(_pin, extensions.gen_salt('bf')) END WHERE id = _firm;
  IF NOT FOUND THEN RAISE EXCEPTION 'Firm not found'; END IF;
  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by)
  VALUES (_firm, 'firm_pin_change', 'firm', _firm, jsonb_build_object('cleared', _pin IS NULL OR _pin = ''), uid);
END $function$;
GRANT EXECUTE ON FUNCTION public.pos_set_firm_pin(uuid, text) TO authenticated;