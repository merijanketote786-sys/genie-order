CREATE OR REPLACE FUNCTION public.pos_party_payment(_kind text, _party uuid, _amount numeric, _method text, _note text, _ref uuid DEFAULT NULL::uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE ws uuid := public.current_workspace(); uid uuid := auth.uid(); pid uuid; amt numeric := round(_amount,2);
BEGIN
  IF uid IS NULL OR NOT public.is_active_team_member(uid) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF amt IS NULL OR amt <= 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  IF _ref IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(ws::text || _ref::text));
    SELECT id INTO pid FROM public.pos_payments WHERE workspace_id = ws AND client_ref = _ref;
    IF FOUND THEN RETURN pid; END IF;
  END IF;
  IF _kind IN ('supplier_payment','supplier_receipt') THEN
    IF NOT public.pos_can('manage_purchases') THEN RAISE EXCEPTION 'Purchase permission required'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.suppliers WHERE id = _party AND workspace_id = ws) THEN RAISE EXCEPTION 'Supplier not found'; END IF;
    INSERT INTO public.pos_payments(workspace_id, direction, method, amount, supplier_id, kind, note, created_by, client_ref)
    VALUES (ws, CASE WHEN _kind = 'supplier_payment' THEN 'out' ELSE 'in' END, _method, amt, _party,
            CASE WHEN _kind = 'supplier_payment' THEN 'supplier_payment' ELSE 'purchase_refund' END, _note, uid, _ref) RETURNING id INTO pid;
  ELSIF _kind IN ('receipt','customer_payment_out') THEN
    IF NOT EXISTS (SELECT 1 FROM public.customers WHERE id = _party AND workspace_id = ws) THEN RAISE EXCEPTION 'Customer not found'; END IF;
    INSERT INTO public.pos_payments(workspace_id, direction, method, amount, customer_id, kind, note, created_by, client_ref)
    VALUES (ws, CASE WHEN _kind = 'receipt' THEN 'in' ELSE 'out' END, _method, amt, _party,
            CASE WHEN _kind = 'receipt' THEN 'receipt' ELSE 'refund' END, _note, uid, _ref) RETURNING id INTO pid;
  ELSE RAISE EXCEPTION 'Invalid payment type'; END IF;
  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by)
  VALUES (ws, 'create', _kind, pid, jsonb_build_object('amount',amt,'method',_method), uid);
  RETURN pid;
END $function$;