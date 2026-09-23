CREATE OR REPLACE FUNCTION public.pos_update_product(_id uuid, _p jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ws uuid := public.current_workspace(); uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT public.is_active_team_member(uid) THEN RAISE EXCEPTION 'Access band hai'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = _id AND workspace_id = ws) THEN RAISE EXCEPTION 'product not found'; END IF;
  UPDATE public.products SET
    sku = nullif(trim(_p->>'sku'),''),
    barcode = nullif(trim(_p->>'barcode'),''),
    category = nullif(trim(_p->>'category'),''),
    brand = nullif(trim(_p->>'brand'),''),
    purchase_price = nullif(_p->>'purchase_price','')::numeric,
    wholesale_price = nullif(_p->>'wholesale_price','')::numeric,
    min_sale_price = nullif(_p->>'min_sale_price','')::numeric,
    min_stock = nullif(_p->>'min_stock','')::numeric,
    tax_percent = nullif(_p->>'tax_percent','')::numeric
  WHERE id = _id;
  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by)
  VALUES (ws, 'update', 'product', _id, _p, uid);
END $$;
REVOKE ALL ON FUNCTION public.pos_update_product(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_update_product(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.pos_adjust_stock(_id uuid, _qty numeric, _kind text, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ws uuid := public.current_workspace(); uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR NOT public.is_active_team_member(uid) THEN RAISE EXCEPTION 'Access band hai'; END IF;
  IF _kind NOT IN ('adjust_in','adjust_out','damage','opening') THEN RAISE EXCEPTION 'bad kind'; END IF;
  IF _qty IS NULL OR _qty <= 0 THEN RAISE EXCEPTION 'qty ghalat'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = _id AND workspace_id = ws) THEN RAISE EXCEPTION 'product not found'; END IF;
  PERFORM public.pos_move_stock(ws, _id, CASE WHEN _kind IN ('adjust_in','opening') THEN _qty ELSE -_qty END, _kind, NULL, _note);
  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by)
  VALUES (ws, _kind, 'stock', _id, jsonb_build_object('qty',_qty,'note',_note), uid);
END $$;
REVOKE ALL ON FUNCTION public.pos_adjust_stock(uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_adjust_stock(uuid, numeric, text, text) TO authenticated;

CREATE INDEX IF NOT EXISTS stock_movements_product_idx ON public.stock_movements(product_id, created_at);
CREATE INDEX IF NOT EXISTS pos_sales_ws_created_idx ON public.pos_sales(workspace_id, created_at);