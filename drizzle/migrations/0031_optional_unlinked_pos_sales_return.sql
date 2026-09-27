CREATE OR REPLACE FUNCTION public.pos_save_unlinked_return(_p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  ws uuid := public.current_workspace(); uid uuid := auth.uid();
  cref uuid := nullif(_p->>'client_ref','')::uuid;
  cust uuid := nullif(_p->>'customer_id','')::uuid;
  num text; sid uuid; ex record; it jsonb; prod uuid; pr record;
  qty numeric; rate numeric; line_total numeric; total numeric := 0; cost_total numeric := 0;
  method text := left(coalesce(nullif(_p->>'method',''),'Cash'),30);
  mode text := coalesce(_p->>'mode','refund');
  cfg jsonb; count_items int := 0;
BEGIN
  IF uid IS NULL OR ws IS NULL OR NOT public.is_active_team_member(uid) OR NOT public.pos_can('return_sale') THEN RAISE EXCEPTION 'Return permission required'; END IF;
  IF mode NOT IN ('refund','credit') THEN RAISE EXCEPTION 'Invalid return mode'; END IF;
  IF method NOT IN ('Cash','Bank','JazzCash','Easypaisa','Card','Cheque','Other') AND mode = 'refund' THEN RAISE EXCEPTION 'Invalid refund method'; END IF;
  IF cust IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customers WHERE id = cust AND workspace_id = ws AND is_active) THEN RAISE EXCEPTION 'Customer not found'; END IF;
  IF mode = 'credit' AND cust IS NULL THEN RAISE EXCEPTION 'Select a saved customer for account credit'; END IF;
  IF jsonb_typeof(_p->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(_p->'items') NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'Add 1 to 300 return items'; END IF;
  IF cref IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(ws::text || cref::text));
    SELECT id, doc_number INTO ex FROM public.pos_sales WHERE workspace_id = ws AND client_ref = cref;
    IF FOUND THEN RETURN jsonb_build_object('id',ex.id,'number',ex.doc_number,'duplicate',true,'total',ex.grand_total); END IF;
  END IF;
  SELECT config INTO cfg FROM public.pos_settings WHERE workspace_id = ws;
  cfg := coalesce(cfg,'{}'::jsonb);
  FOR it IN SELECT * FROM jsonb_array_elements(_p->'items') LOOP
    prod := nullif(it->>'product_id','')::uuid;
    qty := (it->>'qty')::numeric; rate := (it->>'rate')::numeric;
    IF prod IS NULL OR qty IS NULL OR rate IS NULL OR qty <= 0 OR qty > 10000000 OR rate < 0 OR rate > 1000000000 OR nullif(trim(coalesce(it->>'name','')),'') IS NULL THEN RAISE EXCEPTION 'Invalid return item'; END IF;
    SELECT id, name, purchase_price INTO pr FROM public.products WHERE id = prod AND workspace_id = ws AND scope = 'pos' AND is_active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'Select an active POS product'; END IF;
    IF (it->>'name') <> pr.name THEN RAISE EXCEPTION 'Product name does not match inventory'; END IF;
    line_total := round(qty * rate, 2);
    total := total + line_total;
    cost_total := cost_total + round(coalesce(pr.purchase_price,0) * qty, 2);
    count_items := count_items + 1;
  END LOOP;
  IF count_items = 0 OR total <= 0 OR total > 1000000000 THEN RAISE EXCEPTION 'Enter a positive refund total'; END IF;
  total := round(total,2);
  num := public.pos_cfg_prefix(cfg,'returnPrefix','SR-') || lpad(nextval('public.return_seq')::text,5,'0');
  INSERT INTO public.pos_sales(workspace_id,doc_type,doc_number,status,payment_status,customer_id,customer_name,customer_phone,subtotal,grand_total,paid_total,balance,cost_total,notes,payload,created_by,client_ref)
  VALUES (ws,'return',num,'completed',CASE mode WHEN 'refund' THEN 'paid' ELSE 'credit' END,cust,
    coalesce((SELECT name FROM public.customers WHERE id = cust),nullif(left(trim(coalesce(_p->>'customer_name','')),120),''),'Walk-in'),
    (SELECT phone FROM public.customers WHERE id = cust),total,total,CASE mode WHEN 'refund' THEN total ELSE 0 END,CASE mode WHEN 'refund' THEN 0 ELSE total END,cost_total,
    left(coalesce(_p->>'reason',''),300),jsonb_build_object('unlinked',true,'items',_p->'items'),uid,cref)
  RETURNING id INTO sid;
  FOR it IN SELECT * FROM jsonb_array_elements(_p->'items') LOOP
    prod := (it->>'product_id')::uuid; qty := (it->>'qty')::numeric; rate := (it->>'rate')::numeric;
    SELECT purchase_price INTO pr FROM public.products WHERE id = prod AND workspace_id = ws FOR UPDATE;
    line_total := round(qty * rate,2);
    INSERT INTO public.pos_sale_items(sale_id,workspace_id,product_id,name,unit,rate_type,qty,stock_qty,rate,cost,line_total)
    VALUES(sid,ws,prod,it->>'name',left(coalesce(it->>'unit',''),40),'sale',qty,qty,round(rate,2),round(coalesce(pr.purchase_price,0)*qty,2),line_total);
    IF coalesce(cfg->'inventory'->>'trackStock','true') <> 'false' THEN PERFORM public.pos_move_stock(ws,prod,qty,'sale_return',sid,num); END IF;
  END LOOP;
  IF mode = 'refund' THEN
    INSERT INTO public.pos_payments(workspace_id,direction,method,amount,customer_id,sale_id,kind,created_by)
    VALUES(ws,'out',method,total,cust,sid,'refund',uid);
  END IF;
  INSERT INTO public.audit_log(workspace_id,action,entity,entity_id,details,created_by)
  VALUES(ws,'create','pos_return',sid,jsonb_build_object('number',num,'total',total,'unlinked',true),uid);
  RETURN jsonb_build_object('id',sid,'number',num,'total',total);
END $$;
REVOKE ALL ON FUNCTION public.pos_save_unlinked_return(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_save_unlinked_return(jsonb) TO authenticated;