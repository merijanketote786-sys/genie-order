CREATE TABLE public.pos_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  output_qty numeric NOT NULL DEFAULT 1,
  materials jsonb NOT NULL DEFAULT '[]',
  expenses jsonb NOT NULL DEFAULT '[]',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, product_id)
);
GRANT SELECT ON public.pos_recipes TO authenticated;
GRANT ALL ON public.pos_recipes TO service_role;
ALTER TABLE public.pos_recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws members read recipes" ON public.pos_recipes FOR SELECT TO authenticated USING (workspace_id = public.current_workspace());

CREATE OR REPLACE FUNCTION public.pos_save_recipe(_p jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ws uuid := public.current_workspace(); pid uuid := (_p->>'product_id')::uuid; oq numeric := coalesce((_p->>'output_qty')::numeric,0); rid uuid; m jsonb;
BEGIN
  IF ws IS NULL OR NOT public.pos_can('edit_products') THEN RAISE EXCEPTION 'No permission to edit manufacturing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM products WHERE id = pid AND workspace_id = ws) THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF oq <= 0 THEN RAISE EXCEPTION 'Output quantity must be greater than 0'; END IF;
  FOR m IN SELECT * FROM jsonb_array_elements(coalesce(_p->'materials','[]')) LOOP
    IF (m->>'product_id')::uuid = pid THEN RAISE EXCEPTION 'A product cannot use itself as raw material'; END IF;
    IF NOT EXISTS (SELECT 1 FROM products WHERE id = (m->>'product_id')::uuid AND workspace_id = ws) THEN RAISE EXCEPTION 'Raw material not found'; END IF;
    IF coalesce((m->>'qty')::numeric,0) <= 0 THEN RAISE EXCEPTION 'Raw material quantity must be greater than 0'; END IF;
  END LOOP;
  INSERT INTO pos_recipes(workspace_id, product_id, output_qty, materials, expenses, updated_by, updated_at)
  VALUES (ws, pid, oq, coalesce(_p->'materials','[]'), coalesce(_p->'expenses','[]'), auth.uid(), now())
  ON CONFLICT (workspace_id, product_id) DO UPDATE SET output_qty = EXCLUDED.output_qty, materials = EXCLUDED.materials, expenses = EXCLUDED.expenses, updated_by = EXCLUDED.updated_by, updated_at = now()
  RETURNING id INTO rid;
  INSERT INTO audit_log(workspace_id, action, entity, entity_id, details, created_by) VALUES (ws, 'update', 'recipe', pid, _p, auth.uid());
  RETURN rid;
END $$;
REVOKE ALL ON FUNCTION public.pos_save_recipe(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_save_recipe(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.pos_delete_recipe(_product uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ws uuid := public.current_workspace();
BEGIN
  IF ws IS NULL OR NOT public.pos_can('edit_products') THEN RAISE EXCEPTION 'No permission to edit manufacturing'; END IF;
  DELETE FROM pos_recipes WHERE workspace_id = ws AND product_id = _product;
END $$;
REVOKE ALL ON FUNCTION public.pos_delete_recipe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_delete_recipe(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.pos_manufacture(_product uuid, _qty numeric, _note text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
    mat_cost := mat_cost + need * coalesce((SELECT purchase_price FROM products WHERE id = (m->>'product_id')::uuid),0);
    PERFORM public.pos_move_stock(ws, (m->>'product_id')::uuid, -need, 'manufacture_out', ref, 'Used for ' || pname);
  END LOOP;
  SELECT coalesce(sum(coalesce((e->>'amount')::numeric,0)),0) * f INTO exp_cost FROM jsonb_array_elements(r.expenses) e;
  PERFORM public.pos_move_stock(ws, _product, _qty, 'manufacture_in', ref, coalesce(nullif(_note,''),'Manufactured'));
  UPDATE products SET purchase_price = round((mat_cost + exp_cost) / _qty, 2) WHERE id = _product;
  INSERT INTO audit_log(workspace_id, action, entity, entity_id, details, created_by)
  VALUES (ws, 'manufacture', 'product', _product, jsonb_build_object('qty',_qty,'material_cost',mat_cost,'expenses',exp_cost,'ref',ref), auth.uid());
  RETURN jsonb_build_object('qty',_qty,'materialCost',round(mat_cost,2),'expenses',round(exp_cost,2),'unitCost',round((mat_cost+exp_cost)/_qty,2));
END $$;
REVOKE ALL ON FUNCTION public.pos_manufacture(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_manufacture(uuid, numeric, text) TO authenticated;