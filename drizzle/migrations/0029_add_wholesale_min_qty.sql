ALTER TABLE public.products ADD COLUMN IF NOT EXISTS wholesale_min_qty numeric;

CREATE OR REPLACE FUNCTION public.pos_bulk_update_products(_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE ws uuid := public.current_workspace(); uid uuid := auth.uid(); r jsonb; pid uuid; cur record; nm text; target numeric; diff numeric; cnt int := 0;
BEGIN
  IF NOT public.pos_can('edit_products') THEN RAISE EXCEPTION 'Product edit permission required'; END IF;
  IF jsonb_typeof(_rows) <> 'array' OR jsonb_array_length(_rows) > 2000 THEN RAISE EXCEPTION 'Invalid rows'; END IF;
  FOR r IN SELECT * FROM jsonb_array_elements(_rows) LOOP
    pid := (r->>'id')::uuid;
    SELECT * INTO cur FROM public.products WHERE id = pid AND workspace_id = ws AND scope = 'pos' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
    nm := nullif(trim(coalesce(r->>'name','')),'');
    IF r ? 'name' AND nm IS NULL THEN RAISE EXCEPTION 'Product name khali nahi ho sakta'; END IF;
    UPDATE public.products SET
      name = CASE WHEN r ? 'name' THEN left(nm,200) ELSE name END,
      normalized_name = CASE WHEN r ? 'name' THEN lower(regexp_replace(nm,'\s+',' ','g')) ELSE normalized_name END,
      unit = CASE WHEN r ? 'unit' AND nullif(trim(r->>'unit'),'') IS NOT NULL THEN left(trim(r->>'unit'),20) ELSE unit END,
      sku = CASE WHEN r ? 'sku' THEN nullif(trim(r->>'sku'),'') ELSE sku END,
      barcode = CASE WHEN r ? 'barcode' THEN nullif(trim(r->>'barcode'),'') ELSE barcode END,
      category = CASE WHEN r ? 'category' THEN nullif(trim(r->>'category'),'') ELSE category END,
      brand = CASE WHEN r ? 'brand' THEN nullif(trim(r->>'brand'),'') ELSE brand END,
      sale_price = CASE WHEN r ? 'sale_price' AND nullif(r->>'sale_price','') IS NOT NULL THEN greatest(0, round((r->>'sale_price')::numeric,2)) ELSE sale_price END,
      purchase_price = CASE WHEN r ? 'purchase_price' THEN round(nullif(r->>'purchase_price','')::numeric,2) ELSE purchase_price END,
      wholesale_price = CASE WHEN r ? 'wholesale_price' THEN round(nullif(r->>'wholesale_price','')::numeric,2) ELSE wholesale_price END,
      wholesale_min_qty = CASE WHEN r ? 'wholesale_min_qty' THEN nullif(r->>'wholesale_min_qty','')::numeric ELSE wholesale_min_qty END,
      min_sale_price = CASE WHEN r ? 'min_sale_price' THEN round(nullif(r->>'min_sale_price','')::numeric,2) ELSE min_sale_price END,
      min_stock = CASE WHEN r ? 'min_stock' THEN nullif(r->>'min_stock','')::numeric ELSE min_stock END,
      tax_percent = CASE WHEN r ? 'tax_percent' THEN nullif(r->>'tax_percent','')::numeric ELSE tax_percent END,
      is_active = CASE WHEN r ? 'is_active' THEN (r->>'is_active')::boolean ELSE is_active END
    WHERE id = pid;
    IF r ? 'stock' AND nullif(r->>'stock','') IS NOT NULL THEN
      target := (r->>'stock')::numeric;
      diff := target - coalesce(cur.stock,0);
      IF diff <> 0 THEN
        IF NOT public.pos_can('edit_stock') THEN RAISE EXCEPTION 'Stock edit permission required'; END IF;
        PERFORM public.pos_move_stock(ws, pid, diff, CASE WHEN diff > 0 THEN 'adjust_in' ELSE 'adjust_out' END, NULL, 'Bulk update');
      END IF;
    END IF;
    cnt := cnt + 1;
  END LOOP;
  INSERT INTO public.audit_log(workspace_id, action, entity, details, created_by)
  VALUES (ws, 'bulk_update', 'product', jsonb_build_object('count', cnt), uid);
  RETURN jsonb_build_object('updated', cnt);
END $function$;

CREATE OR REPLACE FUNCTION public.pos_create_product(_p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    wholesale_min_qty = nullif(_p->>'wholesale_min_qty','')::numeric,
    min_stock = nullif(_p->>'min_stock','')::numeric,
    tax_percent = nullif(_p->>'tax_percent','')::numeric,
    updated_at = now()
  WHERE id = pid;
  st := coalesce(nullif(_p->>'stock','')::numeric, 0) - (SELECT stock FROM products WHERE id = pid);
  IF st <> 0 THEN PERFORM public.pos_move_stock(ws, pid, st, CASE WHEN st > 0 THEN 'opening' ELSE 'adjust_out' END, NULL, 'Naya item'); END IF;
  INSERT INTO audit_log (workspace_id, action, entity, entity_id, created_by) VALUES (ws, 'create', 'product', pid, auth.uid());
  RETURN pid;
END $function$;

CREATE OR REPLACE FUNCTION public.pos_update_product(_id uuid, _p jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE ws uuid := public.current_workspace(); uid uuid := auth.uid();
BEGIN
  IF NOT public.pos_can('edit_products') THEN RAISE EXCEPTION 'Product edit ki ijazat nahi'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = _id AND workspace_id = ws) THEN RAISE EXCEPTION 'product not found'; END IF;
  UPDATE public.products SET
    sku = nullif(trim(_p->>'sku'),''), barcode = nullif(trim(_p->>'barcode'),''), category = nullif(trim(_p->>'category'),''), brand = nullif(trim(_p->>'brand'),''),
    purchase_price = nullif(_p->>'purchase_price','')::numeric, wholesale_price = nullif(_p->>'wholesale_price','')::numeric,
    wholesale_min_qty = CASE WHEN _p ? 'wholesale_min_qty' THEN nullif(_p->>'wholesale_min_qty','')::numeric ELSE wholesale_min_qty END,
    min_sale_price = nullif(_p->>'min_sale_price','')::numeric, min_stock = nullif(_p->>'min_stock','')::numeric, tax_percent = nullif(_p->>'tax_percent','')::numeric,
    sale_price = CASE WHEN scope = 'pos' AND _p ? 'sale_price' AND nullif(_p->>'sale_price','') IS NOT NULL THEN greatest(0, (_p->>'sale_price')::numeric) ELSE sale_price END
  WHERE id = _id;
  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by) VALUES (ws, 'update', 'product', _id, _p, uid);
END $function$;