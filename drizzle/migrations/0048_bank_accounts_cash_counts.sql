ALTER TABLE public.acc_accounts ADD COLUMN IF NOT EXISTS is_payment boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.acc_money(_ws uuid, _method text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT coalesce(
    (SELECT id FROM public.acc_accounts WHERE workspace_id = _ws AND is_payment AND is_active AND lower(name) = lower(coalesce(_method,'')) LIMIT 1),
    public.acc_sys(_ws, CASE WHEN _method = 'Cash' THEN 'cash' ELSE 'bank' END))
$$;

DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.acc_post_source(text,uuid)'::regprocedure);
  d := replace(d, $x$public.acc_sys(ws, CASE WHEN s.method = 'Cash' THEN 'cash' ELSE 'bank' END)$x$, 'public.acc_money(ws, s.method)');
  EXECUTE d;
  d := pg_get_functiondef('public.pos_save_cash_entry(jsonb)'::regprocedure);
  d := replace(d, $x$public.acc_sys(ws, CASE WHEN coalesce(_p->>'method','Cash') = 'Cash' THEN 'cash' ELSE 'bank' END)$x$, $x$public.acc_money(ws, coalesce(_p->>'method','Cash'))$x$);
  d := replace(d, $x$acc := CASE WHEN dir = 'out'$x$, $x$acc := CASE WHEN (_p->>'category') IN ('Cash adjustment','Balance adjustment','Opening cash','Opening balance') THEN public.acc_sys(ws,'opening_equity') WHEN dir = 'out'$x$);
  EXECUTE d;
END $do$;

CREATE OR REPLACE FUNCTION public.pos_add_bank_account(_name text, _opening numeric) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ws uuid := public.current_workspace(); nid uuid; nm text := btrim(_name); code text; n int;
BEGIN
  IF NOT (public.pos_can('manage_accounts') OR public.pos_can('settings')) THEN RAISE EXCEPTION 'permission denied'; END IF;
  IF nm IS NULL OR length(nm) < 2 OR length(nm) > 60 OR lower(nm) IN ('cash','credit') THEN RAISE EXCEPTION 'Invalid account name'; END IF;
  IF EXISTS (SELECT 1 FROM public.acc_accounts WHERE workspace_id = ws AND lower(name) = lower(nm) AND is_payment) THEN RAISE EXCEPTION 'An account with this name already exists'; END IF;
  PERFORM public.acc_ensure_accounts(ws);
  SELECT count(*) INTO n FROM public.acc_accounts WHERE workspace_id = ws AND code LIKE '101%';
  code := (1010 + n)::text;
  WHILE EXISTS (SELECT 1 FROM public.acc_accounts WHERE workspace_id = ws AND acc_accounts.code = pos_add_bank_account.code) LOOP code := (code::int + 1)::text; END LOOP;
  INSERT INTO public.acc_accounts(workspace_id, code, name, type, parent_id, opening_balance, is_active, is_system, is_payment)
  VALUES (ws, code, nm, 'asset', public.acc_sys(ws,'bank'), coalesce(_opening,0), true, false, true) RETURNING id INTO nid;
  UPDATE public.pos_settings SET config = jsonb_set(coalesce(config,'{}'::jsonb), '{payments,custom}',
    coalesce(config->'payments'->'custom','[]'::jsonb) || to_jsonb(nm), true)
  WHERE workspace_id = ws AND NOT coalesce(config->'payments'->'custom','[]'::jsonb) ? nm;
  RETURN nid;
END $$;
GRANT EXECUTE ON FUNCTION public.pos_add_bank_account(text, numeric) TO authenticated;

CREATE TABLE public.pos_cash_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL DEFAULT public.current_workspace(),
  count_date date NOT NULL,
  counted numeric NOT NULL,
  expected numeric NOT NULL,
  note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, count_date)
);
GRANT SELECT ON public.pos_cash_counts TO authenticated;
GRANT ALL ON public.pos_cash_counts TO service_role;
ALTER TABLE public.pos_cash_counts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws read cash counts" ON public.pos_cash_counts FOR SELECT TO authenticated
  USING (workspace_id = public.current_workspace() AND (public.pos_can('view_reports') OR public.pos_can('manage_expenses')));

CREATE OR REPLACE FUNCTION public.pos_save_cash_count(_date date, _counted numeric, _expected numeric, _note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT (public.pos_can('manage_expenses') OR public.pos_can('view_reports')) THEN RAISE EXCEPTION 'permission denied'; END IF;
  IF _counted IS NULL OR _counted < 0 THEN RAISE EXCEPTION 'Invalid amount'; END IF;
  INSERT INTO public.pos_cash_counts(workspace_id, count_date, counted, expected, note)
  VALUES (public.current_workspace(), _date, _counted, coalesce(_expected,0), nullif(_note,''))
  ON CONFLICT (workspace_id, count_date) DO UPDATE SET counted = EXCLUDED.counted, expected = EXCLUDED.expected, note = EXCLUDED.note, created_by = auth.uid(), created_at = now();
END $$;
GRANT EXECUTE ON FUNCTION public.pos_save_cash_count(date, numeric, numeric, text) TO authenticated;