CREATE OR REPLACE FUNCTION public.pos_bulk_update_products(_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE ws uuid := public.current_workspace(); uid uuid := auth.uid(); r jsonb; pid uuid; cur record; nm text; target numeric; diff numeric; cnt int := 0; sid uuid; hdr text; cur_qty numeric;
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
      BEGIN hdr := current_setting('request.headers', true)::json->>'x-pos-store'; EXCEPTION WHEN others THEN hdr := NULL; END;
      IF hdr = 'all-stores' THEN RAISE EXCEPTION 'Select a specific store before changing stock'; END IF;
      sid := public.pos_request_store(ws);
      SELECT qty INTO cur_qty FROM public.pos_store_stock WHERE workspace_id = ws AND store_id = sid AND product_id = pid;
      diff := target - coalesce(cur_qty,0);
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