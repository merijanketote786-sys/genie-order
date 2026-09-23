CREATE OR REPLACE FUNCTION public.pos_find_customer(_ws uuid, _phone text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id FROM public.customers c WHERE c.workspace_id = _ws AND c.phone = _phone LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.pos_find_customer(uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pos_save_sale(_p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ws uuid := public.current_workspace();
  uid uuid := auth.uid();
  dtype text := coalesce(_p->>'doc_type','sale');
  num text;
  sid uuid;
  cust uuid := nullif(_p->>'customer_id','')::uuid;
  v_phone text := nullif(regexp_replace(coalesce(_p->>'customer_phone',''),'\D','','g'),'');
  it jsonb; pay jsonb;
  cost_sum numeric := 0; c numeric;
  gt numeric := coalesce((_p->>'grand_total')::numeric,0);
  paid numeric := 0;
  pstatus text; inv uuid; sign int;
BEGIN
  IF uid IS NULL OR ws IS NULL OR NOT public.is_active_team_member(uid) THEN
    RAISE EXCEPTION 'Access band hai';
  END IF;
  IF dtype NOT IN ('sale','quotation','held','return') THEN RAISE EXCEPTION 'bad doc_type'; END IF;

  IF cust IS NULL AND v_phone IS NOT NULL AND length(v_phone) >= 10 THEN
    cust := public.pos_find_customer(ws, v_phone);
    IF cust IS NULL THEN
      INSERT INTO public.customers(phone, name, workspace_id, created_by)
      VALUES (v_phone, nullif(_p->>'customer_name',''), ws, uid) RETURNING id INTO cust;
    END IF;
  END IF;
  IF cust IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customers x WHERE x.id = cust AND x.workspace_id = ws) THEN
    RAISE EXCEPTION 'customer not found';
  END IF;

  num := CASE dtype
    WHEN 'sale' THEN public.next_invoice_number()
    WHEN 'return' THEN 'SR-' || lpad(nextval('public.return_seq')::text,5,'0')
    WHEN 'quotation' THEN 'QT-' || lpad(nextval('public.quote_seq')::text,5,'0')
    ELSE 'HOLD-' || to_char(now(),'HH24MISS') END;

  FOR pay IN SELECT * FROM jsonb_array_elements(coalesce(_p->'payments','[]'::jsonb)) LOOP
    IF pay->>'method' <> 'Credit' THEN paid := paid + coalesce((pay->>'amount')::numeric,0); END IF;
  END LOOP;

  pstatus := CASE WHEN dtype NOT IN ('sale','return') THEN dtype
    WHEN paid >= gt THEN 'paid' WHEN paid > 0 THEN 'partial' ELSE 'credit' END;

  INSERT INTO public.pos_sales(workspace_id, doc_type, doc_number, status, payment_status, customer_id, customer_name, customer_phone,
    subtotal, discount_total, tax_total, delivery, grand_total, paid_total, balance, notes, ref_sale_id, payload, created_by)
  VALUES (ws, dtype, num, CASE WHEN dtype='held' THEN 'draft' ELSE 'completed' END, pstatus, cust,
    coalesce(nullif(_p->>'customer_name',''),'Walk-in'), v_phone,
    coalesce((_p->>'subtotal')::numeric,0), coalesce((_p->>'discount_total')::numeric,0), coalesce((_p->>'tax_total')::numeric,0),
    coalesce((_p->>'delivery')::numeric,0), gt, least(paid, gt), greatest(gt - paid, 0), _p->>'notes',
    nullif(_p->>'ref_sale_id','')::uuid, _p->'ui', uid)
  RETURNING id INTO sid;

  sign := CASE dtype WHEN 'sale' THEN -1 WHEN 'return' THEN 1 ELSE 0 END;
  FOR it IN SELECT * FROM jsonb_array_elements(coalesce(_p->'items','[]'::jsonb)) LOOP
    c := NULL;
    IF nullif(it->>'product_id','') IS NOT NULL THEN
      SELECT purchase_price INTO c FROM public.products WHERE id = (it->>'product_id')::uuid AND workspace_id = ws;
    END IF;
    c := coalesce(c,0) * coalesce((it->>'stock_qty')::numeric,0);
    cost_sum := cost_sum + c;
    INSERT INTO public.pos_sale_items(sale_id, workspace_id, product_id, name, sku, unit, rate_type, qty, stock_qty, rate, cost, discount, tax_percent, tax_amount, line_total, note)
    VALUES (sid, ws, nullif(it->>'product_id','')::uuid, it->>'name', it->>'sku', it->>'unit', it->>'rate_type',
      (it->>'qty')::numeric, coalesce((it->>'stock_qty')::numeric,0), (it->>'rate')::numeric, c,
      coalesce((it->>'discount')::numeric,0), coalesce((it->>'tax_percent')::numeric,0), coalesce((it->>'tax_amount')::numeric,0),
      (it->>'line_total')::numeric, it->>'note');
    IF sign <> 0 THEN
      PERFORM public.pos_move_stock(ws, nullif(it->>'product_id','')::uuid, sign * coalesce((it->>'stock_qty')::numeric,0),
        CASE dtype WHEN 'sale' THEN 'sale' ELSE 'sale_return' END, sid, num);
    END IF;
  END LOOP;
  UPDATE public.pos_sales SET cost_total = cost_sum WHERE id = sid;

  IF dtype IN ('sale','return') THEN
    FOR pay IN SELECT * FROM jsonb_array_elements(coalesce(_p->'payments','[]'::jsonb)) LOOP
      IF pay->>'method' <> 'Credit' AND coalesce((pay->>'amount')::numeric,0) > 0 THEN
        INSERT INTO public.pos_payments(workspace_id, direction, method, amount, customer_id, sale_id, kind, created_by)
        VALUES (ws, CASE dtype WHEN 'sale' THEN 'in' ELSE 'out' END, pay->>'method', (pay->>'amount')::numeric, cust, sid,
          CASE dtype WHEN 'sale' THEN 'sale' ELSE 'refund' END, uid);
      END IF;
    END LOOP;
  END IF;

  IF dtype = 'sale' THEN
    INSERT INTO public.invoices(invoice_number, customer_name, phone, total, payment_status, paid_at, payment_method, cod_amount, invoice_text, customer_id, created_by, workspace_id)
    VALUES (num, coalesce(nullif(_p->>'customer_name',''),'Walk-in'), v_phone, gt,
      CASE WHEN pstatus='credit' THEN 'unpaid' ELSE pstatus END,
      CASE WHEN pstatus='paid' THEN now() END, 'POS-' || coalesce(_p->>'method_label','Cash'),
      CASE WHEN pstatus='paid' THEN NULL ELSE greatest(gt-paid,0) END,
      replace(coalesce(_p->>'invoice_text',''),'{{INVOICE}}',num), cust, uid, ws)
    RETURNING id INTO inv;
    UPDATE public.pos_sales SET invoice_id = inv WHERE id = sid;
  END IF;

  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by)
  VALUES (ws, 'create', 'pos_' || dtype, sid, jsonb_build_object('number',num,'total',gt), uid);

  RETURN jsonb_build_object('id', sid, 'number', num, 'payment_status', pstatus);
END $$;
REVOKE ALL ON FUNCTION public.pos_save_sale(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_save_sale(jsonb) TO authenticated;
