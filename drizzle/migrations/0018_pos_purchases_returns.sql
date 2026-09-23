CREATE OR REPLACE FUNCTION public.pos_save_purchase(_p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ws uuid := public.current_workspace();
  uid uuid := auth.uid();
  dtype text := coalesce(_p->>'doc_type','purchase');
  sup uuid := nullif(_p->>'supplier_id','')::uuid;
  num text; pid uuid; it jsonb;
  gt numeric := coalesce((_p->>'grand_total')::numeric,0);
  paid numeric := least(coalesce((_p->>'paid')::numeric,0), gt);
  prod uuid; sign int;
BEGIN
  IF uid IS NULL OR ws IS NULL OR NOT public.is_active_team_member(uid) THEN RAISE EXCEPTION 'Access band hai'; END IF;
  IF dtype NOT IN ('purchase','return') THEN RAISE EXCEPTION 'bad doc_type'; END IF;
  IF sup IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = sup AND s.workspace_id = ws) THEN
    RAISE EXCEPTION 'supplier not found';
  END IF;
  num := CASE dtype WHEN 'purchase' THEN 'PUR-' ELSE 'PR-' END || lpad(nextval('public.purchase_seq')::text,5,'0');

  INSERT INTO public.purchases(workspace_id, doc_type, doc_number, payment_status, supplier_id, supplier_name, subtotal, discount_total, tax_total, grand_total, paid_total, balance, notes, ref_purchase_id, created_by)
  VALUES (ws, dtype, num, CASE WHEN paid >= gt THEN 'paid' WHEN paid > 0 THEN 'partial' ELSE 'credit' END, sup,
    coalesce((SELECT name FROM public.suppliers WHERE id = sup), nullif(_p->>'supplier_name',''), 'Cash purchase'),
    coalesce((_p->>'subtotal')::numeric,0), coalesce((_p->>'discount_total')::numeric,0), coalesce((_p->>'tax_total')::numeric,0),
    gt, paid, gt - paid, _p->>'notes', nullif(_p->>'ref_purchase_id','')::uuid, uid)
  RETURNING id INTO pid;

  sign := CASE dtype WHEN 'purchase' THEN 1 ELSE -1 END;
  FOR it IN SELECT * FROM jsonb_array_elements(coalesce(_p->'items','[]'::jsonb)) LOOP
    prod := nullif(it->>'product_id','')::uuid;
    IF prod IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.id = prod AND x.workspace_id = ws) THEN prod := NULL; END IF;
    INSERT INTO public.purchase_items(purchase_id, workspace_id, product_id, name, unit, qty, rate, discount, tax_percent, tax_amount, line_total, batch, expiry)
    VALUES (pid, ws, prod, it->>'name', it->>'unit', (it->>'qty')::numeric, (it->>'rate')::numeric, coalesce((it->>'discount')::numeric,0),
      coalesce((it->>'tax_percent')::numeric,0), coalesce((it->>'tax_amount')::numeric,0), (it->>'line_total')::numeric,
      nullif(it->>'batch',''), nullif(it->>'expiry','')::date);
    PERFORM public.pos_move_stock(ws, prod, sign * (it->>'qty')::numeric, CASE dtype WHEN 'purchase' THEN 'purchase' ELSE 'purchase_return' END, pid, num);
    IF dtype = 'purchase' AND prod IS NOT NULL AND (it->>'rate')::numeric > 0 THEN
      UPDATE public.products SET purchase_price = (it->>'rate')::numeric WHERE id = prod;
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
END $$;
REVOKE ALL ON FUNCTION public.pos_save_purchase(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_save_purchase(jsonb) TO authenticated;

-- Party payment: customer receipt ya supplier payment
CREATE OR REPLACE FUNCTION public.pos_party_payment(_kind text, _party uuid, _amount numeric, _method text, _note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ws uuid := public.current_workspace(); uid uuid := auth.uid(); pid uuid;
BEGIN
  IF uid IS NULL OR NOT public.is_active_team_member(uid) THEN RAISE EXCEPTION 'Access band hai'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Amount ghalat'; END IF;
  IF _kind = 'supplier_payment' THEN
    IF NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = _party AND workspace_id = ws) THEN RAISE EXCEPTION 'supplier not found'; END IF;
    INSERT INTO public.pos_payments(workspace_id, direction, method, amount, supplier_id, kind, note, created_by)
    VALUES (ws, 'out', _method, _amount, _party, 'supplier_payment', _note, uid) RETURNING id INTO pid;
  ELSIF _kind = 'receipt' THEN
    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = _party AND workspace_id = ws) THEN RAISE EXCEPTION 'customer not found'; END IF;
    INSERT INTO public.pos_payments(workspace_id, direction, method, amount, customer_id, kind, note, created_by)
    VALUES (ws, 'in', _method, _amount, _party, 'receipt', _note, uid) RETURNING id INTO pid;
  ELSE RAISE EXCEPTION 'bad kind'; END IF;
  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by)
  VALUES (ws, 'create', _kind, pid, jsonb_build_object('amount',_amount,'method',_method), uid);
  RETURN pid;
END $$;
REVOKE ALL ON FUNCTION public.pos_party_payment(text,uuid,numeric,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_party_payment(text,uuid,numeric,text,text) TO authenticated;
