DO $migration$
DECLARE definition text; legacy text := E'  IF nb <= 0.005 AND s.invoice_id IS NOT NULL THEN\n    UPDATE public.invoices SET payment_status = ''paid'', paid_at = now() WHERE id = s.invoice_id;\n  END IF;';
BEGIN
  SELECT pg_get_functiondef('public.pos_receive_sale_payment(uuid,numeric,text,text,uuid)'::regprocedure) INTO definition;
  IF strpos(definition, legacy) = 0 THEN RAISE EXCEPTION 'Unexpected receive-payment function shape; no changes applied'; END IF;
  EXECUTE replace(definition,legacy,'  -- Payment status belongs to the POS invoice; do not write legacy Workspace mirrors.');
END $migration$;