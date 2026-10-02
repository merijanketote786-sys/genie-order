CREATE OR REPLACE FUNCTION public.pos_cancel_purchase(_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ws uuid := public.current_workspace(); p record; it record; cfg jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_team_member(auth.uid()) THEN RAISE EXCEPTION 'Access denied'; END IF;
  IF NOT public.pos_can('manage_purchases') THEN RAISE EXCEPTION 'Purchase permission required'; END IF;
  SELECT * INTO p FROM public.purchases WHERE id = _id AND workspace_id = ws FOR UPDATE;
  IF p IS NULL OR p.status = 'cancelled' THEN RAISE EXCEPTION 'Purchase not found or already cancelled'; END IF;
  IF p.doc_type = 'purchase' AND EXISTS (SELECT 1 FROM public.purchases r WHERE r.ref_purchase_id = _id AND r.status <> 'cancelled') THEN
    RAISE EXCEPTION 'Cancel the returns of this purchase first';
  END IF;
  SELECT config INTO cfg FROM public.pos_settings WHERE workspace_id = ws;
  IF coalesce(cfg->'inventory'->>'trackStock','true') <> 'false' THEN
    FOR it IN SELECT * FROM public.purchase_items WHERE purchase_id = _id LOOP
      PERFORM public.pos_move_stock(ws, it.product_id, CASE p.doc_type WHEN 'purchase' THEN -it.qty ELSE it.qty END, 'cancel', _id, 'Cancel ' || p.doc_number);
    END LOOP;
  END IF;
  UPDATE public.pos_payments SET status = 'cancelled' WHERE purchase_id = _id;
  UPDATE public.purchases SET status = 'cancelled', updated_at = now() WHERE id = _id;
  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by)
  VALUES (ws, 'cancel', 'purchase', _id, jsonb_build_object('reason', _reason, 'number', p.doc_number), auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.pos_cancel_purchase(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pos_cancel_purchase(uuid, text) TO authenticated;