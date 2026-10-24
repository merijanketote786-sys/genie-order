DO $migration$
DECLARE definition text; mirror_start integer; mirror_end integer; legacy_update text := '    UPDATE public.invoices SET payment_status = ''cancelled'' WHERE id = s.invoice_id;';
BEGIN
  SELECT pg_get_functiondef('public.pos_save_sale(jsonb)'::regprocedure) INTO definition;
  mirror_start := strpos(definition, E'  IF dtype = ''sale'' THEN\n    INSERT INTO public.invoices(');
  mirror_end := strpos(definition, E'  IF edit_id IS NOT NULL THEN\n    UPDATE public.pos_sales SET status = ''converted''');
  IF mirror_start = 0 OR mirror_end <= mirror_start THEN
    RAISE EXCEPTION 'Unexpected POS save function shape; no changes applied';
  END IF;
  definition := substr(definition, 1, mirror_start - 1) || E'  -- POS invoices are stored only in pos_sales and pos_sale_items.\n\n' || substr(definition, mirror_end);
  EXECUTE definition;
  SELECT pg_get_functiondef('public.pos_cancel_sale_core(uuid,text)'::regprocedure) INTO definition;
  IF strpos(definition, legacy_update) = 0 THEN
    RAISE EXCEPTION 'Unexpected POS cancel function shape; no changes applied';
  END IF;
  EXECUTE replace(definition, legacy_update, '    -- Workspace invoice mirrors are legacy records; POS cancellation stays in POS.');
END $migration$;
COMMENT ON COLUMN public.pos_sales.invoice_id IS 'DEPRECATED: legacy Workspace invoice mirror link. New POS invoices are stored only in pos_sales/pos_sale_items; retained for historical references.';