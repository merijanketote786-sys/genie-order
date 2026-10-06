CREATE TABLE public.pos_cash_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL DEFAULT public.current_workspace(),
  entry_date date NOT NULL,
  direction text NOT NULL CHECK (direction IN ('in','out')),
  method text NOT NULL DEFAULT 'Cash',
  account_id uuid REFERENCES public.acc_accounts(id),
  category text NOT NULL DEFAULT 'Other',
  party text,
  amount numeric NOT NULL CHECK (amount > 0),
  note text,
  status text NOT NULL DEFAULT 'completed',
  journal_id uuid,
  client_ref uuid UNIQUE,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pos_cash_entries TO authenticated;
GRANT ALL ON public.pos_cash_entries TO service_role;
ALTER TABLE public.pos_cash_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ws read cash entries" ON public.pos_cash_entries FOR SELECT TO authenticated
  USING (workspace_id = public.current_workspace() AND (public.pos_can('view_reports') OR public.pos_can('manage_expenses')));
CREATE INDEX pos_cash_entries_ws_date ON public.pos_cash_entries(workspace_id, entry_date);

CREATE OR REPLACE FUNCTION public.pos_save_cash_entry(_p jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE ws uuid := public.current_workspace(); nid uuid; acc uuid; money uuid; amt numeric; dir text; jid uuid; ref uuid;
BEGIN
  IF NOT public.pos_can('manage_expenses') THEN RAISE EXCEPTION 'permission denied'; END IF;
  amt := (_p->>'amount')::numeric; dir := _p->>'direction';
  IF amt IS NULL OR amt <= 0 OR dir NOT IN ('in','out') THEN RAISE EXCEPTION 'Invalid entry'; END IF;
  ref := nullif(_p->>'client_ref','')::uuid;
  IF ref IS NOT NULL THEN SELECT id INTO nid FROM public.pos_cash_entries WHERE client_ref = ref; IF nid IS NOT NULL THEN RETURN nid; END IF; END IF;
  acc := nullif(_p->>'account_id','')::uuid;
  IF acc IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.acc_accounts WHERE id = acc AND workspace_id = ws) THEN RAISE EXCEPTION 'Invalid account'; END IF;
  INSERT INTO public.pos_cash_entries(workspace_id, entry_date, direction, method, account_id, category, party, amount, note, client_ref)
  VALUES (ws, (_p->>'date')::date, dir, coalesce(nullif(_p->>'method',''),'Cash'), acc, coalesce(nullif(_p->>'category',''),'Other'), nullif(_p->>'party',''), amt, nullif(_p->>'note',''), ref)
  RETURNING id INTO nid;
  -- Accounting: failure must never block the POS entry
  BEGIN
    PERFORM public.acc_ensure_accounts(ws);
    money := public.acc_sys(ws, CASE WHEN coalesce(_p->>'method','Cash') = 'Cash' THEN 'cash' ELSE 'bank' END);
    IF acc IS NULL THEN
      acc := CASE WHEN dir = 'out' THEN public.acc_expense_account(ws, coalesce(nullif(_p->>'category',''),'Other')) ELSE public.acc_sys(ws,'sales') END;
    END IF;
    jid := public.acc_make_journal(ws, (_p->>'date')::date, 'DB-' || left(nid::text, 8),
      'Day book ' || CASE WHEN dir='in' THEN 'cash in' ELSE 'cash out' END || ' - ' || coalesce(nullif(_p->>'category',''),'Other') || coalesce(' - ' || nullif(_p->>'note',''), ''),
      'cash_entry', nid,
      CASE WHEN dir = 'in' THEN jsonb_build_array(jsonb_build_object('a', money, 'd', amt), jsonb_build_object('a', acc, 'c', amt))
           ELSE jsonb_build_array(jsonb_build_object('a', acc, 'd', amt), jsonb_build_object('a', money, 'c', amt)) END, NULL);
    UPDATE public.pos_cash_entries SET journal_id = jid WHERE id = nid;
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by) VALUES (ws, 'acc_error', 'cash_entry', nid, jsonb_build_object('error', SQLERRM), auth.uid());
  END;
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.pos_cancel_cash_entry(_id uuid, _reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  IF NOT public.pos_can('manage_expenses') THEN RAISE EXCEPTION 'permission denied'; END IF;
  SELECT * INTO r FROM public.pos_cash_entries WHERE id = _id AND workspace_id = public.current_workspace() FOR UPDATE;
  IF r IS NULL OR r.status = 'cancelled' THEN RETURN; END IF;
  UPDATE public.pos_cash_entries SET status = 'cancelled', note = coalesce(note,'') || ' [Cancelled: ' || coalesce(_reason,'') || ']' WHERE id = _id;
  IF r.journal_id IS NOT NULL THEN
    BEGIN PERFORM public.acc_reverse_core(r.journal_id, (now() AT TIME ZONE 'Asia/Karachi')::date, 'Day book entry cancelled');
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION public.pos_save_cash_entry(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_cancel_cash_entry(uuid, text) TO authenticated;