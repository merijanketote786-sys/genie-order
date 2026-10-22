-- Preserve the existing conversion implementation and permission checks; add guards before any writes.
DO $migration$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.pos_convert_purchase_order(jsonb)'::regprocedure) INTO definition;
  IF position('  IF oid IS NULL THEN' IN definition) = 0 OR position('  sup := coalesce(nullif(_p->>''supplier_id'','''')::uuid, ord.supplier_id);' IN definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected purchase order conversion definition';
  END IF;
  definition := replace(definition, '  IF oid IS NULL THEN', E'  IF coalesce(nullif(current_setting(''request.headers'', true), '''')::jsonb->>''x-pos-store'', '''') = ''all-stores'' THEN\n    RAISE EXCEPTION ''Select a specific store before saving a purchase'';\n  END IF;\n  IF oid IS NULL THEN');
  definition := replace(definition, '  sup := coalesce(nullif(_p->>''supplier_id'','''')::uuid, ord.supplier_id);', E'  sup := coalesce(nullif(_p->>''supplier_id'','''')::uuid, ord.supplier_id);\n  IF paid < gt AND sup IS NULL THEN\n    RAISE EXCEPTION ''Select a party for a credit purchase'';\n  END IF;');
  EXECUTE definition;
END $migration$;