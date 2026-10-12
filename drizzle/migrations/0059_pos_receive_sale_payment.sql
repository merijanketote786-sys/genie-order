CREATE OR REPLACE FUNCTION public.pos_receive_sale_payment(_sale uuid, _amount numeric, _method text, _note text, _ref uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ws uuid := public.current_workspace(); uid uuid := auth.uid(); s record; amt numeric := round(_amount,2); pid uuid; nb numeric; np numeric;
BEGIN
  IF uid IS NULL OR NOT public.is_active_team_member(uid) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF amt IS NULL OR amt <= 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  IF coalesce(_method,'') = '' OR _method = 'Credit' THEN RAISE EXCEPTION 'Choose a payment method'; END IF;
  IF _ref IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(ws::text || _ref::text));
    SELECT id INTO pid FROM public.pos_payments WHERE workspace_id = ws AND client_ref = _ref;
    IF FOUND THEN RETURN jsonb_build_object('payment_id', pid, 'duplicate', true); END IF;
  END IF;
  SELECT * INTO s FROM public.pos_sales WHERE id = _sale AND workspace_id = ws FOR UPDATE;
  IF s IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF s.doc_type <> 'sale' OR s.status = 'cancelled' THEN RAISE EXCEPTION 'Payment can only be received on an active sale invoice'; END IF;
  IF amt > s.balance + 0.005 THEN RAISE EXCEPTION 'Amount is more than the invoice balance (%)', s.balance; END IF;
  INSERT INTO public.pos_payments(workspace_id, direction, method, amount, customer_id, sale_id, kind, note, created_by, client_ref)
  VALUES (ws, 'in', left(_method,30), amt, s.customer_id, s.id, 'sale', nullif(left(coalesce(_note,''),300),''), uid, _ref) RETURNING id INTO pid;
  np := round(s.paid_total + amt, 2); nb := greatest(round(s.grand_total - np, 2), 0);
  UPDATE public.pos_sales SET paid_total = np, balance = nb, payment_status = CASE WHEN nb <= 0.005 THEN 'paid' ELSE 'partial' END WHERE id = s.id;
  IF nb <= 0.005 AND s.invoice_id IS NOT NULL THEN
    UPDATE public.invoices SET payment_status = 'paid', paid_at = now() WHERE id = s.invoice_id;
  END IF;
  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by)
  VALUES (ws, 'receive_payment', 'pos_sale', s.id, jsonb_build_object('amount',amt,'method',_method,'payment_id',pid), uid);
  RETURN jsonb_build_object('payment_id', pid, 'paid_total', np, 'balance', nb);
END $$;
REVOKE ALL ON FUNCTION public.pos_receive_sale_payment(uuid, numeric, text, text, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pos_receive_sale_payment(uuid, numeric, text, text, uuid) TO authenticated, service_role;