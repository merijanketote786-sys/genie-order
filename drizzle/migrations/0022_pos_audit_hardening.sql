-- Idempotency keys
ALTER TABLE public.pos_sales ADD COLUMN IF NOT EXISTS client_ref uuid;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS client_ref uuid;
ALTER TABLE public.pos_payments ADD COLUMN IF NOT EXISTS client_ref uuid;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS client_ref uuid;
CREATE UNIQUE INDEX IF NOT EXISTS pos_sales_client_ref_uq ON public.pos_sales(workspace_id, client_ref) WHERE client_ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS purchases_client_ref_uq ON public.purchases(workspace_id, client_ref) WHERE client_ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pos_payments_client_ref_uq ON public.pos_payments(workspace_id, client_ref) WHERE client_ref IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS expenses_client_ref_uq ON public.expenses(workspace_id, client_ref) WHERE client_ref IS NOT NULL;

-- Unique document numbers
CREATE UNIQUE INDEX IF NOT EXISTS pos_sales_doc_number_uq ON public.pos_sales(workspace_id, doc_type, doc_number);
CREATE UNIQUE INDEX IF NOT EXISTS purchases_doc_number_uq ON public.purchases(workspace_id, doc_number);

-- Missing indexes (ledgers, returns, reports, barcode lookup)
CREATE INDEX IF NOT EXISTS pos_payments_customer_idx ON public.pos_payments(customer_id) WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pos_payments_supplier_idx ON public.pos_payments(supplier_id) WHERE supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pos_payments_sale_idx ON public.pos_payments(sale_id) WHERE sale_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pos_payments_purchase_idx ON public.pos_payments(purchase_id) WHERE purchase_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pos_sale_items_product_idx ON public.pos_sale_items(product_id);
CREATE INDEX IF NOT EXISTS pos_sales_ref_sale_idx ON public.pos_sales(ref_sale_id) WHERE ref_sale_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pos_sales_ws_type_idx ON public.pos_sales(workspace_id, doc_type, created_at DESC);
CREATE INDEX IF NOT EXISTS purchase_items_purchase_idx ON public.purchase_items(purchase_id);
CREATE INDEX IF NOT EXISTS purchases_ws_created_idx ON public.purchases(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS purchases_supplier_idx ON public.purchases(supplier_id);
CREATE INDEX IF NOT EXISTS expenses_ws_date_idx ON public.expenses(workspace_id, expense_date);
CREATE INDEX IF NOT EXISTS products_ws_barcode_idx ON public.products(workspace_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_ws_sku_idx ON public.products(workspace_id, sku) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS stock_movements_ref_idx ON public.stock_movements(ref_id) WHERE ref_id IS NOT NULL;

-- Financial rows may only be written through the audited transaction functions
DROP POLICY IF EXISTS "ws insert pos_sales" ON public.pos_sales;
DROP POLICY IF EXISTS "ws update pos_sales" ON public.pos_sales;
DROP POLICY IF EXISTS "ws insert pos_sale_items" ON public.pos_sale_items;
DROP POLICY IF EXISTS "ws update pos_sale_items" ON public.pos_sale_items;
DROP POLICY IF EXISTS "ws insert pos_payments" ON public.pos_payments;
DROP POLICY IF EXISTS "ws update pos_payments" ON public.pos_payments;
DROP POLICY IF EXISTS "ws insert purchases" ON public.purchases;
DROP POLICY IF EXISTS "ws update purchases" ON public.purchases;
DROP POLICY IF EXISTS "ws insert purchase_items" ON public.purchase_items;
DROP POLICY IF EXISTS "ws update purchase_items" ON public.purchase_items;

-- Close a held bill / quotation
CREATE OR REPLACE FUNCTION public.pos_close_doc(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_team_member(auth.uid()) THEN RAISE EXCEPTION 'Access denied'; END IF;
  UPDATE public.pos_sales SET status = 'converted', updated_at = now()
  WHERE id = _id AND workspace_id = public.current_workspace() AND doc_type IN ('held','quotation') AND status <> 'cancelled';
END $$;
REVOKE ALL ON FUNCTION public.pos_close_doc(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_close_doc(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.pos_save_sale(_p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  ws uuid := public.current_workspace();
  uid uuid := auth.uid();
  dtype text := coalesce(_p->>'doc_type','sale');
  cref uuid := nullif(_p->>'client_ref','')::uuid;
  num text; sid uuid; ex record;
  cust uuid := nullif(_p->>'customer_id','')::uuid;
  v_phone text := nullif(regexp_replace(coalesce(_p->>'customer_phone',''),'\D','','g'),'');
  it jsonb; pay jsonb; pass int; amt numeric; remaining numeric;
  cost_sum numeric := 0; c numeric; prod uuid; pr record;
  gt numeric := round(coalesce((_p->>'grand_total')::numeric,0),2);
  paid_raw numeric := 0; paid numeric;
  pstatus text; inv uuid; sign int; refs record; sold numeric; back numeric;
BEGIN
  IF uid IS NULL OR ws IS NULL OR NOT public.is_active_team_member(uid) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF dtype NOT IN ('sale','quotation','held','return') THEN RAISE EXCEPTION 'Invalid document type'; END IF;
  IF gt < 0 THEN RAISE EXCEPTION 'Invalid total'; END IF;

  -- Idempotency: same request twice returns the first result
  IF cref IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(ws::text || cref::text));
    SELECT id, doc_number, payment_status INTO ex FROM public.pos_sales WHERE workspace_id = ws AND client_ref = cref;
    IF FOUND THEN RETURN jsonb_build_object('id', ex.id, 'number', ex.doc_number, 'payment_status', ex.payment_status, 'duplicate', true); END IF;
  END IF;

  IF dtype = 'sale' AND coalesce((_p->>'discount_total')::numeric,0) > 0 AND NOT public.pos_can('apply_discount') THEN
    RAISE EXCEPTION 'Discount permission required';
  END IF;

  -- Returns: lock original bill and block over-return
  IF dtype = 'return' THEN
    SELECT * INTO refs FROM public.pos_sales WHERE id = nullif(_p->>'ref_sale_id','')::uuid AND workspace_id = ws FOR UPDATE;
    IF refs IS NULL OR refs.doc_type <> 'sale' OR refs.status = 'cancelled' THEN RAISE EXCEPTION 'Original invoice not found or cancelled'; END IF;
    FOR it IN SELECT * FROM jsonb_array_elements(coalesce(_p->'items','[]'::jsonb)) LOOP
      prod := nullif(it->>'product_id','')::uuid;
      CONTINUE WHEN prod IS NULL;
      SELECT coalesce(sum(stock_qty),0) INTO sold FROM public.pos_sale_items WHERE sale_id = refs.id AND product_id = prod;
      SELECT coalesce(sum(i.stock_qty),0) INTO back FROM public.pos_sale_items i JOIN public.pos_sales s ON s.id = i.sale_id
        WHERE s.ref_sale_id = refs.id AND s.doc_type = 'return' AND s.status <> 'cancelled' AND i.product_id = prod;
      IF back + coalesce((it->>'stock_qty')::numeric,0) > sold + 0.0001 THEN RAISE EXCEPTION 'Return quantity exceeds sold quantity for %', it->>'name'; END IF;
    END LOOP;
  END IF;

  IF cust IS NULL AND v_phone IS NOT NULL AND length(v_phone) >= 10 THEN
    cust := public.pos_find_customer(ws, v_phone);
    IF cust IS NULL THEN
      INSERT INTO public.customers(phone, name, workspace_id, created_by)
      VALUES (v_phone, nullif(_p->>'customer_name',''), ws, uid)
      ON CONFLICT (workspace_id, phone) DO UPDATE SET updated_at = now()
      RETURNING id INTO cust;
    END IF;
  END IF;
  IF cust IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customers x WHERE x.id = cust AND x.workspace_id = ws) THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  num := CASE dtype
    WHEN 'sale' THEN public.next_invoice_number()
    WHEN 'return' THEN 'SR-' || lpad(nextval('public.return_seq')::text,5,'0')
    WHEN 'quotation' THEN 'QT-' || lpad(nextval('public.quote_seq')::text,5,'0')
    ELSE 'HOLD-' || to_char(now(),'HH24MISS') || '-' || substr(md5(gen_random_uuid()::text),1,4) END;

  FOR pay IN SELECT * FROM jsonb_array_elements(coalesce(_p->'payments','[]'::jsonb)) LOOP
    IF pay->>'method' <> 'Credit' THEN paid_raw := paid_raw + greatest(coalesce((pay->>'amount')::numeric,0),0); END IF;
  END LOOP;
  paid_raw := round(paid_raw,2);
  paid := least(paid_raw, gt);

  pstatus := CASE WHEN dtype NOT IN ('sale','return') THEN dtype
    WHEN paid >= gt THEN 'paid' WHEN paid > 0 THEN 'partial' ELSE 'credit' END;

  INSERT INTO public.pos_sales(workspace_id, doc_type, doc_number, status, payment_status, customer_id, customer_name, customer_phone,
    subtotal, discount_total, tax_total, delivery, grand_total, paid_total, balance, notes, ref_sale_id, payload, created_by, client_ref)
  VALUES (ws, dtype, num, CASE WHEN dtype='held' THEN 'draft' ELSE 'completed' END, pstatus, cust,
    coalesce(nullif(_p->>'customer_name',''),'Walk-in'), v_phone,
    round(coalesce((_p->>'subtotal')::numeric,0),2), round(coalesce((_p->>'discount_total')::numeric,0),2), round(coalesce((_p->>'tax_total')::numeric,0),2),
    round(coalesce((_p->>'delivery')::numeric,0),2), gt, paid, gt - paid, _p->>'notes',
    nullif(_p->>'ref_sale_id','')::uuid, _p->'ui', uid, cref)
  RETURNING id INTO sid;

  sign := CASE dtype WHEN 'sale' THEN -1 WHEN 'return' THEN 1 ELSE 0 END;
  FOR it IN SELECT * FROM jsonb_array_elements(coalesce(_p->'items','[]'::jsonb)) LOOP
    prod := nullif(it->>'product_id','')::uuid; c := NULL;
    IF prod IS NOT NULL THEN
      SELECT purchase_price, is_active INTO pr FROM public.products WHERE id = prod AND workspace_id = ws;
      IF NOT FOUND THEN prod := NULL;
      ELSE
        IF dtype = 'sale' AND pr.is_active = false THEN RAISE EXCEPTION 'Product is inactive: %', it->>'name'; END IF;
        c := pr.purchase_price;
      END IF;
    END IF;
    c := round(coalesce(c,0) * coalesce((it->>'stock_qty')::numeric,0),2);
    cost_sum := cost_sum + c;
    INSERT INTO public.pos_sale_items(sale_id, workspace_id, product_id, name, sku, unit, rate_type, qty, stock_qty, rate, cost, discount, tax_percent, tax_amount, line_total, note)
    VALUES (sid, ws, prod, it->>'name', it->>'sku', it->>'unit', it->>'rate_type',
      (it->>'qty')::numeric, coalesce((it->>'stock_qty')::numeric,0), round((it->>'rate')::numeric,2), c,
      round(coalesce((it->>'discount')::numeric,0),2), coalesce((it->>'tax_percent')::numeric,0), round(coalesce((it->>'tax_amount')::numeric,0),2),
      round((it->>'line_total')::numeric,2), it->>'note');
    IF sign <> 0 THEN
      PERFORM public.pos_move_stock(ws, prod, sign * coalesce((it->>'stock_qty')::numeric,0),
        CASE dtype WHEN 'sale' THEN 'sale' ELSE 'sale_return' END, sid, num);
    END IF;
  END LOOP;
  UPDATE public.pos_sales SET cost_total = cost_sum WHERE id = sid;

  -- Record payments capped at the bill total (change returned is not income). Non-cash first, cash absorbs change.
  IF dtype IN ('sale','return') THEN
    remaining := gt;
    FOR pass IN 1..2 LOOP
      FOR pay IN SELECT * FROM jsonb_array_elements(coalesce(_p->'payments','[]'::jsonb)) LOOP
        CONTINUE WHEN pay->>'method' = 'Credit';
        CONTINUE WHEN (pass = 1 AND pay->>'method' = 'Cash') OR (pass = 2 AND pay->>'method' <> 'Cash');
        amt := least(round(coalesce((pay->>'amount')::numeric,0),2), remaining);
        IF amt > 0 THEN
          INSERT INTO public.pos_payments(workspace_id, direction, method, amount, customer_id, sale_id, kind, created_by)
          VALUES (ws, CASE dtype WHEN 'sale' THEN 'in' ELSE 'out' END, pay->>'method', amt, cust, sid,
            CASE dtype WHEN 'sale' THEN 'sale' ELSE 'refund' END, uid);
          remaining := remaining - amt;
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  IF dtype = 'sale' THEN
    INSERT INTO public.invoices(invoice_number, customer_name, phone, total, payment_status, paid_at, payment_method, cod_amount, invoice_text, customer_id, created_by, workspace_id)
    VALUES (num, coalesce(nullif(_p->>'customer_name',''),'Walk-in'), v_phone, gt,
      CASE WHEN pstatus='credit' THEN 'unpaid' ELSE pstatus END,
      CASE WHEN pstatus='paid' THEN now() END, 'POS-' || coalesce(_p->>'method_label','Cash'),
      CASE WHEN pstatus='paid' THEN NULL ELSE gt-paid END,
      replace(coalesce(_p->>'invoice_text',''),'{{INVOICE}}',num), cust, uid, ws)
    RETURNING id INTO inv;
    UPDATE public.pos_sales SET invoice_id = inv WHERE id = sid;
  END IF;

  -- Converting held bill / quotation happens in the same transaction
  IF nullif(_p->>'convert_from_id','') IS NOT NULL THEN
    UPDATE public.pos_sales SET status = 'converted', updated_at = now()
    WHERE id = (_p->>'convert_from_id')::uuid AND workspace_id = ws AND doc_type IN ('held','quotation') AND status <> 'cancelled';
  END IF;

  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by)
  VALUES (ws, 'create', 'pos_' || dtype, sid, jsonb_build_object('number',num,'total',gt), uid);

  RETURN jsonb_build_object('id', sid, 'number', num, 'payment_status', pstatus, 'change', greatest(paid_raw - gt, 0));
END $function$;

CREATE OR REPLACE FUNCTION public.pos_save_purchase(_p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  ws uuid := public.current_workspace();
  uid uuid := auth.uid();
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
  IF cref IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(ws::text || cref::text));
    SELECT id, doc_number INTO ex FROM public.purchases WHERE workspace_id = ws AND client_ref = cref;
    IF FOUND THEN RETURN jsonb_build_object('id', ex.id, 'number', ex.doc_number, 'duplicate', true); END IF;
  END IF;
  IF sup IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = sup AND s.workspace_id = ws) THEN
    RAISE EXCEPTION 'Supplier not found';
  END IF;
  num := CASE dtype WHEN 'purchase' THEN 'PUR-' ELSE 'PR-' END || lpad(nextval('public.purchase_seq')::text,5,'0');

  INSERT INTO public.purchases(workspace_id, doc_type, doc_number, payment_status, supplier_id, supplier_name, subtotal, discount_total, tax_total, grand_total, paid_total, balance, notes, ref_purchase_id, created_by, client_ref)
  VALUES (ws, dtype, num, CASE WHEN paid >= gt THEN 'paid' WHEN paid > 0 THEN 'partial' ELSE 'credit' END, sup,
    coalesce((SELECT name FROM public.suppliers WHERE id = sup), nullif(_p->>'supplier_name',''), 'Cash purchase'),
    round(coalesce((_p->>'subtotal')::numeric,0),2), round(coalesce((_p->>'discount_total')::numeric,0),2), round(coalesce((_p->>'tax_total')::numeric,0),2),
    gt, paid, gt - paid, _p->>'notes', nullif(_p->>'ref_purchase_id','')::uuid, uid, cref)
  RETURNING id INTO pid;

  sign := CASE dtype WHEN 'purchase' THEN 1 ELSE -1 END;
  FOR it IN SELECT * FROM jsonb_array_elements(coalesce(_p->'items','[]'::jsonb)) LOOP
    prod := nullif(it->>'product_id','')::uuid;
    IF prod IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.products x WHERE x.id = prod AND x.workspace_id = ws) THEN prod := NULL; END IF;
    INSERT INTO public.purchase_items(purchase_id, workspace_id, product_id, name, unit, qty, rate, discount, tax_percent, tax_amount, line_total, batch, expiry)
    VALUES (pid, ws, prod, it->>'name', it->>'unit', (it->>'qty')::numeric, round((it->>'rate')::numeric,2), round(coalesce((it->>'discount')::numeric,0),2),
      coalesce((it->>'tax_percent')::numeric,0), round(coalesce((it->>'tax_amount')::numeric,0),2), round((it->>'line_total')::numeric,2),
      nullif(it->>'batch',''), nullif(it->>'expiry','')::date);
    PERFORM public.pos_move_stock(ws, prod, sign * (it->>'qty')::numeric, CASE dtype WHEN 'purchase' THEN 'purchase' ELSE 'purchase_return' END, pid, num);
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

DROP FUNCTION IF EXISTS public.pos_party_payment(text, uuid, numeric, text, text);
CREATE FUNCTION public.pos_party_payment(_kind text, _party uuid, _amount numeric, _method text, _note text, _ref uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE ws uuid := public.current_workspace(); uid uuid := auth.uid(); pid uuid; amt numeric := round(_amount,2);
BEGIN
  IF uid IS NULL OR NOT public.is_active_team_member(uid) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF amt IS NULL OR amt <= 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  IF _ref IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(ws::text || _ref::text));
    SELECT id INTO pid FROM public.pos_payments WHERE workspace_id = ws AND client_ref = _ref;
    IF FOUND THEN RETURN pid; END IF;
  END IF;
  IF _kind = 'supplier_payment' THEN
    IF NOT public.pos_can('manage_purchases') THEN RAISE EXCEPTION 'Purchase permission required'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = _party AND workspace_id = ws) THEN RAISE EXCEPTION 'Supplier not found'; END IF;
    INSERT INTO public.pos_payments(workspace_id, direction, method, amount, supplier_id, kind, note, created_by, client_ref)
    VALUES (ws, 'out', _method, amt, _party, 'supplier_payment', _note, uid, _ref) RETURNING id INTO pid;
  ELSIF _kind = 'receipt' THEN
    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = _party AND workspace_id = ws) THEN RAISE EXCEPTION 'Customer not found'; END IF;
    INSERT INTO public.pos_payments(workspace_id, direction, method, amount, customer_id, kind, note, created_by, client_ref)
    VALUES (ws, 'in', _method, amt, _party, 'receipt', _note, uid, _ref) RETURNING id INTO pid;
  ELSE RAISE EXCEPTION 'Invalid payment type'; END IF;
  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by)
  VALUES (ws, 'create', _kind, pid, jsonb_build_object('amount',amt,'method',_method), uid);
  RETURN pid;
END $function$;
REVOKE ALL ON FUNCTION public.pos_party_payment(text, uuid, numeric, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_party_payment(text, uuid, numeric, text, text, uuid) TO authenticated;

-- Cancel: block cancelling a sale that still has active returns (would double-restore stock)
CREATE OR REPLACE FUNCTION public.pos_cancel_sale_core(_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE ws uuid := public.current_workspace(); s record; it record;
BEGIN
  IF NOT public.is_active_team_member(auth.uid()) THEN RAISE EXCEPTION 'Access denied'; END IF;
  SELECT * INTO s FROM public.pos_sales WHERE id = _id AND workspace_id = ws FOR UPDATE;
  IF s IS NULL OR s.status = 'cancelled' THEN RAISE EXCEPTION 'Invoice not found or already cancelled'; END IF;
  IF s.doc_type = 'sale' AND EXISTS (SELECT 1 FROM public.pos_sales r WHERE r.ref_sale_id = _id AND r.doc_type = 'return' AND r.status <> 'cancelled') THEN
    RAISE EXCEPTION 'Cancel the returns of this invoice first';
  END IF;
  IF s.doc_type IN ('sale','return') THEN
    FOR it IN SELECT * FROM public.pos_sale_items WHERE sale_id = _id LOOP
      PERFORM public.pos_move_stock(ws, it.product_id, CASE s.doc_type WHEN 'sale' THEN it.stock_qty ELSE -it.stock_qty END, 'cancel', _id, 'Cancel ' || s.doc_number);
    END LOOP;
    UPDATE public.pos_payments SET status = 'cancelled' WHERE sale_id = _id;
    UPDATE public.invoices SET payment_status = 'cancelled' WHERE id = s.invoice_id;
  END IF;
  UPDATE public.pos_sales SET status = 'cancelled', updated_at = now() WHERE id = _id;
  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by) VALUES (ws, 'cancel', 'pos_sale', _id, jsonb_build_object('reason', _reason), auth.uid());
END $function$;
REVOKE ALL ON FUNCTION public.pos_cancel_sale_core(uuid, text) FROM PUBLIC, anon, authenticated;