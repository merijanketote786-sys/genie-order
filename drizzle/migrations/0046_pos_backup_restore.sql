CREATE OR REPLACE FUNCTION public.pos_restore_table(_t text, _rows jsonb, _ws uuid, _strip text[], _upsert boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer := 0; cols text;
BEGIN
  IF _rows IS NULL OR jsonb_typeof(_rows) <> 'array' OR jsonb_array_length(_rows) = 0 THEN RETURN 0; END IF;
  CREATE TEMP TABLE IF NOT EXISTS _rst(r jsonb) ON COMMIT DROP;
  TRUNCATE _rst;
  INSERT INTO _rst
  SELECT (CASE WHEN r ? 'created_by' AND (r->>'created_by') IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id::text = r->>'created_by')
          THEN r - 'created_by' ELSE r END) - _strip || jsonb_build_object('workspace_id', _ws)
  FROM jsonb_array_elements(_rows) r;
  IF _upsert THEN
    SELECT string_agg(format('%I = EXCLUDED.%I', column_name, column_name), ', ') INTO cols
    FROM information_schema.columns WHERE table_schema='public' AND table_name=_t
      AND column_name <> ALL (ARRAY['id','workspace_id'] || _strip);
    EXECUTE format('INSERT INTO public.%I SELECT (jsonb_populate_record(NULL::public.%I, r)).* FROM _rst ON CONFLICT (id) DO UPDATE SET %s', _t, _t, cols);
  ELSE
    EXECUTE format('INSERT INTO public.%I SELECT (jsonb_populate_record(NULL::public.%I, r)).* FROM _rst ON CONFLICT DO NOTHING', _t, _t);
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.pos_restore_table(text, jsonb, uuid, text[], boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pos_restore_selfref(_t text, _col text, _rows jsonb, _ws uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _rows IS NULL OR jsonb_typeof(_rows) <> 'array' THEN RETURN; END IF;
  EXECUTE format('UPDATE public.%I t SET %I = (r->>%L)::uuid FROM jsonb_array_elements($1) r
    WHERE t.id = (r->>''id'')::uuid AND t.workspace_id = $2 AND r->>%L IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.%I x WHERE x.id = (r->>%L)::uuid)', _t, _col, _col, _col, _t, _col)
  USING _rows, _ws;
END $$;
REVOKE ALL ON FUNCTION public.pos_restore_selfref(text, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pos_restore_backup(_data jsonb, _mode text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ws uuid := public.current_workspace();
  t text; res jsonb := '{}'::jsonb; n integer;
  trig_tables text[] := ARRAY['pos_stores','customers','suppliers','products','pos_store_stock','pos_recipes','pos_sales','pos_sale_items','purchases','purchase_items','pos_payments','expenses','stock_movements','acc_accounts','acc_journals','acc_journal_lines','acc_settings','att_labour','att_days','att_payments'];
  up boolean := _mode = 'replace';
BEGIN
  IF ws IS NULL OR NOT public.pos_can('settings') THEN RAISE EXCEPTION 'permission denied'; END IF;
  IF _mode NOT IN ('merge','replace') THEN RAISE EXCEPTION 'invalid mode'; END IF;
  IF jsonb_typeof(_data) <> 'object' THEN RAISE EXCEPTION 'invalid backup'; END IF;

  FOREACH t IN ARRAY trig_tables LOOP EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', t); END LOOP;

  IF _mode = 'replace' THEN
    UPDATE acc_journals SET reversal_of = NULL, reversed_by = NULL WHERE workspace_id = ws;
    DELETE FROM acc_journal_lines WHERE workspace_id = ws;
    DELETE FROM acc_journals WHERE workspace_id = ws;
    DELETE FROM pos_payments WHERE workspace_id = ws;
    DELETE FROM pos_sale_items WHERE workspace_id = ws;
    UPDATE pos_sales SET ref_sale_id = NULL WHERE workspace_id = ws;
    DELETE FROM pos_sales WHERE workspace_id = ws;
    DELETE FROM purchase_items WHERE workspace_id = ws;
    UPDATE purchases SET ref_purchase_id = NULL WHERE workspace_id = ws;
    DELETE FROM purchases WHERE workspace_id = ws;
    DELETE FROM expenses WHERE workspace_id = ws;
    DELETE FROM stock_movements WHERE workspace_id = ws;
    DELETE FROM pos_store_stock WHERE workspace_id = ws;
    DELETE FROM pos_recipes WHERE workspace_id = ws;
    DELETE FROM att_payments WHERE workspace_id = ws;
    DELETE FROM att_days WHERE workspace_id = ws;
  END IF;

  res := res || jsonb_build_object('pos_stores', pos_restore_table('pos_stores', _data->'pos_stores', ws, '{}', up));
  res := res || jsonb_build_object('customers', pos_restore_table('customers', _data->'customers', ws, '{}', false));
  res := res || jsonb_build_object('suppliers', pos_restore_table('suppliers', _data->'suppliers', ws, '{}', false));
  res := res || jsonb_build_object('products', pos_restore_table('products', _data->'products', ws, '{}', up));
  res := res || jsonb_build_object('pos_store_stock', pos_restore_table('pos_store_stock', _data->'pos_store_stock', ws, '{}', false));
  res := res || jsonb_build_object('pos_recipes', pos_restore_table('pos_recipes', _data->'pos_recipes', ws, '{}', false));
  res := res || jsonb_build_object('pos_sales', pos_restore_table('pos_sales', _data->'pos_sales', ws, ARRAY['ref_sale_id','invoice_id'], false));
  PERFORM pos_restore_selfref('pos_sales', 'ref_sale_id', _data->'pos_sales', ws);
  res := res || jsonb_build_object('pos_sale_items', pos_restore_table('pos_sale_items', _data->'pos_sale_items', ws, '{}', false));
  res := res || jsonb_build_object('purchases', pos_restore_table('purchases', _data->'purchases', ws, ARRAY['ref_purchase_id'], false));
  PERFORM pos_restore_selfref('purchases', 'ref_purchase_id', _data->'purchases', ws);
  res := res || jsonb_build_object('purchase_items', pos_restore_table('purchase_items', _data->'purchase_items', ws, '{}', false));
  res := res || jsonb_build_object('pos_payments', pos_restore_table('pos_payments', _data->'pos_payments', ws, '{}', false));
  res := res || jsonb_build_object('expenses', pos_restore_table('expenses', _data->'expenses', ws, '{}', false));
  res := res || jsonb_build_object('stock_movements', pos_restore_table('stock_movements', _data->'stock_movements', ws, '{}', false));
  res := res || jsonb_build_object('acc_accounts', pos_restore_table('acc_accounts', _data->'acc_accounts', ws, ARRAY['parent_id'], false));
  PERFORM pos_restore_selfref('acc_accounts', 'parent_id', _data->'acc_accounts', ws);
  res := res || jsonb_build_object('acc_journals', pos_restore_table('acc_journals', _data->'acc_journals', ws, ARRAY['reversal_of','reversed_by'], false));
  PERFORM pos_restore_selfref('acc_journals', 'reversal_of', _data->'acc_journals', ws);
  PERFORM pos_restore_selfref('acc_journals', 'reversed_by', _data->'acc_journals', ws);
  res := res || jsonb_build_object('acc_journal_lines', pos_restore_table('acc_journal_lines', _data->'acc_journal_lines', ws, '{}', false));
  res := res || jsonb_build_object('acc_settings', pos_restore_table('acc_settings', _data->'acc_settings', ws, '{}', false));
  res := res || jsonb_build_object('att_labour', pos_restore_table('att_labour', _data->'att_labour', ws, '{}', up));
  res := res || jsonb_build_object('att_days', pos_restore_table('att_days', _data->'att_days', ws, '{}', false));
  res := res || jsonb_build_object('att_payments', pos_restore_table('att_payments', _data->'att_payments', ws, '{}', false));

  IF _mode = 'replace' AND jsonb_typeof(_data->'pos_settings_config') = 'object' THEN
    UPDATE pos_settings SET config = _data->'pos_settings_config', updated_at = now() WHERE workspace_id = ws;
  END IF;

  FOREACH t IN ARRAY trig_tables LOOP EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', t); END LOOP;

  INSERT INTO audit_log(workspace_id, action, entity, details, created_by)
  VALUES (ws, 'restore', 'pos', jsonb_build_object('mode', _mode, 'rows', res), auth.uid());
  RETURN res;
END $$;
REVOKE ALL ON FUNCTION public.pos_restore_backup(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_restore_backup(jsonb, text) TO authenticated;

-- Daily Drive backup log
CREATE TABLE IF NOT EXISTS public.pos_backup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  target text NOT NULL,
  status text NOT NULL,
  file_name text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pos_backup_runs TO authenticated;
GRANT ALL ON public.pos_backup_runs TO service_role;
ALTER TABLE public.pos_backup_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "workspace reads backup runs" ON public.pos_backup_runs FOR SELECT TO authenticated
  USING (workspace_id = public.current_workspace());