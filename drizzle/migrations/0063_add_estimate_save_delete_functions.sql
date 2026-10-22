CREATE FUNCTION public.pos_save_doc_v2(_p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  ws uuid := public.current_workspace();
  uid uuid := auth.uid();
  source_id uuid := nullif(_p->>'convert_from_id','')::uuid;
  source_doc public.pos_sales%rowtype;
  cref uuid := nullif(_p->>'client_ref','')::uuid;
  dtype text := coalesce(_p->>'doc_type','sale');
  duplicate_doc record;
  item jsonb;
  product uuid;
  cost numeric;
  cost_total numeric := 0;
  total numeric := round(coalesce((_p->>'grand_total')::numeric,0),2);
  customer uuid := nullif(_p->>'customer_id','')::uuid;
  phone text := nullif(regexp_replace(coalesce(_p->>'customer_phone',''),'\D','','g'),'');
BEGIN
  IF uid IS NULL OR ws IS NULL OR NOT public.is_active_team_member(uid) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF cref IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(ws::text || cref::text));
    SELECT id, doc_number, payment_status INTO duplicate_doc FROM public.pos_sales WHERE workspace_id = ws AND client_ref = cref;
    IF FOUND THEN RETURN jsonb_build_object('id',duplicate_doc.id,'number',duplicate_doc.doc_number,'payment_status',duplicate_doc.payment_status,'duplicate',true); END IF;
  END IF;
  IF source_id IS NULL THEN RETURN public.pos_save_sale(_p); END IF;
  SELECT * INTO source_doc FROM public.pos_sales WHERE id = source_id AND workspace_id = ws FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Source document not found'; END IF;
  IF source_doc.doc_type <> 'quotation' THEN RETURN public.pos_save_sale(_p); END IF;
  IF NOT public.pos_can('view_pos') OR NOT (public.pos_can('create_sale') OR public.pos_can('edit_sale')) THEN RAISE EXCEPTION 'POS sales permission required'; END IF;
  IF source_doc.status NOT IN ('draft','completed') THEN RAISE EXCEPTION 'Estimate already converted or cancelled'; END IF;
  IF dtype NOT IN ('quotation','sale') THEN RAISE EXCEPTION 'Estimate can only be saved or converted to invoice'; END IF;
  _p := jsonb_set(_p,'{doc_number}',to_jsonb(source_doc.doc_number));
  IF dtype = 'sale' THEN RETURN public.pos_save_sale(_p); END IF;
  IF total < 0 THEN RAISE EXCEPTION 'Invalid total'; END IF;
  IF customer IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customers WHERE id = customer AND workspace_id = ws) THEN RAISE EXCEPTION 'Customer not found'; END IF;
  IF customer IS NULL AND phone IS NOT NULL AND length(phone) >= 10 THEN customer := public.pos_find_customer(ws,phone); END IF;
  UPDATE public.pos_sales SET
    customer_id = customer, customer_name = coalesce(nullif(_p->>'customer_name',''),'Walk-in'), customer_phone = phone,
    subtotal = round(coalesce((_p->>'subtotal')::numeric,0),2), discount_total = round(coalesce((_p->>'discount_total')::numeric,0),2),
    tax_total = round(coalesce((_p->>'tax_total')::numeric,0),2), delivery = round(coalesce((_p->>'delivery')::numeric,0),2),
    grand_total = total, paid_total = 0, balance = total, notes = _p->>'notes', payload = _p->'ui', client_ref = cref, updated_at = now()
  WHERE id = source_id AND workspace_id = ws;
  DELETE FROM public.pos_sale_items WHERE sale_id = source_id AND workspace_id = ws;
  FOR item IN SELECT * FROM jsonb_array_elements(coalesce(_p->'items','[]'::jsonb)) LOOP
    product := nullif(item->>'product_id','')::uuid;
    cost := 0;
    IF product IS NOT NULL THEN
      SELECT round(coalesce(purchase_price,0)*coalesce((item->>'stock_qty')::numeric,0),2) INTO cost FROM public.products WHERE id = product AND workspace_id = ws AND scope = 'pos';
      IF NOT FOUND THEN product := NULL; cost := 0; END IF;
    END IF;
    cost_total := cost_total + coalesce(cost,0);
    INSERT INTO public.pos_sale_items(sale_id,workspace_id,product_id,name,sku,unit,rate_type,qty,stock_qty,rate,cost,discount,tax_percent,tax_amount,line_total,note)
    VALUES(source_id,ws,product,item->>'name',item->>'sku',item->>'unit',item->>'rate_type',(item->>'qty')::numeric,coalesce((item->>'stock_qty')::numeric,0),round((item->>'rate')::numeric,2),coalesce(cost,0),round(coalesce((item->>'discount')::numeric,0),2),coalesce((item->>'tax_percent')::numeric,0),round(coalesce((item->>'tax_amount')::numeric,0),2),round((item->>'line_total')::numeric,2),item->>'note');
  END LOOP;
  UPDATE public.pos_sales SET cost_total = cost_total WHERE id = source_id AND workspace_id = ws;
  INSERT INTO public.audit_log(workspace_id,action,entity,entity_id,details,created_by)
  VALUES(ws,'edit','pos_quotation',source_id,jsonb_build_object('number',source_doc.doc_number,'total',total),uid);
  RETURN jsonb_build_object('id',source_id,'number',source_doc.doc_number,'payment_status',source_doc.payment_status,'change',0);
END;
$function$;
REVOKE ALL ON FUNCTION public.pos_save_doc_v2(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_save_doc_v2(jsonb) TO authenticated;
COMMENT ON FUNCTION public.pos_save_doc_v2(jsonb) IS 'Additive POS save entrypoint: stable estimate identity and serial; other writes delegate to existing atomic sale function.';

CREATE FUNCTION public.pos_delete_doc_v2(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  ws uuid := public.current_workspace(); uid uuid := auth.uid(); d public.pos_sales%rowtype;
BEGIN
  IF uid IS NULL OR ws IS NULL OR NOT public.is_active_team_member(uid)
    OR NOT public.pos_can('view_pos') OR NOT (public.pos_can('create_sale') OR public.pos_can('edit_sale')) THEN RAISE EXCEPTION 'POS sales permission required'; END IF;
  SELECT * INTO d FROM public.pos_sales WHERE id = _id AND workspace_id = ws FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Document not found'; END IF;
  IF d.doc_type NOT IN ('quotation','held') THEN RAISE EXCEPTION 'Only estimates and held bills can be deleted; cancel invoices instead'; END IF;
  DELETE FROM public.pos_sale_items WHERE sale_id = _id AND workspace_id = ws;
  DELETE FROM public.pos_payments WHERE sale_id = _id AND workspace_id = ws;
  DELETE FROM public.pos_sales WHERE id = _id AND workspace_id = ws;
  INSERT INTO public.audit_log(workspace_id,action,entity,entity_id,details,created_by)
  VALUES(ws,'delete','pos_sale',_id,jsonb_build_object('number',d.doc_number,'type',d.doc_type),uid);
END;
$function$;
REVOKE ALL ON FUNCTION public.pos_delete_doc_v2(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_delete_doc_v2(uuid) TO authenticated;
COMMENT ON FUNCTION public.pos_delete_doc(uuid) IS 'DEPRECATED: new app uses pos_delete_doc_v2; retained for older deployed callers.';