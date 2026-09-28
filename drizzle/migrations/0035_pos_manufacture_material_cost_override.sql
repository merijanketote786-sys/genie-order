CREATE OR REPLACE FUNCTION public.pos_manufacture(_product uuid, _qty numeric, _note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE ws uuid := public.current_workspace(); r pos_recipes; f numeric; m jsonb; need numeric; have numeric; sid uuid;
  mat_cost numeric := 0; exp_cost numeric := 0; ref uuid := gen_random_uuid(); pname text; mname text;
BEGIN
  IF ws IS NULL OR NOT public.pos_can('edit_stock') THEN RAISE EXCEPTION 'No permission to change stock'; END IF;
  IF _qty IS NULL OR _qty <= 0 THEN RAISE EXCEPTION 'Enter a quantity to manufacture'; END IF;
  SELECT * INTO r FROM pos_recipes WHERE workspace_id = ws AND product_id = _product;
  IF NOT FOUND THEN RAISE EXCEPTION 'No manufacturing setup for this product — set it in Item Manufacturing'; END IF;
  IF jsonb_array_length(r.materials) = 0 THEN RAISE EXCEPTION 'Add raw materials in Item Manufacturing first'; END IF;
  SELECT name INTO pname FROM products WHERE id = _product;
  f := _qty / r.output_qty;
  sid := public.pos_request_store(ws);
  FOR m IN SELECT * FROM jsonb_array_elements(r.materials) LOOP
    need := round((m->>'qty')::numeric * f, 4);
    SELECT coalesce(s.qty,0), p.name INTO have, mname FROM products p LEFT JOIN pos_store_stock s ON s.product_id = p.id AND s.store_id = sid WHERE p.id = (m->>'product_id')::uuid AND p.workspace_id = ws;
    IF mname IS NULL THEN RAISE EXCEPTION 'A raw material no longer exists'; END IF;
    IF coalesce(have,0) < need THEN RAISE EXCEPTION 'Not enough stock of % (need %, have %)', mname, need, coalesce(have,0); END IF;
    mat_cost := mat_cost + need * coalesce(nullif(m->>'cost','')::numeric, (SELECT purchase_price FROM products WHERE id = (m->>'product_id')::uuid), 0);
    PERFORM public.pos_move_stock(ws, (m->>'product_id')::uuid, -need, 'manufacture_out', ref, 'Used for ' || pname);
  END LOOP;
  SELECT coalesce(sum(coalesce((e->>'amount')::numeric,0)),0) * f INTO exp_cost FROM jsonb_array_elements(r.expenses) e;
  PERFORM public.pos_move_stock(ws, _product, _qty, 'manufacture_in', ref, coalesce(nullif(_note,''),'Manufactured'));
  UPDATE products SET purchase_price = round((mat_cost + exp_cost) / _qty, 2) WHERE id = _product;
  INSERT INTO audit_log(workspace_id, action, entity, entity_id, details, created_by)
  VALUES (ws, 'manufacture', 'product', _product, jsonb_build_object('qty',_qty,'material_cost',mat_cost,'expenses',exp_cost,'ref',ref), auth.uid());
  RETURN jsonb_build_object('qty',_qty,'materialCost',round(mat_cost,2),'expenses',round(exp_cost,2),'unitCost',round((mat_cost+exp_cost)/_qty,2));
END $function$;