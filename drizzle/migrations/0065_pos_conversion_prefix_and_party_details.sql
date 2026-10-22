DO $migration$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.pos_save_doc_v2(jsonb)'::regprocedure) INTO definition;
  definition := replace(definition, 'public.pos_save_doc_v2(', 'public.pos_save_doc_v3(');
  definition := replace(definition, 'to_jsonb(source_doc.doc_number)', 'to_jsonb(CASE WHEN dtype = ''sale'' THEN regexp_replace(source_doc.doc_number, ''^QT'', ''INV'') ELSE source_doc.doc_number END)');
  EXECUTE definition;
END;
$migration$;
REVOKE ALL ON FUNCTION public.pos_save_doc_v3(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_save_doc_v3(jsonb) TO authenticated;
COMMENT ON FUNCTION public.pos_save_doc_v3(jsonb) IS 'Additive POS save: estimate edits retain their number; invoice conversion replaces QT with INV only; v2 remains for existing callers.';

CREATE FUNCTION public.pos_edit_party_details(_customer uuid, _supplier uuid, _details jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $function$
DECLARE ws uuid := public.current_workspace(); uid uuid := auth.uid();
BEGIN
  IF uid IS NULL OR ws IS NULL OR NOT public.is_active_team_member(uid) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF _customer IS NULL AND _supplier IS NULL THEN RAISE EXCEPTION 'Party not found'; END IF;
  IF length(trim(coalesce(_details->>'name',''))) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Party name is required (max 120 characters)'; END IF;
  IF length(coalesce(_details->>'phone','')) > 30 OR length(coalesce(_details->>'address','')) > 300 THEN RAISE EXCEPTION 'Party details too long'; END IF;
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
    UPDATE public.customers SET name=trim(_details->>'name'), phone=coalesce(_details->>'phone',''), address=nullif(_details->>'address',''), updated_at=now() WHERE id=_customer AND workspace_id=ws;
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