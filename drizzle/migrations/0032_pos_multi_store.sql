CREATE TABLE public.pos_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'store' CHECK (kind IN ('store','godown')),
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX pos_stores_ws_name ON public.pos_stores(workspace_id, lower(name));
CREATE UNIQUE INDEX pos_stores_ws_default ON public.pos_stores(workspace_id) WHERE is_default;
GRANT SELECT ON public.pos_stores TO authenticated;
GRANT ALL ON public.pos_stores TO service_role;
ALTER TABLE public.pos_stores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws members read stores" ON public.pos_stores FOR SELECT TO authenticated USING (workspace_id = public.current_workspace());

CREATE TABLE public.pos_store_stock (
  workspace_id uuid NOT NULL,
  store_id uuid NOT NULL REFERENCES public.pos_stores(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  qty numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (store_id, product_id)
);
GRANT SELECT ON public.pos_store_stock TO authenticated;
GRANT ALL ON public.pos_store_stock TO service_role;
ALTER TABLE public.pos_store_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws members read store stock" ON public.pos_store_stock FOR SELECT TO authenticated USING (workspace_id = public.current_workspace());

ALTER TABLE public.products ADD COLUMN store_id uuid REFERENCES public.pos_stores(id) ON DELETE SET NULL;
ALTER TABLE public.stock_movements ADD COLUMN store_id uuid REFERENCES public.pos_stores(id) ON DELETE SET NULL;

-- Default store resolve (creates Main Store lazily)
CREATE OR REPLACE FUNCTION public.pos_default_store(_ws uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE sid uuid;
BEGIN
  SELECT id INTO sid FROM pos_stores WHERE workspace_id = _ws AND is_default;
  IF sid IS NULL THEN
    INSERT INTO pos_stores(workspace_id, name, kind, is_default) VALUES (_ws, 'Main Store', 'store', true)
    ON CONFLICT DO NOTHING RETURNING id INTO sid;
    IF sid IS NULL THEN SELECT id INTO sid FROM pos_stores WHERE workspace_id = _ws AND is_default; END IF;
  END IF;
  RETURN sid;
END $$;
REVOKE ALL ON FUNCTION public.pos_default_store(uuid) FROM PUBLIC, anon, authenticated;

-- Store chosen for the current request (x-pos-store header), fallback default
CREATE OR REPLACE FUNCTION public.pos_request_store(_ws uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE h text; sid uuid;
BEGIN
  BEGIN h := current_setting('request.headers', true)::json->>'x-pos-store'; EXCEPTION WHEN others THEN h := NULL; END;
  IF h ~ '^[0-9a-fA-F-]{36}$' THEN
    SELECT id INTO sid FROM pos_stores WHERE id = h::uuid AND workspace_id = _ws AND is_active;
  END IF;
  RETURN coalesce(sid, public.pos_default_store(_ws));
END $$;
REVOKE ALL ON FUNCTION public.pos_request_store(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pos_move_stock(_ws uuid, _product uuid, _qty numeric, _kind text, _ref uuid, _note text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE sid uuid;
BEGIN
  IF _product IS NULL OR _qty = 0 THEN RETURN; END IF;
  UPDATE public.products SET stock = coalesce(stock,0) + _qty WHERE id = _product AND workspace_id = _ws;
  IF FOUND THEN
    IF _kind = 'cancel' AND _ref IS NOT NULL THEN
      SELECT store_id INTO sid FROM stock_movements WHERE ref_id = _ref AND product_id = _product AND kind <> 'cancel' AND store_id IS NOT NULL ORDER BY created_at LIMIT 1;
    END IF;
    sid := coalesce(sid, public.pos_request_store(_ws));
    INSERT INTO pos_store_stock(workspace_id, store_id, product_id, qty) VALUES (_ws, sid, _product, _qty)
    ON CONFLICT (store_id, product_id) DO UPDATE SET qty = pos_store_stock.qty + EXCLUDED.qty;
    INSERT INTO public.stock_movements(workspace_id, product_id, kind, qty, ref_id, note, created_by, store_id)
    VALUES (_ws, _product, _kind, _qty, _ref, _note, auth.uid(), sid);
  END IF;
END $function$;

-- Backfill: Main Store per workspace with all current POS stock
DO $$ DECLARE w uuid; sid uuid; BEGIN
  FOR w IN SELECT DISTINCT workspace_id FROM products WHERE scope = 'pos' LOOP
    sid := public.pos_default_store(w);
    INSERT INTO pos_store_stock(workspace_id, store_id, product_id, qty)
    SELECT w, sid, id, stock FROM products WHERE workspace_id = w AND scope = 'pos' AND coalesce(stock,0) <> 0
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- Assign store to new products when products are not common
CREATE OR REPLACE FUNCTION public.products_assign_store() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.scope = 'pos' AND NEW.store_id IS NULL AND EXISTS (
    SELECT 1 FROM pos_settings WHERE workspace_id = NEW.workspace_id AND coalesce(config->'inventory'->>'commonProducts','true') = 'false') THEN
    NEW.store_id := public.pos_request_store(NEW.workspace_id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER products_assign_store BEFORE INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.products_assign_store();

CREATE OR REPLACE FUNCTION public.pos_list_stores() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ws uuid := public.current_workspace();
BEGIN
  IF ws IS NULL OR NOT public.pos_can('view_pos') THEN RAISE EXCEPTION 'No access'; END IF;
  PERFORM public.pos_default_store(ws);
  RETURN jsonb_build_object(
    'stores', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'kind',kind,'isDefault',is_default,'isActive',is_active) ORDER BY is_default DESC, name), '[]') FROM pos_stores WHERE workspace_id = ws),
    'commonProducts', coalesce((SELECT config->'inventory'->>'commonProducts' FROM pos_settings WHERE workspace_id = ws), 'true') <> 'false');
END $$;
GRANT EXECUTE ON FUNCTION public.pos_list_stores() TO authenticated;

CREATE OR REPLACE FUNCTION public.pos_save_store(_id uuid, _name text, _kind text, _active boolean) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ws uuid := public.current_workspace(); nm text := left(btrim(coalesce(_name,'')),80); sid uuid;
BEGIN
  IF NOT public.pos_can('settings') THEN RAISE EXCEPTION 'Store manage karne ki ijazat nahi'; END IF;
  IF nm = '' THEN RAISE EXCEPTION 'Store name likhein'; END IF;
  IF _kind NOT IN ('store','godown') THEN RAISE EXCEPTION 'bad kind'; END IF;
  IF _id IS NULL THEN
    INSERT INTO pos_stores(workspace_id, name, kind, is_active) VALUES (ws, nm, _kind, true) RETURNING id INTO sid;
  ELSE
    UPDATE pos_stores SET name = nm, kind = _kind, is_active = CASE WHEN is_default THEN true ELSE coalesce(_active, true) END
    WHERE id = _id AND workspace_id = ws RETURNING id INTO sid;
    IF sid IS NULL THEN RAISE EXCEPTION 'Store not found'; END IF;
  END IF;
  INSERT INTO audit_log(workspace_id, action, entity, entity_id, details, created_by) VALUES (ws, 'save', 'store', sid, jsonb_build_object('name',nm,'kind',_kind), auth.uid());
  RETURN sid;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Is naam ka store pehle se maujood hai';
END $$;
GRANT EXECUTE ON FUNCTION public.pos_save_store(uuid,text,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.pos_set_common_products(_on boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ws uuid := public.current_workspace();
BEGIN
  IF NOT public.pos_can('settings') THEN RAISE EXCEPTION 'Settings ki ijazat nahi'; END IF;
  INSERT INTO pos_settings(workspace_id, config) VALUES (ws, jsonb_build_object('inventory', jsonb_build_object('commonProducts', _on)))
  ON CONFLICT (workspace_id) DO UPDATE SET config = jsonb_set(coalesce(pos_settings.config,'{}'::jsonb), '{inventory}',
    coalesce(pos_settings.config->'inventory','{}'::jsonb) || jsonb_build_object('commonProducts', _on)), updated_at = now(), updated_by = auth.uid();
END $$;
GRANT EXECUTE ON FUNCTION public.pos_set_common_products(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.pos_transfer_stock(_from uuid, _to uuid, _items jsonb, _note text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ws uuid := public.current_workspace(); it jsonb; pid uuid; q numeric; have numeric; n int := 0; ref uuid := gen_random_uuid(); fn text; tn text;
BEGIN
  IF NOT public.pos_can('edit_stock') THEN RAISE EXCEPTION 'Stock transfer ki ijazat nahi'; END IF;
  IF _from = _to THEN RAISE EXCEPTION 'From aur To store alag hon'; END IF;
  SELECT name INTO fn FROM pos_stores WHERE id = _from AND workspace_id = ws AND is_active;
  SELECT name INTO tn FROM pos_stores WHERE id = _to AND workspace_id = ws AND is_active;
  IF fn IS NULL OR tn IS NULL THEN RAISE EXCEPTION 'Store not found'; END IF;
  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN RAISE EXCEPTION 'Items add karein'; END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    pid := (it->>'product_id')::uuid; q := (it->>'qty')::numeric;
    IF q IS NULL OR q <= 0 THEN RAISE EXCEPTION 'qty ghalat'; END IF;
    IF NOT EXISTS (SELECT 1 FROM products WHERE id = pid AND workspace_id = ws) THEN RAISE EXCEPTION 'product not found'; END IF;
    SELECT qty INTO have FROM pos_store_stock WHERE store_id = _from AND product_id = pid FOR UPDATE;
    IF coalesce(have,0) < q THEN RAISE EXCEPTION 'Stock kam hai: %', (SELECT name FROM products WHERE id = pid); END IF;
    UPDATE pos_store_stock SET qty = qty - q WHERE store_id = _from AND product_id = pid;
    INSERT INTO pos_store_stock(workspace_id, store_id, product_id, qty) VALUES (ws, _to, pid, q)
    ON CONFLICT (store_id, product_id) DO UPDATE SET qty = pos_store_stock.qty + EXCLUDED.qty;
    INSERT INTO stock_movements(workspace_id, product_id, kind, qty, ref_id, note, created_by, store_id) VALUES
      (ws, pid, 'transfer_out', -q, ref, left(coalesce(_note,'') || ' → ' || tn, 300), auth.uid(), _from),
      (ws, pid, 'transfer_in', q, ref, left(coalesce(_note,'') || ' ← ' || fn, 300), auth.uid(), _to);
    n := n + 1;
  END LOOP;
  INSERT INTO audit_log(workspace_id, action, entity, entity_id, details, created_by)
  VALUES (ws, 'transfer', 'stock', ref, jsonb_build_object('from',fn,'to',tn,'items',_items,'note',_note), auth.uid());
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.pos_transfer_stock(uuid,uuid,jsonb,text) TO authenticated;