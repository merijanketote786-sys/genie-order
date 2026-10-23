ALTER TABLE public.pos_firms ADD COLUMN pin_hash text;
COMMENT ON COLUMN public.pos_firms.pin_hash IS 'Optional PIN lock: bcrypt hash; switching to this firm requires the PIN';

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
  UPDATE public.pos_firms SET pin_hash = CASE WHEN _pin IS NULL OR _pin = '' THEN NULL ELSE extensions.crypt(_pin, extensions.gen_salt('bf')) END WHERE id = _firm;
  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by)
  VALUES (_firm, 'firm_pin_change', 'firm', _firm, jsonb_build_object('cleared', _pin IS NULL OR _pin = ''), uid);
END $function$;
GRANT EXECUTE ON FUNCTION public.pos_set_firm_pin(uuid, text) TO authenticated;

DROP FUNCTION IF EXISTS public.pos_switch_firm(uuid);

CREATE OR REPLACE FUNCTION public.pos_switch_firm(_id uuid, _pin text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE uid uuid := auth.uid(); h text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF NOT (_id = uid AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = uid AND workspace_id = uid AND role = 'admin'))
     AND NOT EXISTS (SELECT 1 FROM public.pos_firms WHERE id = _id AND owner_id = uid) THEN
    RAISE EXCEPTION 'Firm not found';
  END IF;
  SELECT pin_hash INTO h FROM public.pos_firms WHERE id = _id;
  IF h IS NOT NULL AND (coalesce(_pin, '') = '' OR extensions.crypt(_pin, h) <> h) THEN
    RAISE EXCEPTION 'Firm PIN required';
  END IF;
  UPDATE public.profiles SET workspace_id = _id WHERE id = uid;
  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, created_by) VALUES (_id, 'switch', 'firm', _id, uid);
END $function$;
GRANT EXECUTE ON FUNCTION public.pos_switch_firm(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.pos_list_firms()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH me AS (SELECT auth.uid() AS uid),
  own AS (
    SELECT me.uid AS id, coalesce((SELECT name FROM public.pos_firms WHERE id = me.uid), nullif((SELECT business_name FROM public.workspace_settings WHERE workspace_id = me.uid), ''), 'Main firm') AS name, (SELECT created_at FROM auth.users WHERE id = me.uid) AS created_at, (SELECT pin_hash FROM public.pos_firms WHERE id = me.uid) AS pin_hash
    FROM me WHERE EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = me.uid AND r.workspace_id = me.uid AND r.role = 'admin')
    UNION ALL
    SELECT f.id, f.name, f.created_at, f.pin_hash FROM public.pos_firms f, me WHERE f.owner_id = me.uid AND f.id <> me.uid
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'current', id = public.current_workspace(), 'has_pin', pin_hash IS NOT NULL) ORDER BY created_at), '[]'::jsonb) FROM own
$function$;
GRANT EXECUTE ON FUNCTION public.pos_list_firms() TO authenticated;

CREATE OR REPLACE FUNCTION public.pos_list_firm_stores(_firm uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF _firm <> public.current_workspace()
     AND NOT (_firm = uid OR EXISTS (SELECT 1 FROM public.pos_firms WHERE id = _firm AND owner_id = uid)) THEN
    RAISE EXCEPTION 'Firm not found';
  END IF;
  RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'kind', s.kind, 'isDefault', s.is_default, 'isActive', s.is_active) ORDER BY s.is_default DESC, s.created_at) FROM public.pos_stores s WHERE s.workspace_id = _firm AND s.is_active), '[]'::jsonb);
END $function$;
GRANT EXECUTE ON FUNCTION public.pos_list_firm_stores(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.pos_transfer_firm_stock(_from_store uuid, _to_store uuid, _items jsonb, _note text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid(); sws uuid; tws uuid; fn text; tn text; it jsonb; pid uuid; q numeric; have numeric; n int := 0; ref uuid := gen_random_uuid(); tpid uuid; p record;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  sws := public.current_workspace();
  IF sws IS NULL THEN RAISE EXCEPTION 'Workspace not found'; END IF;
  IF NOT public.pos_can('edit_stock') THEN RAISE EXCEPTION 'Stock transfer ki ijazat nahi'; END IF;
  SELECT name INTO fn FROM pos_stores WHERE id = _from_store AND workspace_id = sws AND is_active;
  IF fn IS NULL THEN RAISE EXCEPTION 'Store not found'; END IF;
  SELECT workspace_id, name INTO tws, tn FROM pos_stores WHERE id = _to_store AND is_active;
  IF tn IS NULL THEN RAISE EXCEPTION 'Store not found'; END IF;
  IF tws = sws THEN RAISE EXCEPTION 'Same firm ke stores ke liye normal transfer use karein'; END IF;
  IF tws <> uid AND NOT EXISTS (SELECT 1 FROM pos_firms WHERE id = tws AND owner_id = uid) THEN RAISE EXCEPTION 'Firm not found'; END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Items add karein'; END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    pid := (it->>'product_id')::uuid; q := (it->>'qty')::numeric;
    IF q IS NULL OR q <= 0 THEN RAISE EXCEPTION 'qty ghalat'; END IF;
    SELECT * INTO p FROM products WHERE id = pid AND workspace_id = sws AND is_active;
    IF NOT FOUND THEN RAISE EXCEPTION 'product not found'; END IF;
    SELECT qty INTO have FROM pos_store_stock WHERE store_id = _from_store AND product_id = pid FOR UPDATE;
    IF coalesce(have, 0) < q THEN RAISE EXCEPTION 'Stock kam hai: %', p.name; END IF;
    UPDATE pos_store_stock SET qty = qty - q WHERE store_id = _from_store AND product_id = pid;
    UPDATE products SET stock = stock - q, updated_at = now() WHERE id = pid;
    SELECT id INTO tpid FROM products WHERE workspace_id = tws AND normalized_name = p.normalized_name AND is_active LIMIT 1;
    IF tpid IS NULL THEN
      INSERT INTO products(workspace_id, name, normalized_name, unit, sale_price, wholesale_price, purchase_price, p100_staff_price, p250_staff_price, p500_staff_price, tax_percent, min_stock, scope, store_id)
      VALUES (tws, p.name, p.normalized_name, p.unit, p.sale_price, p.wholesale_price, p.purchase_price, p.p100_staff_price, p.p250_staff_price, p.p500_staff_price, p.tax_percent, p.min_stock, 'pos', _to_store)
      RETURNING id INTO tpid;
    END IF;
    INSERT INTO pos_store_stock(workspace_id, store_id, product_id, qty) VALUES (tws, _to_store, tpid, q)
    ON CONFLICT (store_id, product_id) DO UPDATE SET qty = pos_store_stock.qty + EXCLUDED.qty;
    UPDATE products SET stock = stock + q, updated_at = now() WHERE id = tpid;
    INSERT INTO stock_movements(workspace_id, product_id, kind, qty, ref_id, note, created_by, store_id) VALUES
      (sws, pid, 'transfer_out', -q, ref, left(coalesce(_note, '') || ' → ' || tn || ' (firm transfer)', 300), uid, _from_store),
      (tws, tpid, 'transfer_in', q, ref, left(coalesce(_note, '') || ' ← ' || fn || ' (firm transfer)', 300), uid, _to_store);
    n := n + 1;
  END LOOP;
  INSERT INTO audit_log(workspace_id, action, entity, entity_id, details, created_by) VALUES
    (sws, 'firm_transfer', 'stock', ref, jsonb_build_object('from', fn, 'to', tn, 'items', _items, 'note', _note, 'direction', 'out'), uid),
    (tws, 'firm_transfer', 'stock', ref, jsonb_build_object('from', fn, 'to', tn, 'items', _items, 'note', _note, 'direction', 'in'), uid);
  RETURN n;
END $function$;
GRANT EXECUTE ON FUNCTION public.pos_transfer_firm_stock(uuid, uuid, jsonb, text) TO authenticated;