CREATE OR REPLACE FUNCTION public.sub_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE ws uuid; s record; t text := TG_TABLE_NAME; is_pos boolean; is_wsx boolean; ua jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN ws := (to_jsonb(OLD) ->> 'workspace_id')::uuid; ELSE ws := (to_jsonb(NEW) ->> 'workspace_id')::uuid; END IF;
  is_pos := (t LIKE 'pos\_%' OR t LIKE 'acc\_%' OR t LIKE 'att\_%' OR t IN ('purchases','purchase_items','suppliers','stock_movements','expenses'));
  is_wsx := t IN ('orders','invoices','courier_profiles','workspace_settings');
  IF auth.uid() IS NOT NULL AND ws IS NOT NULL AND NOT public.is_platform_owner() THEN
    IF NOT public.ws_active(ws) THEN
      RAISE EXCEPTION 'Subscription expired. Your account is read-only. Please contact the admin to renew.';
    END IF;
    SELECT pos_enabled, ws_enabled INTO s FROM public.workspace_subscriptions WHERE workspace_id = ws;
    IF FOUND THEN
      IF NOT s.pos_enabled AND is_pos THEN
        RAISE EXCEPTION 'POS is not included in your subscription. Please contact the admin.';
      END IF;
      IF NOT s.ws_enabled AND is_wsx THEN
        RAISE EXCEPTION 'Workspace is not included in your subscription. Please contact the admin.';
      END IF;
    END IF;
    IF (is_pos OR is_wsx) AND NOT public.has_role(auth.uid(), 'admin') THEN
      SELECT allowed_sections INTO ua FROM public.user_settings WHERE user_id = auth.uid();
      IF ua IS NOT NULL AND jsonb_typeof(ua) = 'array' THEN
        IF is_pos AND ua ? '!pos' THEN
          RAISE EXCEPTION 'You do not have POS access. Please contact the admin.';
        END IF;
        IF is_wsx AND ua ? '!ws' THEN
          RAISE EXCEPTION 'You do not have Workspace access. Please contact the admin.';
        END IF;
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $function$;