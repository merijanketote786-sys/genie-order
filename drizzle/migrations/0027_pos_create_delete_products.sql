CREATE OR REPLACE FUNCTION public.pos_create_product(_p jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ws uuid := public.current_workspace(); nm text; nn text; pid uuid; st numeric;
BEGIN
  IF NOT public.pos_can('edit_products') THEN RAISE EXCEPTION 'Product add karne ki ijazat nahi'; END IF;
  nm := left(btrim(coalesce(_p->>'name','')), 200);
  IF nm = '' THEN RAISE EXCEPTION 'Product name likhein'; END IF;
  nn := lower(regexp_replace(nm, '\s+', ' ', 'g'));
  SELECT id INTO pid FROM products WHERE workspace_id = ws AND scope = 'pos' AND normalized_name = nn FOR UPDATE;
  IF pid IS NOT NULL AND EXISTS (SELECT 1 FROM products WHERE id = pid AND is_active) THEN RAISE EXCEPTION 'Is naam ka product pehle se maujood hai'; END IF;
  IF pid IS NULL THEN
    INSERT INTO products (workspace_id, scope, name, normalized_name, unit, sale_price, stock, is_active)
    VALUES (ws, 'pos', nm, nn, 'piece', 0, 0, true) RETURNING id INTO pid;
  END IF;
  UPDATE products SET name = nm, is_active = true,
    unit = coalesce(nullif(btrim(_p->>'unit'), ''), 'piece'),
    sku = nullif(btrim(_p->>'sku'), ''), barcode = nullif(btrim(_p->>'barcode'), ''),
    category = nullif(btrim(_p->>'category'), ''), brand = nullif(btrim(_p->>'brand'), ''),
    sale_price = round(greatest(coalesce(nullif(_p->>'sale_price','')::numeric, 0), 0), 2),
    purchase_price = round(nullif(_p->>'purchase_price','')::numeric, 2),
    wholesale_price = round(nullif(_p->>'wholesale_price','')::numeric, 2),
    min_stock = nullif(_p->>'min_stock','')::numeric,
    tax_percent = nullif(_p->>'tax_percent','')::numeric,
    updated_at = now()
  WHERE id = pid;
  st := coalesce(nullif(_p->>'stock','')::numeric, 0) - (SELECT stock FROM products WHERE id = pid);
  IF st <> 0 THEN PERFORM public.pos_move_stock(ws, pid, st, CASE WHEN st > 0 THEN 'opening' ELSE 'adjust_out' END, NULL, 'Naya item'); END IF;
  INSERT INTO audit_log (workspace_id, action, entity, entity_id, created_by) VALUES (ws, 'create', 'product', pid, auth.uid());
  RETURN pid;
END $$;

CREATE OR REPLACE FUNCTION public.pos_delete_products(_ids uuid[]) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ws uuid := public.current_workspace(); n integer;
BEGIN
  IF NOT public.pos_can('edit_products') THEN RAISE EXCEPTION 'Product delete karne ki ijazat nahi'; END IF;
  IF coalesce(array_length(_ids,1),0) > 2000 THEN RAISE EXCEPTION 'Zyada products'; END IF;
  UPDATE products SET is_active = false, updated_at = now() WHERE id = ANY(_ids) AND workspace_id = ws AND scope = 'pos' AND is_active;
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO audit_log (workspace_id, action, entity, details, created_by) VALUES (ws, 'delete', 'product', jsonb_build_object('ids', to_jsonb(_ids), 'count', n), auth.uid());
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.pos_create_product(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pos_delete_products(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_create_product(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_delete_products(uuid[]) TO authenticated;