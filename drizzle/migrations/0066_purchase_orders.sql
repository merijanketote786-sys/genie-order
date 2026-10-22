ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS ref_order_id uuid REFERENCES public.purchases(id);

-- Orders must never post accounting journals (the ELSE branch would treat them
-- as purchase returns). Guard added to the existing purchase branch.
CREATE OR REPLACE FUNCTION public.acc_post_source(_type text, _id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s record; ws uuid; active boolean; jid uuid; d date; money uuid; net numeric; lines jsonb;
BEGIN
  IF _type = 'sale' THEN
    SELECT * INTO s FROM public.pos_sales WHERE id = _id;
    IF s IS NULL OR s.doc_type NOT IN ('sale','return') THEN RETURN; END IF;
    ws := s.workspace_id; active := s.status <> 'cancelled';
  ELSIF _type = 'payment' THEN
    SELECT * INTO s FROM public.pos_payments WHERE id = _id;
    IF s IS NULL THEN RETURN; END IF;
    ws := s.workspace_id; active := s.status = 'completed';
  ELSIF _type = 'purchase' THEN
    SELECT * INTO s FROM public.purchases WHERE id = _id;
    IF s IS NULL THEN RETURN; END IF;
    IF s.doc_type = 'order' THEN RETURN; END IF;
    ws := s.workspace_id; active := s.status <> 'cancelled';
  ELSIF _type = 'expense' THEN
    SELECT * INTO s FROM public.expenses WHERE id = _id;
    IF s IS NULL THEN RETURN; END IF;
    ws := s.workspace_id; active := s.status = 'completed';
  ELSE RETURN; END IF;

  PERFORM public.acc_ensure_accounts(ws);
  SELECT id INTO jid FROM public.acc_journals WHERE workspace_id = ws AND source_type = _type AND source_id = _id;

  IF NOT active THEN
    IF jid IS NOT NULL THEN PERFORM public.acc_reverse_core(jid, (now() AT TIME ZONE 'Asia/Karachi')::date, 'Auto reversal (cancelled)'); END IF;
    RETURN;
  END IF;
  IF jid IS NOT NULL THEN RETURN; END IF;

  d := (s.created_at AT TIME ZONE 'Asia/Karachi')::date;
  IF _type = 'sale' THEN
    net := s.grand_total - s.tax_total;
    IF s.doc_type = 'sale' THEN
      lines := jsonb_build_array(
        jsonb_build_object('a', public.acc_sys(ws,'ar'), 'd', s.grand_total, 'm', 'Invoice'),
        jsonb_build_object('a', public.acc_sys(ws,'sales'), 'c', net),
        jsonb_build_object('a', public.acc_sys(ws,'tax'), 'c', s.tax_total),
        jsonb_build_object('a', public.acc_sys(ws,'cogs'), 'd', s.cost_total),
        jsonb_build_object('a', public.acc_sys(ws,'inventory'), 'c', s.cost_total));
    ELSE
      lines := jsonb_build_array(
        jsonb_build_object('a', public.acc_sys(ws,'sales_returns'), 'd', net),
        jsonb_build_object('a', public.acc_sys(ws,'tax'), 'd', s.tax_total),
        jsonb_build_object('a', public.acc_sys(ws,'ar'), 'c', s.grand_total, 'm', 'Return'),
        jsonb_build_object('a', public.acc_sys(ws,'inventory'), 'd', s.cost_total),
        jsonb_build_object('a', public.acc_sys(ws,'cogs'), 'c', s.cost_total));
    END IF;
    PERFORM public.acc_make_journal(ws, d, s.doc_number, CASE s.doc_type WHEN 'sale' THEN 'Sale' ELSE 'Sales return' END || ' - ' || coalesce(s.customer_name,''), 'sale', _id, lines);
  ELSIF _type = 'purchase' THEN
    IF s.doc_type = 'purchase' THEN
      lines := jsonb_build_array(jsonb_build_object('a', public.acc_sys(ws,'inventory'), 'd', s.grand_total), jsonb_build_object('a', public.acc_sys(ws,'ap'), 'c', s.grand_total));
    ELSE
      lines := jsonb_build_array(jsonb_build_object('a', public.acc_sys(ws,'ap'), 'd', s.grand_total), jsonb_build_object('a', public.acc_sys(ws,'inventory'), 'c', s.grand_total));
    END IF;
    PERFORM public.acc_make_journal(ws, d, s.doc_number, CASE s.doc_type WHEN 'purchase' THEN 'Purchase' ELSE 'Purchase return' END || ' - ' || coalesce(s.supplier_name,''), 'purchase', _id, lines);
  ELSIF _type = 'payment' THEN
    money := public.acc_sys(ws, CASE WHEN s.method = 'Cash' THEN 'cash' ELSE 'bank' END);
    IF s.kind IN ('sale','receipt') OR (s.direction = 'in' AND s.customer_id IS NOT NULL AND s.supplier_id IS NULL AND s.kind NOT IN ('purchase_refund')) THEN
      lines := jsonb_build_array(jsonb_build_object('a', money, 'd', s.amount), jsonb_build_object('a', public.acc_sys(ws,'ar'), 'c', s.amount));
    ELSIF s.kind = 'refund' THEN
      lines := jsonb_build_array(jsonb_build_object('a', public.acc_sys(ws,'ar'), 'd', s.amount), jsonb_build_object('a', money, 'c', s.amount));
    ELSIF s.kind IN ('purchase','supplier_payment') THEN
      lines := jsonb_build_array(jsonb_build_object('a', public.acc_sys(ws,'ap'), 'd', s.amount), jsonb_build_object('a', money, 'c', s.amount));
    ELSIF s.kind = 'purchase_refund' THEN
      lines := jsonb_build_array(jsonb_build_object('a', money, 'd', s.amount), jsonb_build_object('a', public.acc_sys(ws,'ap'), 'c', s.amount));
    ELSE RETURN; END IF;
    PERFORM public.acc_make_journal(ws, d, left(s.kind || ' ' || s.method, 120), coalesce(s.note, initcap(replace(s.kind,'_',' '))), 'payment', _id, lines);
  ELSIF _type = 'expense' THEN
    money := public.acc_sys(ws, CASE WHEN s.method = 'Cash' THEN 'cash' ELSE 'bank' END);
    lines := jsonb_build_array(jsonb_build_object('a', public.acc_expense_account(ws, s.category), 'd', s.amount), jsonb_build_object('a', money, 'c', s.amount));
    PERFORM public.acc_make_journal(ws, s.expense_date, 'EXP ' || s.category, coalesce(s.description, s.category), 'expense', _id, lines);
  END IF;
END $$;

-- Save a purchase order: party + items, rate optional. No stock, no payment,
-- no purchase-price update, no accounting. Status stays 'open'.
CREATE OR REPLACE FUNCTION public.pos_save_purchase_order(_p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ws uuid := public.current_workspace();
  uid uuid := auth.uid();
  cfg jsonb;
  sup uuid := nullif(_p->>'supplier_id','')::uuid;
  cref uuid := nullif(_p->>'client_ref','')::uuid;
  num text; pid uuid; it jsonb; ex record;
  gt numeric := round(coalesce((_p->>'grand_total')::numeric,0),2);
  prod uuid;
BEGIN
  IF uid IS NULL OR ws IS NULL OR NOT public.is_active_team_member(uid) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF NOT public.pos_can('manage_purchases') THEN RAISE EXCEPTION 'Purchase permission required'; END IF;
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
  num := public.pos_cfg_prefix(cfg,'purchaseOrderPrefix','PO-') || lpad(nextval('public.purchase_seq')::text,5,'0');

  INSERT INTO public.purchases(workspace_id, doc_type, doc_number, status, payment_status, supplier_id, supplier_name, subtotal, discount_total, tax_total, grand_total, paid_total, balance, notes, created_by, client_ref, supplier_bill_no, freight)
  VALUES (ws, 'order', num, 'open', 'pending', sup,
    coalesce((SELECT name FROM public.suppliers WHERE id = sup), nullif(_p->>'supplier_name',''), 'Cash purchase'),
    round(coalesce((_p->>'subtotal')::numeric,0),2), round(coalesce((_p->>'discount_total')::numeric,0),2), round(coalesce((_p->>'tax_total')::numeric,0),2),
    gt, 0, 0, _p->>'notes', uid, cref,
    nullif(left(coalesce(_p->>'supplier_bill_no',''),60),''), round(greatest(coalesce((_p->>'freight')::numeric,0),0),2))
  RETURNING id INTO pid;

  FOR it IN SELECT * FROM jsonb_array_elements(coalesce(_p->'items','[]'::jsonb)) LOOP
    prod := nullif(it->>'product_id','')::uuid;
    IF prod IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.id = prod AND x.workspace_id = ws) THEN prod := NULL; END IF;
    INSERT INTO public.purchase_items(purchase_id, workspace_id, product_id, name, unit, qty, rate, discount, tax_percent, tax_amount, line_total, batch, expiry)
    VALUES (pid, ws, prod, it->>'name', it->>'unit', (it->>'qty')::numeric, round(coalesce((it->>'rate')::numeric,0),2), round(coalesce((it->>'discount')::numeric,0),2),
      coalesce((it->>'tax_percent')::numeric,0), round(coalesce((it->>'tax_amount')::numeric,0),2), round(coalesce((it->>'line_total')::numeric,0),2),
      nullif(it->>'batch',''), nullif(it->>'expiry','')::date);
  END LOOP;

  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by)
  VALUES (ws, 'create', 'purchase_order', pid, jsonb_build_object('number',num,'total',gt), uid);
  RETURN jsonb_build_object('id', pid, 'number', num);
END $function$;

-- Convert an open order into a real purchase. Editable fields (rates, paid,
-- discount, freight, bill no, notes) come in with the payload; stock moves,
-- payment posting, price update and accounting all happen here, exactly like a
-- normal purchase. The order is locked and marked 'converted' atomically.
CREATE OR REPLACE FUNCTION public.pos_convert_purchase_order(_p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ws uuid := public.current_workspace();
  uid uuid := auth.uid();
  cfg jsonb; ord record;
  oid uuid := nullif(_p->>'order_id','')::uuid;
  sup uuid; num text; pid uuid; it jsonb;
  gt numeric := round(coalesce((_p->>'grand_total')::numeric,0),2);
  paid numeric := round(least(greatest(coalesce((_p->>'paid')::numeric,0),0), gt),2);
  prod uuid;
BEGIN
  IF uid IS NULL OR ws IS NULL OR NOT public.is_active_team_member(uid) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF NOT public.pos_can('manage_purchases') THEN RAISE EXCEPTION 'Purchase permission required'; END IF;
  IF oid IS NULL THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
  SELECT * INTO ord FROM public.purchases WHERE id = oid AND workspace_id = ws FOR UPDATE;
  IF ord IS NULL OR ord.doc_type <> 'order' THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
  IF ord.status <> 'open' THEN RAISE EXCEPTION 'This order is already %', ord.status; END IF;
  sup := coalesce(nullif(_p->>'supplier_id','')::uuid, ord.supplier_id);
  SELECT config INTO cfg FROM public.pos_settings WHERE workspace_id = ws;
  cfg := coalesce(cfg,'{}'::jsonb);
  IF sup IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = sup AND s.workspace_id = ws) THEN
    RAISE EXCEPTION 'Supplier not found';
  END IF;
  num := public.pos_cfg_prefix(cfg,'purchasePrefix','PUR-') || lpad(nextval('public.purchase_seq')::text,5,'0');

  INSERT INTO public.purchases(workspace_id, doc_type, doc_number, payment_status, supplier_id, supplier_name, subtotal, discount_total, tax_total, grand_total, paid_total, balance, notes, ref_order_id, created_by, supplier_bill_no, freight)
  VALUES (ws, 'purchase', num, CASE WHEN paid >= gt THEN 'paid' WHEN paid > 0 THEN 'partial' ELSE 'credit' END, sup,
    coalesce((SELECT name FROM public.suppliers WHERE id = sup), ord.supplier_name, 'Cash purchase'),
    round(coalesce((_p->>'subtotal')::numeric,0),2), round(coalesce((_p->>'discount_total')::numeric,0),2), round(coalesce((_p->>'tax_total')::numeric,0),2),
    gt, paid, gt - paid, coalesce(nullif(_p->>'notes',''), ord.notes), oid, uid,
    nullif(left(coalesce(_p->>'supplier_bill_no',''),60),''), round(greatest(coalesce((_p->>'freight')::numeric,0),0),2))
  RETURNING id INTO pid;

  FOR it IN SELECT * FROM jsonb_array_elements(coalesce(_p->'items','[]'::jsonb)) LOOP
    prod := nullif(it->>'product_id','')::uuid;
    IF prod IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.id = prod AND x.workspace_id = ws) THEN prod := NULL; END IF;
    INSERT INTO public.purchase_items(purchase_id, workspace_id, product_id, name, unit, qty, rate, discount, tax_percent, tax_amount, line_total, batch, expiry)
    VALUES (pid, ws, prod, it->>'name', it->>'unit', (it->>'qty')::numeric, round(coalesce((it->>'rate')::numeric,0),2), round(coalesce((it->>'discount')::numeric,0),2),
      coalesce((it->>'tax_percent')::numeric,0), round(coalesce((it->>'tax_amount')::numeric,0),2), round(coalesce((it->>'line_total')::numeric,0),2),
      nullif(it->>'batch',''), nullif(it->>'expiry','')::date);
    IF coalesce(cfg->'inventory'->>'trackStock','true') <> 'false' THEN
      PERFORM public.pos_move_stock(ws, prod, (it->>'qty')::numeric, 'purchase', pid, num);
    END IF;
    IF prod IS NOT NULL AND (it->>'rate')::numeric > 0 THEN
      UPDATE public.products SET purchase_price = round((it->>'rate')::numeric,2) WHERE id = prod;
    END IF;
  END LOOP;

  IF paid > 0 THEN
    INSERT INTO public.pos_payments(workspace_id, direction, method, amount, supplier_id, purchase_id, kind, created_by)
    VALUES (ws, 'out', coalesce(_p->>'method','Cash'), paid, sup, pid, 'purchase', uid);
  END IF;

  UPDATE public.purchases SET status = 'converted', updated_at = now() WHERE id = oid;

  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by)
  VALUES (ws, 'create', 'purchase', pid, jsonb_build_object('number',num,'total',gt,'order',ord.doc_number), uid);
  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by)
  VALUES (ws, 'convert', 'purchase_order', oid, jsonb_build_object('number',ord.doc_number,'purchase',num), uid);
  RETURN jsonb_build_object('id', pid, 'number', num);
END $function$;

-- Cancel an open order: no stock, no payments, no accounting — just a status
-- change. Converted orders cannot be cancelled (cancel the purchase instead).
CREATE OR REPLACE FUNCTION public.pos_cancel_purchase_order(_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ws uuid := public.current_workspace(); p record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_team_member(auth.uid()) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF NOT public.pos_can('manage_purchases') THEN RAISE EXCEPTION 'Purchase permission required'; END IF;
  SELECT * INTO p FROM public.purchases WHERE id = _id AND workspace_id = ws FOR UPDATE;
  IF p IS NULL OR p.doc_type <> 'order' THEN RAISE EXCEPTION 'Purchase order not found'; END IF;
  IF p.status = 'converted' THEN RAISE EXCEPTION 'This order was converted to a purchase — cancel the purchase instead'; END IF;
  IF p.status = 'cancelled' THEN RAISE EXCEPTION 'Purchase order already cancelled'; END IF;
  UPDATE public.purchases SET status = 'cancelled', updated_at = now() WHERE id = _id;
  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by)
  VALUES (ws, 'cancel', 'purchase_order', _id, jsonb_build_object('reason', _reason, 'number', p.doc_number), auth.uid());
END $$;

REVOKE ALL ON FUNCTION public.pos_save_purchase_order(jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION public.pos_convert_purchase_order(jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION public.pos_cancel_purchase_order(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pos_save_purchase_order(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_convert_purchase_order(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_cancel_purchase_order(uuid, text) TO authenticated;