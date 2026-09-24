CREATE OR REPLACE FUNCTION public.pos_update_product(_id uuid, _p jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ws uuid := public.current_workspace(); uid uuid := auth.uid();
BEGIN
  IF NOT public.pos_can('edit_products') THEN RAISE EXCEPTION 'Product edit ki ijazat nahi'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = _id AND workspace_id = ws) THEN RAISE EXCEPTION 'product not found'; END IF;
  UPDATE public.products SET
    sku = nullif(trim(_p->>'sku'),''), barcode = nullif(trim(_p->>'barcode'),''), category = nullif(trim(_p->>'category'),''), brand = nullif(trim(_p->>'brand'),''),
    purchase_price = nullif(_p->>'purchase_price','')::numeric, wholesale_price = nullif(_p->>'wholesale_price','')::numeric,
    min_sale_price = nullif(_p->>'min_sale_price','')::numeric, min_stock = nullif(_p->>'min_stock','')::numeric, tax_percent = nullif(_p->>'tax_percent','')::numeric,
    sale_price = CASE WHEN scope = 'pos' AND _p ? 'sale_price' AND nullif(_p->>'sale_price','') IS NOT NULL THEN greatest(0, (_p->>'sale_price')::numeric) ELSE sale_price END
  WHERE id = _id;
  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by) VALUES (ws, 'update', 'product', _id, _p, uid);
END $$;