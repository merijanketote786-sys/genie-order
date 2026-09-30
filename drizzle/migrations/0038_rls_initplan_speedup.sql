DO $$
DECLARE r record; q text; c text;
  FUNCTION_RX text := 'SELECT (is_active_team_member|has_role|current_workspace)';
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname, qual, with_check FROM pg_policies WHERE schemaname = 'public' LOOP
    q := r.qual; c := r.with_check;
    IF q IS NOT NULL AND q !~ FUNCTION_RX THEN
      q := regexp_replace(q, 'is_active_team_member\(auth\.uid\(\)\)', '(SELECT is_active_team_member(auth.uid()))', 'g');
      q := regexp_replace(q, 'has_role\(auth\.uid\(\), (''\w+''::app_role)\)', '(SELECT has_role(auth.uid(), \1))', 'g');
      q := regexp_replace(q, '(?<!SELECT )current_workspace\(\)', '(SELECT current_workspace())', 'g');
    END IF;
    IF c IS NOT NULL AND c !~ FUNCTION_RX THEN
      c := regexp_replace(c, 'is_active_team_member\(auth\.uid\(\)\)', '(SELECT is_active_team_member(auth.uid()))', 'g');
      c := regexp_replace(c, 'has_role\(auth\.uid\(\), (''\w+''::app_role)\)', '(SELECT has_role(auth.uid(), \1))', 'g');
      c := regexp_replace(c, '(?<!SELECT )current_workspace\(\)', '(SELECT current_workspace())', 'g');
    END IF;
    IF q IS DISTINCT FROM r.qual THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)', r.policyname, r.schemaname, r.tablename, q);
    END IF;
    IF c IS DISTINCT FROM r.with_check THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)', r.policyname, r.schemaname, r.tablename, c);
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS products_ws_scope_active_idx ON public.products (workspace_id, scope, is_active);
CREATE INDEX IF NOT EXISTS customers_ws_created_idx ON public.customers (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_ws_created_idx ON public.orders (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS invoices_ws_created_idx ON public.invoices (workspace_id, created_at DESC);