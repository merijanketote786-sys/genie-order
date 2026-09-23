CREATE OR REPLACE FUNCTION public.pos_perms(_role text)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $function$
  SELECT CASE _role
    WHEN 'admin' THEN ARRAY['view_pos','create_sale','edit_sale','return_sale','edit_price','apply_discount','cancel_invoice','view_reports','view_profit','edit_stock','edit_products','view_balances','manage_customers','manage_suppliers','manage_expenses','manage_purchases','manage_printers','manage_users','settings']
    WHEN 'manager' THEN ARRAY['view_pos','create_sale','edit_sale','return_sale','edit_price','apply_discount','cancel_invoice','view_reports','view_profit','edit_stock','edit_products','view_balances','manage_customers','manage_suppliers','manage_expenses','manage_purchases','manage_printers']
    WHEN 'salesman' THEN ARRAY['view_pos','create_sale','return_sale','apply_discount','view_balances','manage_customers']
    WHEN 'cashier' THEN ARRAY['view_pos','create_sale','return_sale','view_balances','manage_expenses','manage_customers']
    ELSE ARRAY['view_pos','create_sale'] END
$function$;

-- Audit events from the app (reprint, backup, print error, export)
CREATE OR REPLACE FUNCTION public.pos_log_event(_action text, _entity text, _entity_id uuid, _details jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_team_member(auth.uid()) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF _action NOT IN ('reprint','print','backup','export','print_error','pin_override') THEN RAISE EXCEPTION 'Invalid event'; END IF;
  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by)
  VALUES (public.current_workspace(), _action, left(coalesce(_entity,'app'),40), _entity_id, coalesce(_details,'{}'::jsonb) - 'password' - 'pin', auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.pos_log_event(text,text,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_log_event(text,text,uuid,jsonb) TO authenticated;

-- Settings save: log which sections changed; printers keys preserved unless sent
CREATE OR REPLACE FUNCTION public.pos_save_settings(_config jsonb, _pin text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions' AS $function$
DECLARE ws uuid := public.current_workspace(); old jsonb; newc jsonb; changed text[];
BEGIN
  IF NOT public.pos_can('settings') THEN RAISE EXCEPTION 'Settings permission required'; END IF;
  SELECT config INTO old FROM public.pos_settings WHERE workspace_id = ws;
  old := coalesce(old, '{}'::jsonb);
  newc := coalesce(_config,'{}'::jsonb);
  IF NOT newc ? 'printers' AND old ? 'printers' THEN newc := newc || jsonb_build_object('printers', old->'printers'); END IF;
  IF NOT newc ? 'printerDefaults' AND old ? 'printerDefaults' THEN newc := newc || jsonb_build_object('printerDefaults', old->'printerDefaults'); END IF;
  SELECT array_agg(k) INTO changed FROM (SELECT key k FROM jsonb_each(newc) WHERE old->key IS DISTINCT FROM value UNION SELECT key FROM jsonb_each(old) WHERE NOT newc ? key) x;
  INSERT INTO public.pos_settings(workspace_id, config, updated_by) VALUES (ws, newc, auth.uid())
  ON CONFLICT (workspace_id) DO UPDATE SET config = EXCLUDED.config, updated_at = now(), updated_by = auth.uid();
  IF _pin IS NOT NULL THEN
    IF _pin = '' THEN UPDATE public.pos_settings SET pin_hash = NULL WHERE workspace_id = ws;
    ELSIF _pin !~ '^\d{4,8}$' THEN RAISE EXCEPTION 'PIN 4-8 digits';
    ELSE UPDATE public.pos_settings SET pin_hash = extensions.crypt(_pin, extensions.gen_salt('bf')) WHERE workspace_id = ws; END IF;
  END IF;
  INSERT INTO public.audit_log(workspace_id, action, entity, details, created_by)
  VALUES (ws, 'settings_change', 'pos_settings', jsonb_build_object('sections', coalesce(to_jsonb(changed),'[]'::jsonb), 'pin_changed', _pin IS NOT NULL), auth.uid());
END $function$;

-- Printer configurations (settings OR manage_printers)
CREATE OR REPLACE FUNCTION public.pos_save_printers(_printers jsonb, _defaults jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ws uuid := public.current_workspace();
BEGIN
  IF NOT (public.pos_can('manage_printers') OR public.pos_can('settings')) THEN RAISE EXCEPTION 'Printer permission required'; END IF;
  IF jsonb_typeof(coalesce(_printers,'[]')) <> 'array' OR jsonb_array_length(coalesce(_printers,'[]')) > 30 THEN RAISE EXCEPTION 'Invalid printers'; END IF;
  INSERT INTO public.pos_settings(workspace_id, config, updated_by)
  VALUES (ws, jsonb_build_object('printers', coalesce(_printers,'[]'), 'printerDefaults', coalesce(_defaults,'{}')), auth.uid())
  ON CONFLICT (workspace_id) DO UPDATE SET config = public.pos_settings.config || jsonb_build_object('printers', coalesce(_printers,'[]'), 'printerDefaults', coalesce(_defaults,'{}')), updated_at = now(), updated_by = auth.uid();
  INSERT INTO public.audit_log(workspace_id, action, entity, details, created_by)
  VALUES (ws, 'printer_change', 'printers', jsonb_build_object('count', jsonb_array_length(coalesce(_printers,'[]')), 'defaults', coalesce(_defaults,'{}')), auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.pos_save_printers(jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_save_printers(jsonb,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.pos_cfg_prefix(_cfg jsonb, _key text, _def text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(nullif(left(regexp_replace(coalesce(_cfg->'numbering'->>_key,''),'[^A-Za-z0-9/_-]','','g'),12),''), _def)
$$;

CREATE OR REPLACE FUNCTION public.pos_save_sale(_p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  ws uuid := public.current_workspace();
  uid uuid := auth.uid();
  cfg jsonb;
  role text;
  dtype text := coalesce(_p->>'doc_type','sale');
  cref uuid := nullif(_p->>'client_ref','')::uuid;
  num text; sid uuid; ex record;
  cust uuid := nullif(_p->>'customer_id','')::uuid;
  v_phone text := nullif(regexp_replace(coalesce(_p->>'customer_phone',''),'\D','','g'),'');
  it jsonb; pay jsonb; pass int; amt numeric; remaining numeric;
  cost_sum numeric := 0; c numeric; prod uuid; pr record;
  gt numeric := round(coalesce((_p->>'grand_total')::numeric,0),2);
  sub numeric := round(coalesce((_p->>'subtotal')::numeric,0),2);
  disc numeric := round(coalesce((_p->>'discount_total')::numeric,0),2);
  paid_raw numeric := 0; paid numeric;
  pstatus text; inv uuid; sign int; refs record; sold numeric; back numeric;
  lim numeric; bal numeric; maxd numeric;
BEGIN
  IF uid IS NULL OR ws IS NULL OR NOT public.is_active_team_member(uid) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF dtype NOT IN ('sale','quotation','held','return') THEN RAISE EXCEPTION 'Invalid document type'; END IF;
  IF gt < 0 THEN RAISE EXCEPTION 'Invalid total'; END IF;
  SELECT config INTO cfg FROM public.pos_settings WHERE workspace_id = ws;
  cfg := coalesce(cfg,'{}'::jsonb);
  role := public.pos_role(uid);

  IF cref IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(ws::text || cref::text));
    SELECT id, doc_number, payment_status INTO ex FROM public.pos_sales WHERE workspace_id = ws AND client_ref = cref;
    IF FOUND THEN RETURN jsonb_build_object('id', ex.id, 'number', ex.doc_number, 'payment_status', ex.payment_status, 'duplicate', true); END IF;
  END IF;

  IF dtype = 'sale' AND disc > 0 THEN
    IF NOT public.pos_can('apply_discount') THEN RAISE EXCEPTION 'Discount permission required'; END IF;
    maxd := nullif(cfg->'sales'->>'maxCashierDiscountPct','')::numeric;
    IF maxd IS NOT NULL AND role NOT IN ('admin','manager') AND disc > round((sub * maxd / 100) + 0.005, 2) THEN
      RAISE EXCEPTION 'Discount exceeds the allowed maximum of %%%', maxd;
    END IF;
  END IF;
  IF dtype = 'return' AND NOT public.pos_can('return_sale') THEN RAISE EXCEPTION 'Return permission required'; END IF;

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

  FOR pay IN SELECT * FROM jsonb_array_elements(coalesce(_p->'payments','[]'::jsonb)) LOOP
    IF pay->>'method' <> 'Credit' THEN paid_raw := paid_raw + greatest(coalesce((pay->>'amount')::numeric,0),0); END IF;
  END LOOP;
  paid_raw := round(paid_raw,2);
  paid := least(paid_raw, gt);

  IF dtype = 'sale' AND paid < gt THEN
    IF coalesce(cfg->'sales'->>'requireCustomerForCredit','true') <> 'false' AND cust IS NULL AND v_phone IS NULL AND nullif(trim(coalesce(_p->>'customer_name','')),'') IS NULL THEN
      RAISE EXCEPTION 'Customer required for credit sale';
    END IF;
    IF (cfg->'customers'->>'requirePhoneForCredit') = 'true' AND cust IS NULL AND (v_phone IS NULL OR length(v_phone) < 10) THEN
      RAISE EXCEPTION 'Customer phone required for credit sale';
    END IF;
  END IF;

  IF cust IS NULL AND v_phone IS NOT NULL AND length(v_phone) >= 10 THEN
    cust := public.pos_find_customer(ws, v_phone);
    IF cust IS NULL THEN
      INSERT INTO public.customers(phone, name, workspace_id, created_by, credit_limit)
      VALUES (v_phone, nullif(_p->>'customer_name',''), ws, uid, nullif(cfg->'customers'->>'defaultCreditLimit','')::numeric)
      ON CONFLICT (workspace_id, phone) DO UPDATE SET updated_at = now()
      RETURNING id INTO cust;
    END IF;
  END IF;
  IF cust IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customers x WHERE x.id = cust AND x.workspace_id = ws) THEN
    RAISE EXCEPTION 'Customer not found';
  END IF;

  IF dtype = 'sale' AND paid < gt AND cust IS NOT NULL AND (cfg->'sales'->>'enforceCreditLimit') = 'true' THEN
    SELECT credit_limit, coalesce(opening_balance,0) INTO lim, bal FROM public.customers WHERE id = cust;
    IF lim IS NOT NULL THEN
      bal := bal + coalesce((SELECT sum(CASE WHEN doc_type='sale' THEN grand_total ELSE -grand_total END) FROM public.pos_sales WHERE customer_id = cust AND doc_type IN ('sale','return') AND status <> 'cancelled'),0)
                 - coalesce((SELECT sum(CASE WHEN direction='in' THEN amount ELSE -amount END) FROM public.pos_payments WHERE customer_id = cust AND status = 'completed'),0);
      IF bal + (gt - paid) > lim + 0.005 THEN RAISE EXCEPTION 'Credit limit exceeded (limit %, balance after sale %)', lim, round(bal + gt - paid, 2); END IF;
    END IF;
  END IF;

  num := CASE dtype
    WHEN 'sale' THEN regexp_replace(public.next_invoice_number(), '^INV-', public.pos_cfg_prefix(cfg,'salePrefix','INV-'))
    WHEN 'return' THEN public.pos_cfg_prefix(cfg,'returnPrefix','SR-') || lpad(nextval('public.return_seq')::text,5,'0')
    WHEN 'quotation' THEN public.pos_cfg_prefix(cfg,'quotePrefix','QT-') || lpad(nextval('public.quote_seq')::text,5,'0')
    ELSE 'HOLD-' || to_char(now(),'HH24MISS') || '-' || substr(md5(gen_random_uuid()::text),1,4) END;

  pstatus := CASE WHEN dtype NOT IN ('sale','return') THEN dtype
    WHEN paid >= gt THEN 'paid' WHEN paid > 0 THEN 'partial' ELSE 'credit' END;

  INSERT INTO public.pos_sales(workspace_id, doc_type, doc_number, status, payment_status, customer_id, customer_name, customer_phone,
    subtotal, discount_total, tax_total, delivery, grand_total, paid_total, balance, notes, ref_sale_id, payload, created_by, client_ref)
  VALUES (ws, dtype, num, CASE WHEN dtype='held' THEN 'draft' ELSE 'completed' END, pstatus, cust,
    coalesce(nullif(_p->>'customer_name',''),'Walk-in'), v_phone,
    sub, disc, round(coalesce((_p->>'tax_total')::numeric,0),2),
    round(coalesce((_p->>'delivery')::numeric,0),2), gt, paid, gt - paid, _p->>'notes',
    nullif(_p->>'ref_sale_id','')::uuid, _p->'ui', uid, cref)
  RETURNING id INTO sid;

  sign := CASE dtype WHEN 'sale' THEN -1 WHEN 'return' THEN 1 ELSE 0 END;
  FOR it IN SELECT * FROM jsonb_array_elements(coalesce(_p->'items','[]'::jsonb)) LOOP
    prod := nullif(it->>'product_id','')::uuid; c := NULL;
    IF dtype = 'sale' AND (cfg->'inventory'->>'allowFractional') = 'false' AND (it->>'qty')::numeric <> trunc((it->>'qty')::numeric) THEN
      RAISE EXCEPTION 'Fractional quantity not allowed: %', it->>'name';
    END IF;
    IF prod IS NOT NULL THEN
      SELECT purchase_price, is_active, stock INTO pr FROM public.products WHERE id = prod AND workspace_id = ws FOR UPDATE;
      IF NOT FOUND THEN prod := NULL;
      ELSE
        IF dtype = 'sale' AND pr.is_active = false THEN RAISE EXCEPTION 'Product is inactive: %', it->>'name'; END IF;
        IF dtype = 'sale' AND (cfg->'inventory'->>'allowNegativeStock') = 'false' AND coalesce(cfg->'inventory'->>'trackStock','true') <> 'false'
           AND coalesce(pr.stock,0) < coalesce((it->>'stock_qty')::numeric,0) THEN
          RAISE EXCEPTION 'Insufficient stock: % (available %)', it->>'name', coalesce(pr.stock,0);
        END IF;
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
    IF sign <> 0 AND coalesce(cfg->'inventory'->>'trackStock','true') <> 'false' THEN
      PERFORM public.pos_move_stock(ws, prod, sign * coalesce((it->>'stock_qty')::numeric,0),
        CASE dtype WHEN 'sale' THEN 'sale' ELSE 'sale_return' END, sid, num);
    END IF;
  END LOOP;
  UPDATE public.pos_sales SET cost_total = cost_sum WHERE id = sid;

  IF dtype IN ('sale','return') THEN
    remaining := gt;
    FOR pass IN 1..2 LOOP
      FOR pay IN SELECT * FROM jsonb_array_elements(coalesce(_p->'payments','[]'::jsonb)) LOOP
        CONTINUE WHEN pay->>'method' = 'Credit';
        CONTINUE WHEN (pass = 1 AND pay->>'method' = 'Cash') OR (pass = 2 AND pay->>'method' <> 'Cash');
        amt := least(round(coalesce((pay->>'amount')::numeric,0),2), remaining);
        IF amt > 0 THEN
          INSERT INTO public.pos_payments(workspace_id, direction, method, amount, customer_id, sale_id, kind, created_by)
          VALUES (ws, CASE dtype WHEN 'sale' THEN 'in' ELSE 'out' END, left(pay->>'method',30), amt, cust, sid,
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

  IF nullif(_p->>'convert_from_id','') IS NOT NULL THEN
    UPDATE public.pos_sales SET status = 'converted', updated_at = now()
    WHERE id = (_p->>'convert_from_id')::uuid AND workspace_id = ws AND doc_type IN ('held','quotation') AND status <> 'cancelled';
  END IF;

  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by)
  VALUES (ws, 'create', 'pos_' || dtype, sid, jsonb_build_object('number',num,'total',gt,'discount',disc), uid);

  RETURN jsonb_build_object('id', sid, 'number', num, 'payment_status', pstatus, 'change', greatest(paid_raw - gt, 0));
END $function$;

CREATE OR REPLACE FUNCTION public.pos_save_purchase(_p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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