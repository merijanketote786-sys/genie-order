
-- ================= Permissions =================
CREATE OR REPLACE FUNCTION public.pos_perms(_role text)
 RETURNS text[] LANGUAGE sql IMMUTABLE
AS $function$
  SELECT CASE _role
    WHEN 'admin' THEN ARRAY['view_pos','create_sale','edit_sale','return_sale','edit_price','apply_discount','cancel_invoice','view_reports','view_profit','edit_stock','edit_products','view_balances','manage_customers','manage_suppliers','manage_expenses','manage_purchases','manage_printers','manage_users','settings',
      'view_accounting','create_journal','post_journal','view_ledger','view_trial_balance','view_pnl','view_balance_sheet','view_ar_ap','manage_accounts','close_period']
    WHEN 'manager' THEN ARRAY['view_pos','create_sale','edit_sale','return_sale','edit_price','apply_discount','cancel_invoice','view_reports','view_profit','edit_stock','edit_products','view_balances','manage_customers','manage_suppliers','manage_expenses','manage_purchases','manage_printers',
      'view_accounting','create_journal','view_ledger','view_trial_balance','view_pnl','view_balance_sheet','view_ar_ap']
    WHEN 'salesman' THEN ARRAY['view_pos','create_sale','return_sale','apply_discount','view_balances','manage_customers']
    WHEN 'cashier' THEN ARRAY['view_pos','create_sale','return_sale','view_balances','manage_expenses','manage_customers']
    ELSE ARRAY['view_pos','create_sale'] END
$function$;

-- ================= Tables =================
CREATE TABLE public.acc_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('asset','liability','equity','income','cogs','expense')),
  parent_id uuid REFERENCES public.acc_accounts(id) ON DELETE RESTRICT,
  opening_balance numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  system_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, code)
);
CREATE UNIQUE INDEX acc_accounts_sys_key ON public.acc_accounts(workspace_id, system_key) WHERE system_key IS NOT NULL;
GRANT SELECT ON public.acc_accounts TO authenticated;
GRANT ALL ON public.acc_accounts TO service_role;
ALTER TABLE public.acc_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acc accounts read" ON public.acc_accounts FOR SELECT TO authenticated
  USING (workspace_id = public.current_workspace() AND public.pos_can('view_accounting'));

CREATE TABLE public.acc_journals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  entry_date date NOT NULL,
  reference text,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','cancelled')),
  source_type text NOT NULL DEFAULT 'manual',
  source_id uuid,
  reversal_of uuid REFERENCES public.acc_journals(id),
  reversed_by uuid REFERENCES public.acc_journals(id),
  total numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  posted_at timestamptz,
  posted_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX acc_journals_source_uq ON public.acc_journals(workspace_id, source_type, source_id) WHERE source_id IS NOT NULL;
CREATE INDEX acc_journals_ws_date ON public.acc_journals(workspace_id, entry_date);
GRANT SELECT ON public.acc_journals TO authenticated;
GRANT ALL ON public.acc_journals TO service_role;
ALTER TABLE public.acc_journals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acc journals read" ON public.acc_journals FOR SELECT TO authenticated
  USING (workspace_id = public.current_workspace() AND public.pos_can('view_accounting'));

CREATE TABLE public.acc_journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id uuid NOT NULL REFERENCES public.acc_journals(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES public.acc_accounts(id) ON DELETE RESTRICT,
  debit numeric NOT NULL DEFAULT 0,
  credit numeric NOT NULL DEFAULT 0,
  memo text,
  line_no int NOT NULL DEFAULT 0,
  CHECK (debit >= 0 AND credit >= 0 AND (debit = 0 OR credit = 0) AND (debit + credit) > 0)
);
CREATE INDEX acc_lines_journal ON public.acc_journal_lines(journal_id);
CREATE INDEX acc_lines_account ON public.acc_journal_lines(workspace_id, account_id);
GRANT SELECT ON public.acc_journal_lines TO authenticated;
GRANT ALL ON public.acc_journal_lines TO service_role;
ALTER TABLE public.acc_journal_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acc lines read" ON public.acc_journal_lines FOR SELECT TO authenticated
  USING (workspace_id = public.current_workspace() AND public.pos_can('view_accounting'));

CREATE TABLE public.acc_settings (
  workspace_id uuid PRIMARY KEY,
  fy_start date,
  fy_end date,
  lock_date date,
  credit_days int NOT NULL DEFAULT 30,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT ON public.acc_settings TO authenticated;
GRANT ALL ON public.acc_settings TO service_role;
ALTER TABLE public.acc_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acc settings read" ON public.acc_settings FOR SELECT TO authenticated
  USING (workspace_id = public.current_workspace() AND public.pos_can('view_accounting'));

-- ================= Integrity guards =================
CREATE OR REPLACE FUNCTION public.acc_guard_journal() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE lk date;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'Posted or cancelled journals cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'posted' THEN
    IF NEW.status <> 'posted' OR NEW.entry_date <> OLD.entry_date OR NEW.total <> OLD.total
       OR NEW.source_id IS DISTINCT FROM OLD.source_id OR NEW.workspace_id <> OLD.workspace_id THEN
      RAISE EXCEPTION 'Posted journals cannot be edited. Reverse it instead.';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'Cancelled journals cannot be reopened';
  END IF;
  IF NEW.status = 'posted' AND (TG_OP = 'INSERT' OR OLD.status <> 'posted') THEN
    SELECT lock_date INTO lk FROM public.acc_settings WHERE workspace_id = NEW.workspace_id;
    IF lk IS NOT NULL AND NEW.entry_date <= lk THEN RAISE EXCEPTION 'Period is locked up to %', lk; END IF;
    IF (SELECT coalesce(sum(debit),0) <> coalesce(sum(credit),0) OR coalesce(sum(debit),0) = 0 FROM public.acc_journal_lines WHERE journal_id = NEW.id) THEN
      RAISE EXCEPTION 'Journal is not balanced (total debit must equal total credit)';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER acc_guard_journal BEFORE INSERT OR UPDATE OR DELETE ON public.acc_journals FOR EACH ROW EXECUTE FUNCTION public.acc_guard_journal();

CREATE OR REPLACE FUNCTION public.acc_guard_line() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE st text;
BEGIN
  SELECT status INTO st FROM public.acc_journals WHERE id = coalesce(NEW.journal_id, OLD.journal_id);
  IF st IS NOT NULL AND st <> 'draft' THEN RAISE EXCEPTION 'Lines of posted journals cannot be changed'; END IF;
  RETURN coalesce(NEW, OLD);
END $$;
CREATE TRIGGER acc_guard_line BEFORE INSERT OR UPDATE OR DELETE ON public.acc_journal_lines FOR EACH ROW EXECUTE FUNCTION public.acc_guard_line();

-- ================= Default chart =================
CREATE OR REPLACE FUNCTION public.acc_ensure_accounts(_ws uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  IF _ws IS NULL OR EXISTS (SELECT 1 FROM public.acc_accounts WHERE workspace_id = _ws AND system_key = 'other_expenses') THEN RETURN; END IF;
  FOR r IN SELECT * FROM (VALUES
    ('cash','1000','Cash','asset'),('bank','1010','Bank','asset'),('ar','1100','Accounts Receivable','asset'),
    ('inventory','1200','Inventory','asset'),
    ('ap','2000','Accounts Payable','liability'),('tax','2100','Sales Tax Payable','liability'),
    ('capital','3000','Capital','equity'),('drawings','3100','Drawings','equity'),
    ('retained','3200','Retained Earnings','equity'),('opening_equity','3900','Opening Balance Equity','equity'),
    ('sales','4000','Sales','income'),('sales_returns','4010','Sales Returns','income'),('other_income','4100','Other Income','income'),
    ('cogs','5000','Cost of Goods Sold','cogs'),('purchases','5100','Purchases','cogs'),('purchase_returns','5110','Purchase Returns','cogs'),
    ('expenses','6000','Expenses','expense'),('other_expenses','6900','Other Expenses','expense')
  ) v(k,c,n,t) LOOP
    INSERT INTO public.acc_accounts(workspace_id, code, name, type, is_system, system_key)
    VALUES (_ws, r.c, r.n, r.t, true, r.k)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.acc_sys(_ws uuid, _key text) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT id FROM public.acc_accounts WHERE workspace_id = _ws AND system_key = _key
$$;

CREATE OR REPLACE FUNCTION public.acc_expense_account(_ws uuid, _cat text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE pid uuid := public.acc_sys(_ws,'expenses'); aid uuid; n int;
BEGIN
  IF coalesce(trim(_cat),'') = '' THEN RETURN pid; END IF;
  SELECT id INTO aid FROM public.acc_accounts WHERE workspace_id = _ws AND parent_id = pid AND lower(name) = lower(trim(_cat));
  IF aid IS NOT NULL THEN RETURN aid; END IF;
  SELECT coalesce(max(code::int),6000) + 1 INTO n FROM public.acc_accounts WHERE workspace_id = _ws AND code ~ '^60[0-9]{2}$';
  WHILE EXISTS (SELECT 1 FROM public.acc_accounts WHERE workspace_id = _ws AND code = n::text) LOOP n := n + 1; END LOOP;
  INSERT INTO public.acc_accounts(workspace_id, code, name, type, parent_id) VALUES (_ws, n::text, left(trim(_cat),100), 'expense', pid) RETURNING id INTO aid;
  RETURN aid;
END $$;

-- ================= Journal creation helper =================
-- _lines: [{a: account uuid, d: numeric, c: numeric, m: memo}]
CREATE OR REPLACE FUNCTION public.acc_make_journal(_ws uuid, _date date, _ref text, _desc text, _stype text, _sid uuid, _lines jsonb, _reversal_of uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE jid uuid; l jsonb; td numeric := 0; tc numeric := 0; lk date; d date := _date; i int := 0; dv numeric; cv numeric;
BEGIN
  FOR l IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    td := td + round(coalesce((l->>'d')::numeric,0),2); tc := tc + round(coalesce((l->>'c')::numeric,0),2);
  END LOOP;
  IF td = 0 AND tc = 0 THEN RETURN NULL; END IF;
  IF td <> tc THEN RAISE EXCEPTION 'Unbalanced auto journal % %', _stype, _sid; END IF;
  SELECT lock_date INTO lk FROM public.acc_settings WHERE workspace_id = _ws;
  IF lk IS NOT NULL AND d <= lk THEN d := lk + 1; END IF;
  INSERT INTO public.acc_journals(workspace_id, entry_date, reference, description, status, source_type, source_id, reversal_of, total, created_by)
  VALUES (_ws, d, left(_ref,120), left(_desc,300), 'draft', _stype, _sid, _reversal_of, td, auth.uid())
  ON CONFLICT (workspace_id, source_type, source_id) WHERE source_id IS NOT NULL DO NOTHING
  RETURNING id INTO jid;
  IF jid IS NULL THEN RETURN NULL; END IF;
  FOR l IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    dv := round(coalesce((l->>'d')::numeric,0),2); cv := round(coalesce((l->>'c')::numeric,0),2);
    CONTINUE WHEN dv = 0 AND cv = 0;
    IF dv < 0 THEN cv := cv - dv; dv := 0; END IF;
    IF cv < 0 THEN dv := dv - cv; cv := 0; END IF;
    i := i + 1;
    INSERT INTO public.acc_journal_lines(journal_id, workspace_id, account_id, debit, credit, memo, line_no)
    VALUES (jid, _ws, (l->>'a')::uuid, dv, cv, l->>'m', i);
  END LOOP;
  UPDATE public.acc_journals SET status = 'posted', posted_at = now(), posted_by = auth.uid() WHERE id = jid;
  RETURN jid;
END $$;

-- Reverse a posted journal (mirror lines), idempotent per original journal
CREATE OR REPLACE FUNCTION public.acc_reverse_core(_jid uuid, _date date, _why text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE j record; lines jsonb; rid uuid;
BEGIN
  SELECT * INTO j FROM public.acc_journals WHERE id = _jid FOR UPDATE;
  IF j IS NULL OR j.status <> 'posted' OR j.reversed_by IS NOT NULL OR j.reversal_of IS NOT NULL THEN RETURN NULL; END IF;
  SELECT jsonb_agg(jsonb_build_object('a', account_id, 'd', credit, 'c', debit, 'm', memo) ORDER BY line_no) INTO lines FROM public.acc_journal_lines WHERE journal_id = _jid;
  rid := public.acc_make_journal(j.workspace_id, _date, 'REV ' || coalesce(j.reference,''), coalesce(_why, 'Reversal of ' || coalesce(j.reference,'journal')), 'reversal', _jid, lines, _jid);
  IF rid IS NOT NULL THEN UPDATE public.acc_journals SET reversed_by = rid WHERE id = _jid; END IF;
  RETURN rid;
END $$;

-- ================= Automatic posting from operational transactions =================
CREATE OR REPLACE FUNCTION public.acc_post_source(_type text, _id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s record; ws uuid; active boolean; jid uuid; d date; money uuid; net numeric; lines jsonb;
BEGIN
  IF _type = 'sale' THEN
    SELECT * INTO s FROM public.pos_sales WHERE id = _id;
    IF s IS NULL OR s.doc_type NOT IN ('sale','return') THEN RETURN; END IF;
    ws := s.workspace_id; active := s.status <> 'cancelled';
  ELSIF _type = 'payment' THEN
    SELECT * INTO s FROM public.pos_payments WHERE id = _id;
    IF s IS NULL THEN RETURN; END IF;
    ws := s.workspace_id; active := s.status = 'completed';
  ELSIF _type = 'purchase' THEN
    SELECT * INTO s FROM public.purchases WHERE id = _id;
    IF s IS NULL THEN RETURN; END IF;
    ws := s.workspace_id; active := s.status <> 'cancelled';
  ELSIF _type = 'expense' THEN
    SELECT * INTO s FROM public.expenses WHERE id = _id;
    IF s IS NULL THEN RETURN; END IF;
    ws := s.workspace_id; active := s.status = 'completed';
  ELSE RETURN; END IF;

  PERFORM public.acc_ensure_accounts(ws);
  SELECT id INTO jid FROM public.acc_journals WHERE workspace_id = ws AND source_type = _type AND source_id = _id;

  IF NOT active THEN
    IF jid IS NOT NULL THEN PERFORM public.acc_reverse_core(jid, (now() AT TIME ZONE 'Asia/Karachi')::date, 'Auto reversal (cancelled)'); END IF;
    RETURN;
  END IF;
  IF jid IS NOT NULL THEN RETURN; END IF;

  d := (s.created_at AT TIME ZONE 'Asia/Karachi')::date;
  IF _type = 'sale' THEN
    net := s.grand_total - s.tax_total;
    IF s.doc_type = 'sale' THEN
      lines := jsonb_build_array(
        jsonb_build_object('a', public.acc_sys(ws,'ar'), 'd', s.grand_total, 'm', 'Invoice'),
        jsonb_build_object('a', public.acc_sys(ws,'sales'), 'c', net),
        jsonb_build_object('a', public.acc_sys(ws,'tax'), 'c', s.tax_total),
        jsonb_build_object('a', public.acc_sys(ws,'cogs'), 'd', s.cost_total),
        jsonb_build_object('a', public.acc_sys(ws,'inventory'), 'c', s.cost_total));
    ELSE
      lines := jsonb_build_array(
        jsonb_build_object('a', public.acc_sys(ws,'sales_returns'), 'd', net),
        jsonb_build_object('a', public.acc_sys(ws,'tax'), 'd', s.tax_total),
        jsonb_build_object('a', public.acc_sys(ws,'ar'), 'c', s.grand_total, 'm', 'Return'),
        jsonb_build_object('a', public.acc_sys(ws,'inventory'), 'd', s.cost_total),
        jsonb_build_object('a', public.acc_sys(ws,'cogs'), 'c', s.cost_total));
    END IF;
    PERFORM public.acc_make_journal(ws, d, s.doc_number, CASE s.doc_type WHEN 'sale' THEN 'Sale' ELSE 'Sales return' END || ' - ' || coalesce(s.customer_name,''), 'sale', _id, lines);
  ELSIF _type = 'purchase' THEN
    IF s.doc_type = 'purchase' THEN
      lines := jsonb_build_array(jsonb_build_object('a', public.acc_sys(ws,'inventory'), 'd', s.grand_total), jsonb_build_object('a', public.acc_sys(ws,'ap'), 'c', s.grand_total));
    ELSE
      lines := jsonb_build_array(jsonb_build_object('a', public.acc_sys(ws,'ap'), 'd', s.grand_total), jsonb_build_object('a', public.acc_sys(ws,'inventory'), 'c', s.grand_total));
    END IF;
    PERFORM public.acc_make_journal(ws, d, s.doc_number, CASE s.doc_type WHEN 'purchase' THEN 'Purchase' ELSE 'Purchase return' END || ' - ' || coalesce(s.supplier_name,''), 'purchase', _id, lines);
  ELSIF _type = 'payment' THEN
    money := public.acc_sys(ws, CASE WHEN s.method = 'Cash' THEN 'cash' ELSE 'bank' END);
    IF s.kind IN ('sale','receipt') OR (s.direction = 'in' AND s.customer_id IS NOT NULL AND s.supplier_id IS NULL AND s.kind NOT IN ('purchase_refund')) THEN
      lines := jsonb_build_array(jsonb_build_object('a', money, 'd', s.amount), jsonb_build_object('a', public.acc_sys(ws,'ar'), 'c', s.amount));
    ELSIF s.kind = 'refund' THEN
      lines := jsonb_build_array(jsonb_build_object('a', public.acc_sys(ws,'ar'), 'd', s.amount), jsonb_build_object('a', money, 'c', s.amount));
    ELSIF s.kind IN ('purchase','supplier_payment') THEN
      lines := jsonb_build_array(jsonb_build_object('a', public.acc_sys(ws,'ap'), 'd', s.amount), jsonb_build_object('a', money, 'c', s.amount));
    ELSIF s.kind = 'purchase_refund' THEN
      lines := jsonb_build_array(jsonb_build_object('a', money, 'd', s.amount), jsonb_build_object('a', public.acc_sys(ws,'ap'), 'c', s.amount));
    ELSE RETURN; END IF;
    PERFORM public.acc_make_journal(ws, d, left(s.kind || ' ' || s.method, 120), coalesce(s.note, initcap(replace(s.kind,'_',' '))), 'payment', _id, lines);
  ELSIF _type = 'expense' THEN
    money := public.acc_sys(ws, CASE WHEN s.method = 'Cash' THEN 'cash' ELSE 'bank' END);
    lines := jsonb_build_array(jsonb_build_object('a', public.acc_expense_account(ws, s.category), 'd', s.amount), jsonb_build_object('a', money, 'c', s.amount));
    PERFORM public.acc_make_journal(ws, s.expense_date, 'EXP ' || s.category, coalesce(s.description, s.category), 'expense', _id, lines);
  END IF;
END $$;

-- Trigger wrapper: accounting failures never block POS
CREATE OR REPLACE FUNCTION public.acc_on_source() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  BEGIN
    PERFORM public.acc_post_source(TG_ARGV[0], NEW.id);
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by)
      VALUES (NEW.workspace_id, 'acc_error', TG_ARGV[0], NEW.id, jsonb_build_object('error', SQLERRM), auth.uid());
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER acc_pos_sales AFTER INSERT OR UPDATE ON public.pos_sales DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.acc_on_source('sale');
CREATE CONSTRAINT TRIGGER acc_pos_payments AFTER INSERT OR UPDATE ON public.pos_payments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.acc_on_source('payment');
CREATE CONSTRAINT TRIGGER acc_purchases AFTER INSERT OR UPDATE ON public.purchases DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.acc_on_source('purchase');
CREATE CONSTRAINT TRIGGER acc_expenses AFTER INSERT OR UPDATE ON public.expenses DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.acc_on_source('expense');

-- Backfill / resync (idempotent)
CREATE OR REPLACE FUNCTION public.acc_sync_all() RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ws uuid := public.current_workspace(); r record; n int := 0;
BEGIN
  IF NOT public.pos_can('view_accounting') THEN RAISE EXCEPTION 'Accounting permission required'; END IF;
  PERFORM public.acc_ensure_accounts(ws);
  FOR r IN
    SELECT 'sale' t, id, created_at FROM public.pos_sales WHERE workspace_id = ws AND doc_type IN ('sale','return')
    UNION ALL SELECT 'purchase', id, created_at FROM public.purchases WHERE workspace_id = ws
    UNION ALL SELECT 'payment', id, created_at FROM public.pos_payments WHERE workspace_id = ws
    UNION ALL SELECT 'expense', id, created_at FROM public.expenses WHERE workspace_id = ws
    ORDER BY created_at
  LOOP
    PERFORM public.acc_post_source(r.t, r.id); n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- ================= Manual journal RPCs =================
CREATE OR REPLACE FUNCTION public.acc_save_journal(_p jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ws uuid := public.current_workspace(); uid uuid := auth.uid(); jid uuid := nullif(_p->>'id','')::uuid; l jsonb;
  td numeric := 0; tc numeric := 0; dv numeric; cv numeric; i int := 0; st text; lk date; d date := (_p->>'date')::date;
BEGIN
  IF uid IS NULL OR NOT public.pos_can('create_journal') THEN RAISE EXCEPTION 'Journal permission required'; END IF;
  PERFORM public.acc_ensure_accounts(ws);
  IF d IS NULL THEN RAISE EXCEPTION 'Date is required'; END IF;
  IF jsonb_array_length(coalesce(_p->'lines','[]'::jsonb)) < 2 THEN RAISE EXCEPTION 'At least two lines are required'; END IF;
  FOR l IN SELECT * FROM jsonb_array_elements(_p->'lines') LOOP
    dv := round(coalesce((l->>'debit')::numeric,0),2); cv := round(coalesce((l->>'credit')::numeric,0),2);
    IF dv < 0 OR cv < 0 OR (dv > 0 AND cv > 0) OR (dv = 0 AND cv = 0) THEN RAISE EXCEPTION 'Each line needs either a debit or a credit amount'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.acc_accounts WHERE id = (l->>'account_id')::uuid AND workspace_id = ws AND is_active) THEN RAISE EXCEPTION 'Invalid or inactive account'; END IF;
    td := td + dv; tc := tc + cv;
  END LOOP;
  IF td <> tc THEN RAISE EXCEPTION 'Journal is not balanced: debit % vs credit %', td, tc; END IF;
  IF jid IS NULL THEN
    INSERT INTO public.acc_journals(workspace_id, entry_date, reference, description, status, source_type, total, created_by)
    VALUES (ws, d, left(_p->>'reference',120), left(_p->>'description',300), 'draft', 'manual', td, uid) RETURNING id INTO jid;
  ELSE
    SELECT status INTO st FROM public.acc_journals WHERE id = jid AND workspace_id = ws AND source_type = 'manual' FOR UPDATE;
    IF st IS NULL THEN RAISE EXCEPTION 'Journal not found'; END IF;
    IF st <> 'draft' THEN RAISE EXCEPTION 'Only draft journals can be edited'; END IF;
    UPDATE public.acc_journals SET entry_date = d, reference = left(_p->>'reference',120), description = left(_p->>'description',300), total = td WHERE id = jid;
    DELETE FROM public.acc_journal_lines WHERE journal_id = jid;
  END IF;
  FOR l IN SELECT * FROM jsonb_array_elements(_p->'lines') LOOP
    i := i + 1;
    INSERT INTO public.acc_journal_lines(journal_id, workspace_id, account_id, debit, credit, memo, line_no)
    VALUES (jid, ws, (l->>'account_id')::uuid, round(coalesce((l->>'debit')::numeric,0),2), round(coalesce((l->>'credit')::numeric,0),2), left(l->>'memo',200), i);
  END LOOP;
  IF coalesce((_p->>'post')::boolean, false) THEN PERFORM public.acc_post_journal(jid); END IF;
  RETURN jid;
END $$;

CREATE OR REPLACE FUNCTION public.acc_post_journal(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ws uuid := public.current_workspace();
BEGIN
  IF NOT public.pos_can('post_journal') THEN RAISE EXCEPTION 'Post journal permission required'; END IF;
  UPDATE public.acc_journals SET status = 'posted', posted_at = now(), posted_by = auth.uid()
  WHERE id = _id AND workspace_id = ws AND status = 'draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft journal not found'; END IF;
  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by) VALUES (ws, 'post', 'journal', _id, '{}'::jsonb, auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.acc_reverse_journal(_id uuid, _date date, _reason text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ws uuid := public.current_workspace(); rid uuid; lk date;
BEGIN
  IF NOT public.pos_can('post_journal') THEN RAISE EXCEPTION 'Post journal permission required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.acc_journals WHERE id = _id AND workspace_id = ws AND status = 'posted' AND reversed_by IS NULL AND reversal_of IS NULL) THEN
    RAISE EXCEPTION 'Only posted, un-reversed journals can be reversed';
  END IF;
  SELECT lock_date INTO lk FROM public.acc_settings WHERE workspace_id = ws;
  IF lk IS NOT NULL AND coalesce(_date, current_date) <= lk THEN RAISE EXCEPTION 'Period is locked up to %', lk; END IF;
  rid := public.acc_reverse_core(_id, coalesce(_date, current_date), nullif(trim(_reason),''));
  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by) VALUES (ws, 'reverse', 'journal', _id, jsonb_build_object('reason', _reason, 'reversal', rid), auth.uid());
  RETURN rid;
END $$;

CREATE OR REPLACE FUNCTION public.acc_cancel_draft(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.pos_can('create_journal') THEN RAISE EXCEPTION 'Journal permission required'; END IF;
  UPDATE public.acc_journals SET status = 'cancelled' WHERE id = _id AND workspace_id = public.current_workspace() AND status = 'draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'Draft journal not found'; END IF;
END $$;

-- ================= Chart of accounts RPCs =================
CREATE OR REPLACE FUNCTION public.acc_save_account(_p jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ws uuid := public.current_workspace(); aid uuid := nullif(_p->>'id','')::uuid; a record; par uuid := nullif(_p->>'parent_id','')::uuid;
BEGIN
  IF NOT public.pos_can('manage_accounts') THEN RAISE EXCEPTION 'Chart of accounts permission required'; END IF;
  PERFORM public.acc_ensure_accounts(ws);
  IF coalesce(trim(_p->>'code'),'') = '' OR coalesce(trim(_p->>'name'),'') = '' THEN RAISE EXCEPTION 'Code and name are required'; END IF;
  IF par IS NOT NULL AND (par = aid OR NOT EXISTS (SELECT 1 FROM public.acc_accounts WHERE id = par AND workspace_id = ws)) THEN RAISE EXCEPTION 'Invalid parent account'; END IF;
  IF aid IS NULL THEN
    INSERT INTO public.acc_accounts(workspace_id, code, name, type, parent_id, opening_balance, is_active)
    VALUES (ws, trim(_p->>'code'), left(trim(_p->>'name'),120), _p->>'type', par, round(coalesce((_p->>'opening_balance')::numeric,0),2), coalesce((_p->>'is_active')::boolean,true))
    RETURNING id INTO aid;
  ELSE
    SELECT * INTO a FROM public.acc_accounts WHERE id = aid AND workspace_id = ws FOR UPDATE;
    IF a IS NULL THEN RAISE EXCEPTION 'Account not found'; END IF;
    IF a.is_system AND (_p->>'type') <> a.type THEN RAISE EXCEPTION 'System account type cannot be changed'; END IF;
    IF a.is_system AND coalesce((_p->>'is_active')::boolean,true) = false THEN RAISE EXCEPTION 'System accounts cannot be deactivated'; END IF;
    UPDATE public.acc_accounts SET code = trim(_p->>'code'), name = left(trim(_p->>'name'),120), type = _p->>'type', parent_id = par,
      opening_balance = round(coalesce((_p->>'opening_balance')::numeric,0),2), is_active = coalesce((_p->>'is_active')::boolean,true), updated_at = now()
    WHERE id = aid;
  END IF;
  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by) VALUES (ws, 'save', 'account', aid, _p, auth.uid());
  RETURN aid;
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'Account code already exists';
END $$;

CREATE OR REPLACE FUNCTION public.acc_delete_account(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ws uuid := public.current_workspace(); a record;
BEGIN
  IF NOT public.pos_can('manage_accounts') THEN RAISE EXCEPTION 'Chart of accounts permission required'; END IF;
  SELECT * INTO a FROM public.acc_accounts WHERE id = _id AND workspace_id = ws FOR UPDATE;
  IF a IS NULL THEN RAISE EXCEPTION 'Account not found'; END IF;
  IF a.system_key IS NOT NULL THEN RAISE EXCEPTION 'System accounts cannot be deleted'; END IF;
  IF EXISTS (SELECT 1 FROM public.acc_journal_lines WHERE account_id = _id) THEN RAISE EXCEPTION 'Account has transactions; deactivate it instead'; END IF;
  IF EXISTS (SELECT 1 FROM public.acc_accounts WHERE parent_id = _id) THEN RAISE EXCEPTION 'Account has sub-accounts'; END IF;
  DELETE FROM public.acc_accounts WHERE id = _id;
  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by) VALUES (ws, 'delete', 'account', _id, jsonb_build_object('code', a.code, 'name', a.name), auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.acc_save_settings(_p jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ws uuid := public.current_workspace();
BEGIN
  IF NOT public.pos_can('close_period') OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Only admin can change accounting periods'; END IF;
  IF nullif(_p->>'fy_start','') IS NOT NULL AND nullif(_p->>'fy_end','') IS NOT NULL AND (_p->>'fy_end')::date <= (_p->>'fy_start')::date THEN
    RAISE EXCEPTION 'Financial year end must be after start';
  END IF;
  INSERT INTO public.acc_settings(workspace_id, fy_start, fy_end, lock_date, credit_days, updated_at, updated_by)
  VALUES (ws, nullif(_p->>'fy_start','')::date, nullif(_p->>'fy_end','')::date, nullif(_p->>'lock_date','')::date, greatest(coalesce((_p->>'credit_days')::int,30),0), now(), auth.uid())
  ON CONFLICT (workspace_id) DO UPDATE SET fy_start = EXCLUDED.fy_start, fy_end = EXCLUDED.fy_end, lock_date = EXCLUDED.lock_date, credit_days = EXCLUDED.credit_days, updated_at = now(), updated_by = auth.uid();
  INSERT INTO public.audit_log(workspace_id, action, entity, details, created_by) VALUES (ws, 'settings', 'accounting', _p, auth.uid());
END $$;

-- Aggregated balances for reports (posted only)
CREATE OR REPLACE FUNCTION public.acc_balances(_from date, _to date) RETURNS TABLE(account_id uuid, before_dr numeric, before_cr numeric, dr numeric, cr numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT l.account_id,
    coalesce(sum(l.debit) FILTER (WHERE _from IS NOT NULL AND j.entry_date < _from),0),
    coalesce(sum(l.credit) FILTER (WHERE _from IS NOT NULL AND j.entry_date < _from),0),
    coalesce(sum(l.debit) FILTER (WHERE (_from IS NULL OR j.entry_date >= _from)),0),
    coalesce(sum(l.credit) FILTER (WHERE (_from IS NULL OR j.entry_date >= _from)),0)
  FROM public.acc_journal_lines l JOIN public.acc_journals j ON j.id = l.journal_id
  WHERE public.pos_can('view_accounting') AND j.workspace_id = public.current_workspace() AND j.status = 'posted'
    AND (_to IS NULL OR j.entry_date <= _to)
  GROUP BY l.account_id
$$;

REVOKE EXECUTE ON FUNCTION public.acc_ensure_accounts(uuid), public.acc_sys(uuid,text), public.acc_expense_account(uuid,text),
  public.acc_make_journal(uuid,date,text,text,text,uuid,jsonb,uuid), public.acc_reverse_core(uuid,date,text), public.acc_post_source(text,uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.acc_sync_all(), public.acc_save_journal(jsonb), public.acc_post_journal(uuid), public.acc_reverse_journal(uuid,date,text),
  public.acc_cancel_draft(uuid), public.acc_save_account(jsonb), public.acc_delete_account(uuid), public.acc_save_settings(jsonb), public.acc_balances(date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acc_sync_all(), public.acc_save_journal(jsonb), public.acc_post_journal(uuid), public.acc_reverse_journal(uuid,date,text),
  public.acc_cancel_draft(uuid), public.acc_save_account(jsonb), public.acc_delete_account(uuid), public.acc_save_settings(jsonb), public.acc_balances(date,date) TO authenticated;
