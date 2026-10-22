CREATE OR REPLACE FUNCTION public.pos_edit_party_details(_customer uuid, _supplier uuid, _details jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $function$
DECLARE ws uuid := public.current_workspace(); uid uuid := auth.uid(); cl numeric;
BEGIN
  IF uid IS NULL OR ws IS NULL OR NOT public.is_active_team_member(uid) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF _customer IS NULL AND _supplier IS NULL THEN RAISE EXCEPTION 'Party not found'; END IF;
  IF length(trim(coalesce(_details->>'name',''))) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Party name is required (max 120 characters)'; END IF;
  IF length(coalesce(_details->>'phone','')) > 30 OR length(coalesce(_details->>'address','')) > 300
     OR length(coalesce(_details->>'city','')) > 80 OR length(coalesce(_details->>'email','')) > 160
     OR length(coalesce(_details->>'courier','')) > 120 OR length(coalesce(_details->>'adda','')) > 120 THEN RAISE EXCEPTION 'Party details too long'; END IF;
  IF _details ? 'creditLimit' AND nullif(_details->>'creditLimit','') IS NOT NULL THEN
    cl := (_details->>'creditLimit')::numeric;
    IF cl < 0 OR cl > 1000000000 THEN RAISE EXCEPTION 'Invalid credit limit'; END IF;
  END IF;
  IF _customer IS NOT NULL THEN
    PERFORM 1 FROM public.customers c WHERE c.id = _customer AND c.workspace_id = ws AND
      (c.pos_scoped OR EXISTS (SELECT 1 FROM public.pos_sales s WHERE s.customer_id=c.id AND s.workspace_id=ws AND s.doc_type IN ('sale','return')) OR EXISTS (SELECT 1 FROM public.pos_payments p WHERE p.customer_id=c.id AND p.workspace_id=ws)) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'POS party not found'; END IF;
  END IF;
  IF _supplier IS NOT NULL THEN
    PERFORM 1 FROM public.suppliers WHERE id = _supplier AND workspace_id = ws AND is_active FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Party not found'; END IF;
  END IF;
  IF _customer IS NOT NULL THEN
    UPDATE public.customers SET name=trim(_details->>'name'), phone=coalesce(_details->>'phone',''), address=nullif(_details->>'address',''),
      city = CASE WHEN _details ? 'city' THEN nullif(trim(_details->>'city'),'') ELSE city END,
      email = CASE WHEN _details ? 'email' THEN nullif(trim(_details->>'email'),'') ELSE email END,
      courier_service_name = CASE WHEN _details ? 'courier' THEN nullif(trim(_details->>'courier'),'') ELSE courier_service_name END,
      goods_adda_name = CASE WHEN _details ? 'adda' THEN nullif(trim(_details->>'adda'),'') ELSE goods_adda_name END,
      credit_limit = CASE WHEN _details ? 'creditLimit' THEN coalesce(cl, 0) ELSE credit_limit END,
      updated_at=now() WHERE id=_customer AND workspace_id=ws;
    IF NOT FOUND THEN RAISE EXCEPTION 'Party could not be saved'; END IF;
  END IF;
  IF _supplier IS NOT NULL THEN
    UPDATE public.suppliers SET name=trim(_details->>'name'), phone=nullif(_details->>'phone',''), address=nullif(_details->>'address','') WHERE id=_supplier AND workspace_id=ws;
    IF NOT FOUND THEN RAISE EXCEPTION 'Party could not be saved'; END IF;
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.pos_edit_party_details(uuid,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_edit_party_details(uuid,uuid,jsonb) TO authenticated;