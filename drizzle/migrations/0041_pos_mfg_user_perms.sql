CREATE OR REPLACE FUNCTION public.pos_perms(_role text)
 RETURNS text[] LANGUAGE sql IMMUTABLE AS $function$
  SELECT CASE _role
    WHEN 'admin' THEN ARRAY['view_pos','create_sale','edit_sale','return_sale','edit_price','apply_discount','cancel_invoice','view_reports','view_profit','edit_stock','edit_products','view_balances','manage_customers','manage_suppliers','manage_expenses','manage_purchases','manage_printers','manage_users','settings',
      'view_accounting','create_journal','post_journal','view_ledger','view_trial_balance','view_pnl','view_balance_sheet','view_ar_ap','manage_accounts','close_period','manufacture','mfg_settings']
    WHEN 'manager' THEN ARRAY['view_pos','create_sale','edit_sale','return_sale','edit_price','apply_discount','cancel_invoice','view_reports','view_profit','edit_stock','edit_products','view_balances','manage_customers','manage_suppliers','manage_expenses','manage_purchases','manage_printers',
      'view_accounting','create_journal','view_ledger','view_trial_balance','view_pnl','view_balance_sheet','view_ar_ap']
    WHEN 'salesman' THEN ARRAY['view_pos','create_sale','return_sale','apply_discount','view_balances','manage_customers']
    WHEN 'cashier' THEN ARRAY['view_pos','create_sale','return_sale','view_balances','manage_expenses','manage_customers']
    ELSE ARRAY['view_pos','create_sale'] END
$function$;

CREATE OR REPLACE FUNCTION public.pos_guard_mfg_admin()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF TG_TABLE_NAME = 'stock_movements' THEN
    IF NEW.kind NOT IN ('manufacture_in','manufacture_out') THEN RETURN NEW; END IF;
    IF auth.uid() IS NOT NULL AND NOT (public.pos_is_admin() OR public.pos_can('manufacture')) THEN RAISE EXCEPTION 'No permission to manufacture'; END IF;
    RETURN NEW;
  END IF;
  IF auth.uid() IS NOT NULL AND NOT (public.pos_is_admin() OR public.pos_can('mfg_settings')) THEN RAISE EXCEPTION 'No permission to change manufacturing settings'; END IF;
  RETURN COALESCE(NEW, OLD);
END $function$;

CREATE OR REPLACE FUNCTION public.pos_mfg_status()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT jsonb_build_object('isAdmin', public.pos_is_admin(),
    'canManufacture', public.pos_is_admin() OR public.pos_can('manufacture'),
    'canSettings', public.pos_is_admin() OR public.pos_can('mfg_settings'),
    'hasPin', EXISTS (SELECT 1 FROM pos_settings WHERE workspace_id = public.current_workspace() AND mfg_pin_hash IS NOT NULL))
$function$;

CREATE OR REPLACE FUNCTION public.pos_verify_mfg_pin(_pin text)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $function$
DECLARE h text;
BEGIN
  IF NOT (public.pos_is_admin() OR public.pos_can('mfg_settings')) THEN RETURN false; END IF;
  SELECT mfg_pin_hash INTO h FROM pos_settings WHERE workspace_id = public.current_workspace();
  IF h IS NULL THEN RETURN true; END IF;
  RETURN coalesce(_pin,'') <> '' AND extensions.crypt(_pin, h) = h;
END $function$;