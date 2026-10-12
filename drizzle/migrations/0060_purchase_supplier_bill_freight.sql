ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS supplier_bill_no text, ADD COLUMN IF NOT EXISTS freight numeric NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION public.pos_save_purchase(_p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ws uuid := public.current_workspace();
  uid uuid := auth.uid();
  cfg jsonb;
  dtype text := coalesce(_p->>'doc_type','purchase');
  sup uuid := nullif(_p->>'supplier_id','')::uuid;
  cref uuid := nullif(_p->>'client_ref','')::uuid;
  num text; pid uuid; it jsonb; ex record;
  gt numeric := round(coalesce((_p->>'grand_total')::numeric,0),2);
  paid numeric := round(least(greatest(coalesce((_p->>'paid')::numeric,0),0), gt),2);
  prod uuid; sign int;
BEGIN
  IF uid IS NULL OR ws IS NULL OR NOT public.is_active_team_member(uid) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF NOT public.pos_can('manage_purchases') THEN RAISE EXCEPTION 'Purchase permission required'; END IF;
  IF dtype NOT IN ('purchase','return') THEN RAISE EXCEPTION 'Invalid document type'; END IF;
  SELECT config INTO cfg FROM public.pos_settings WHERE workspace_id = ws;
  cfg := coalesce(cfg,'{}'::jsonb);
  IF cref IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(ws::text || cref::text));
    SELECT id, doc_number INTO ex FROM public.purchases WHERE workspace_id = ws AND client_ref = cref;
    IF FOUND THEN RETURN jsonb_build_object('id', ex.id, 'number', ex.doc_number, 'duplicate', true); END IF;
  END IF;
  IF sup IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = sup AND s.workspace_id = ws) THEN
    RAISE EXCEPTION 'Supplier not found';
  END IF;
  num := CASE dtype WHEN 'purchase' THEN public.pos_cfg_prefix(cfg,'purchasePrefix','PUR-') ELSE public.pos_cfg_prefix(cfg,'purchaseReturnPrefix','PR-') END
         || lpad(nextval('public.purchase_seq')::text,5,'0');

  INSERT INTO public.purchases(workspace_id, doc_type, doc_number, payment_status, supplier_id, supplier_name, subtotal, discount_total, tax_total, grand_total, paid_total, balance, notes, ref_purchase_id, created_by, client_ref, supplier_bill_no, freight)
  VALUES (ws, dtype, num, CASE WHEN paid >= gt THEN 'paid' WHEN paid > 0 THEN 'partial' ELSE 'credit' END, sup,
    coalesce((SELECT name FROM public.suppliers WHERE id = sup), nullif(_p->>'supplier_name',''), 'Cash purchase'),
    round(coalesce((_p->>'subtotal')::numeric,0),2), round(coalesce((_p->>'discount_total')::numeric,0),2), round(coalesce((_p->>'tax_total')::numeric,0),2),
    gt, paid, gt - paid, _p->>'notes', nullif(_p->>'ref_purchase_id','')::uuid, uid, cref,
    nullif(left(coalesce(_p->>'supplier_bill_no',''),60),''), round(greatest(coalesce((_p->>'freight')::numeric,0),0),2))
  RETURNING id INTO pid;

  sign := CASE dtype WHEN 'purchase' THEN 1 ELSE -1 END;
  FOR it IN SELECT * FROM jsonb_array_elements(coalesce(_p->'items','[]'::jsonb)) LOOP
    prod := nullif(it->>'product_id','')::uuid;
    IF prod IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.id = prod AND x.workspace_id = ws) THEN prod := NULL; END IF;
    INSERT INTO public.purchase_items(purchase_id, workspace_id, product_id, name, unit, qty, rate, discount, tax_percent, tax_amount, line_total, batch, expiry)
    VALUES (pid, ws, prod, it->>'name', it->>'unit', (it->>'qty')::numeric, round((it->>'rate')::numeric,2), round(coalesce((it->>'discount')::numeric,0),2),
      coalesce((it->>'tax_percent')::numeric,0), round(coalesce((it->>'tax_amount')::numeric,0),2), round((it->>'line_total')::numeric,2),
      nullif(it->>'batch',''), nullif(it->>'expiry','')::date);
    IF coalesce(cfg->'inventory'->>'trackStock','true') <> 'false' THEN
      PERFORM public.pos_move_stock(ws, prod, sign * (it->>'qty')::numeric, CASE dtype WHEN 'purchase' THEN 'purchase' ELSE 'purchase_return' END, pid, num);
    END IF;
    IF dtype = 'purchase' AND prod IS NOT NULL AND (it->>'rate')::numeric > 0 THEN
      UPDATE public.products SET purchase_price = round((it->>'rate')::numeric,2) WHERE id = prod;
    END IF;
  END LOOP;

  IF paid > 0 THEN
    INSERT INTO public.pos_payments(workspace_id, direction, method, amount, supplier_id, purchase_id, kind, created_by)
    VALUES (ws, CASE dtype WHEN 'purchase' THEN 'out' ELSE 'in' END, coalesce(_p->>'method','Cash'), paid, sup, pid,
      CASE dtype WHEN 'purchase' THEN 'purchase' ELSE 'purchase_refund' END, uid);
  END IF;

  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by)
  VALUES (ws, 'create', 'purchase_' || dtype, pid, jsonb_build_object('number',num,'total',gt), uid);
  RETURN jsonb_build_object('id', pid, 'number', num);
END $function$;