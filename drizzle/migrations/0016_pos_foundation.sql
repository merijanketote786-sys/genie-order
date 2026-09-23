ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS purchase_price numeric,
  ADD COLUMN IF NOT EXISTS wholesale_price numeric,
  ADD COLUMN IF NOT EXISTS min_sale_price numeric,
  ADD COLUMN IF NOT EXISTS min_stock numeric,
  ADD COLUMN IF NOT EXISTS tax_percent numeric;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS opening_balance numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_limit numeric;

CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL DEFAULT public.current_workspace(),
  name text NOT NULL,
  phone text,
  address text,
  opening_balance numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- doc_type: sale | return | quotation | held ; status: completed | cancelled | converted | draft
CREATE TABLE public.pos_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL DEFAULT public.current_workspace(),
  doc_type text NOT NULL DEFAULT 'sale',
  doc_number text NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  payment_status text NOT NULL DEFAULT 'paid',
  customer_id uuid REFERENCES public.customers(id),
  customer_name text,
  customer_phone text,
  subtotal numeric NOT NULL DEFAULT 0,
  discount_total numeric NOT NULL DEFAULT 0,
  tax_total numeric NOT NULL DEFAULT 0,
  delivery numeric NOT NULL DEFAULT 0,
  grand_total numeric NOT NULL DEFAULT 0,
  paid_total numeric NOT NULL DEFAULT 0,
  balance numeric NOT NULL DEFAULT 0,
  cost_total numeric NOT NULL DEFAULT 0,
  notes text,
  ref_sale_id uuid REFERENCES public.pos_sales(id),
  invoice_id uuid REFERENCES public.invoices(id),
  payload jsonb,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pos_sales_ws_created ON public.pos_sales(workspace_id, created_at DESC);
CREATE INDEX pos_sales_customer ON public.pos_sales(customer_id);

CREATE TABLE public.pos_sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES public.pos_sales(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  product_id uuid REFERENCES public.products(id),
  name text NOT NULL,
  sku text,
  unit text,
  rate_type text,
  qty numeric NOT NULL,
  stock_qty numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL,
  cost numeric NOT NULL DEFAULT 0,
  discount numeric NOT NULL DEFAULT 0,
  tax_percent numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL,
  note text
);
CREATE INDEX pos_sale_items_sale ON public.pos_sale_items(sale_id);

CREATE TABLE public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL DEFAULT public.current_workspace(),
  doc_type text NOT NULL DEFAULT 'purchase', -- purchase | return
  doc_number text NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  payment_status text NOT NULL DEFAULT 'paid',
  supplier_id uuid REFERENCES public.suppliers(id),
  supplier_name text,
  subtotal numeric NOT NULL DEFAULT 0,
  discount_total numeric NOT NULL DEFAULT 0,
  tax_total numeric NOT NULL DEFAULT 0,
  grand_total numeric NOT NULL DEFAULT 0,
  paid_total numeric NOT NULL DEFAULT 0,
  balance numeric NOT NULL DEFAULT 0,
  notes text,
  ref_purchase_id uuid REFERENCES public.purchases(id),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  product_id uuid REFERENCES public.products(id),
  name text NOT NULL,
  unit text,
  qty numeric NOT NULL,
  rate numeric NOT NULL,
  discount numeric NOT NULL DEFAULT 0,
  tax_percent numeric NOT NULL DEFAULT 0,
  tax_amount numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL,
  batch text,
  expiry date
);

-- party payments: direction in (customer pays us) / out (we pay supplier, refunds)
CREATE TABLE public.pos_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL DEFAULT public.current_workspace(),
  direction text NOT NULL,
  method text NOT NULL,
  amount numeric NOT NULL,
  customer_id uuid REFERENCES public.customers(id),
  supplier_id uuid REFERENCES public.suppliers(id),
  sale_id uuid REFERENCES public.pos_sales(id),
  purchase_id uuid REFERENCES public.purchases(id),
  kind text NOT NULL DEFAULT 'sale', -- sale | receipt | refund | purchase | supplier_payment | expense
  note text,
  status text NOT NULL DEFAULT 'completed',
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pos_payments_ws_created ON public.pos_payments(workspace_id, created_at DESC);

CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL DEFAULT public.current_workspace(),
  product_id uuid NOT NULL REFERENCES public.products(id),
  kind text NOT NULL, -- opening | sale | sale_return | purchase | purchase_return | adjust_in | adjust_out | damage
  qty numeric NOT NULL, -- signed
  ref_id uuid,
  note text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_movements_product ON public.stock_movements(product_id, created_at DESC);

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL DEFAULT public.current_workspace(),
  category text NOT NULL,
  amount numeric NOT NULL,
  expense_date date NOT NULL DEFAULT current_date,
  method text NOT NULL DEFAULT 'Cash',
  description text,
  attachment text,
  status text NOT NULL DEFAULT 'completed',
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL DEFAULT public.current_workspace(),
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  details jsonb,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.suppliers, public.pos_sales, public.pos_sale_items, public.purchases, public.purchase_items, public.pos_payments, public.expenses TO authenticated;
GRANT SELECT ON public.stock_movements, public.audit_log TO authenticated;
GRANT ALL ON public.suppliers, public.pos_sales, public.pos_sale_items, public.purchases, public.purchase_items, public.pos_payments, public.stock_movements, public.expenses, public.audit_log TO service_role;

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['suppliers','pos_sales','pos_sale_items','purchases','purchase_items','pos_payments','stock_movements','expenses','audit_log'] LOOP
    EXECUTE format('CREATE POLICY "ws read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (workspace_id = public.current_workspace())', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['suppliers','pos_sales','pos_sale_items','purchases','purchase_items','pos_payments','expenses'] LOOP
    EXECUTE format('CREATE POLICY "ws insert %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (workspace_id = public.current_workspace())', t);
    EXECUTE format('CREATE POLICY "ws update %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (workspace_id = public.current_workspace()) WITH CHECK (workspace_id = public.current_workspace())', t);
  END LOOP;
END $$;

CREATE TRIGGER suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER pos_sales_updated_at BEFORE UPDATE ON public.pos_sales FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER purchases_updated_at BEFORE UPDATE ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE SEQUENCE IF NOT EXISTS public.purchase_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.quote_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.return_seq START 1;

-- Internal helper: move stock for a product in caller workspace
CREATE OR REPLACE FUNCTION public.pos_move_stock(_ws uuid, _product uuid, _qty numeric, _kind text, _ref uuid, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _product IS NULL OR _qty = 0 THEN RETURN; END IF;
  UPDATE public.products SET stock = coalesce(stock,0) + _qty WHERE id = _product AND workspace_id = _ws;
  IF FOUND THEN
    INSERT INTO public.stock_movements(workspace_id, product_id, kind, qty, ref_id, note, created_by)
    VALUES (_ws, _product, _kind, _qty, _ref, _note, auth.uid());
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.pos_move_stock(uuid,uuid,numeric,text,uuid,text) FROM PUBLIC, anon, authenticated;

-- Atomic document save: sale | quotation | held | return
CREATE OR REPLACE FUNCTION public.pos_save_sale(_p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ws uuid := public.current_workspace();
  uid uuid := auth.uid();
  dtype text := coalesce(_p->>'doc_type','sale');
  num text;
  sid uuid;
  cust uuid := nullif(_p->>'customer_id','')::uuid;
  phone text := nullif(regexp_replace(coalesce(_p->>'customer_phone',''),'\D','','g'),'');
  it jsonb; pay jsonb;
  cost_sum numeric := 0; c numeric;
  gt numeric := coalesce((_p->>'grand_total')::numeric,0);
  paid numeric := 0; credit numeric := 0;
  pstatus text; inv uuid; sign int;
BEGIN
  IF uid IS NULL OR ws IS NULL OR NOT public.is_active_team_member(uid) THEN
    RAISE EXCEPTION 'Access band hai';
  END IF;
  IF dtype NOT IN ('sale','quotation','held','return') THEN RAISE EXCEPTION 'bad doc_type'; END IF;

  IF cust IS NULL AND phone IS NOT NULL AND length(phone) >= 10 THEN
    SELECT id INTO cust FROM public.customers WHERE workspace_id = ws AND phone = phone LIMIT 1;
    IF cust IS NULL THEN
      INSERT INTO public.customers(phone, name, workspace_id, created_by)
      VALUES (phone, nullif(_p->>'customer_name',''), ws, uid) RETURNING id INTO cust;
    END IF;
  END IF;
  IF cust IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.customers WHERE id = cust AND workspace_id = ws) THEN
    RAISE EXCEPTION 'customer not found';
  END IF;

  num := CASE dtype
    WHEN 'sale' THEN public.next_invoice_number()
    WHEN 'return' THEN 'SR-' || lpad(nextval('public.return_seq')::text,5,'0')
    WHEN 'quotation' THEN 'QT-' || lpad(nextval('public.quote_seq')::text,5,'0')
    ELSE 'HOLD-' || to_char(now(),'HH24MISS') END;

  FOR pay IN SELECT * FROM jsonb_array_elements(coalesce(_p->'payments','[]'::jsonb)) LOOP
    IF pay->>'method' = 'Credit' THEN credit := credit + (pay->>'amount')::numeric;
    ELSE paid := paid + (pay->>'amount')::numeric; END IF;
  END LOOP;

  pstatus := CASE WHEN dtype <> 'sale' THEN dtype
    WHEN paid >= gt THEN 'paid' WHEN paid > 0 THEN 'partial' ELSE 'credit' END;

  INSERT INTO public.pos_sales(workspace_id, doc_type, doc_number, status, payment_status, customer_id, customer_name, customer_phone,
    subtotal, discount_total, tax_total, delivery, grand_total, paid_total, balance, notes, ref_sale_id, payload, created_by)
  VALUES (ws, dtype, num, CASE WHEN dtype='held' THEN 'draft' ELSE 'completed' END, pstatus, cust,
    coalesce(nullif(_p->>'customer_name',''),'Walk-in'), phone,
    coalesce((_p->>'subtotal')::numeric,0), coalesce((_p->>'discount_total')::numeric,0), coalesce((_p->>'tax_total')::numeric,0),
    coalesce((_p->>'delivery')::numeric,0), gt, least(paid, gt), greatest(gt - paid, 0), _p->>'notes',
    nullif(_p->>'ref_sale_id','')::uuid, _p->'ui', uid)
  RETURNING id INTO sid;

  sign := CASE dtype WHEN 'sale' THEN -1 WHEN 'return' THEN 1 ELSE 0 END;
  FOR it IN SELECT * FROM jsonb_array_elements(coalesce(_p->'items','[]'::jsonb)) LOOP
    c := 0;
    IF nullif(it->>'product_id','') IS NOT NULL THEN
      SELECT coalesce(purchase_price,0) INTO c FROM public.products WHERE id = (it->>'product_id')::uuid AND workspace_id = ws;
    END IF;
    c := coalesce(c,0) * coalesce((it->>'stock_qty')::numeric,0);
    cost_sum := cost_sum + c;
    INSERT INTO public.pos_sale_items(sale_id, workspace_id, product_id, name, sku, unit, rate_type, qty, stock_qty, rate, cost, discount, tax_percent, tax_amount, line_total, note)
    VALUES (sid, ws, nullif(it->>'product_id','')::uuid, it->>'name', it->>'sku', it->>'unit', it->>'rate_type',
      (it->>'qty')::numeric, coalesce((it->>'stock_qty')::numeric,0), (it->>'rate')::numeric, c,
      coalesce((it->>'discount')::numeric,0), coalesce((it->>'tax_percent')::numeric,0), coalesce((it->>'tax_amount')::numeric,0),
      (it->>'line_total')::numeric, it->>'note');
    IF sign <> 0 THEN
      PERFORM public.pos_move_stock(ws, nullif(it->>'product_id','')::uuid, sign * coalesce((it->>'stock_qty')::numeric,0),
        CASE dtype WHEN 'sale' THEN 'sale' ELSE 'sale_return' END, sid, num);
    END IF;
  END LOOP;
  UPDATE public.pos_sales SET cost_total = cost_sum WHERE id = sid;

  IF dtype IN ('sale','return') THEN
    FOR pay IN SELECT * FROM jsonb_array_elements(coalesce(_p->'payments','[]'::jsonb)) LOOP
      IF pay->>'method' <> 'Credit' AND (pay->>'amount')::numeric > 0 THEN
        INSERT INTO public.pos_payments(workspace_id, direction, method, amount, customer_id, sale_id, kind, created_by)
        VALUES (ws, CASE dtype WHEN 'sale' THEN 'in' ELSE 'out' END, pay->>'method', (pay->>'amount')::numeric, cust, sid,
          CASE dtype WHEN 'sale' THEN 'sale' ELSE 'refund' END, uid);
      END IF;
    END LOOP;
  END IF;

  IF dtype = 'sale' THEN
    INSERT INTO public.invoices(invoice_number, customer_name, phone, total, payment_status, paid_at, payment_method, cod_amount, invoice_text, customer_id, created_by, workspace_id)
    VALUES (num, coalesce(nullif(_p->>'customer_name',''),'Walk-in'), phone, gt,
      CASE WHEN pstatus='credit' THEN 'unpaid' ELSE pstatus END,
      CASE WHEN pstatus='paid' THEN now() END, 'POS-' || coalesce(_p->>'method_label','Cash'),
      CASE WHEN pstatus='paid' THEN NULL ELSE greatest(gt-paid,0) END,
      replace(coalesce(_p->>'invoice_text',''),'{{INVOICE}}',num), cust, uid, ws)
    RETURNING id INTO inv;
    UPDATE public.pos_sales SET invoice_id = inv WHERE id = sid;
  END IF;

  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by)
  VALUES (ws, 'create', 'pos_' || dtype, sid, jsonb_build_object('number',num,'total',gt), uid);

  RETURN jsonb_build_object('id', sid, 'number', num, 'payment_status', pstatus);
END $$;
REVOKE ALL ON FUNCTION public.pos_save_sale(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_save_sale(jsonb) TO authenticated;

-- Cancel (never delete): reverses stock + payments
CREATE OR REPLACE FUNCTION public.pos_cancel_sale(_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ws uuid := public.current_workspace(); s record; it record;
BEGIN
  IF NOT public.is_active_team_member(auth.uid()) THEN RAISE EXCEPTION 'Access band hai'; END IF;
  SELECT * INTO s FROM public.pos_sales WHERE id = _id AND workspace_id = ws FOR UPDATE;
  IF s IS NULL OR s.status = 'cancelled' THEN RAISE EXCEPTION 'Bill nahi mila ya pehle se cancel'; END IF;
  IF s.doc_type IN ('sale','return') THEN
    FOR it IN SELECT * FROM public.pos_sale_items WHERE sale_id = _id LOOP
      PERFORM public.pos_move_stock(ws, it.product_id, CASE s.doc_type WHEN 'sale' THEN it.stock_qty ELSE -it.stock_qty END, 'cancel', _id, 'Cancel ' || s.doc_number);
    END LOOP;
    UPDATE public.pos_payments SET status = 'cancelled' WHERE sale_id = _id;
    UPDATE public.invoices SET payment_status = 'cancelled' WHERE id = s.invoice_id;
  END IF;
  UPDATE public.pos_sales SET status = 'cancelled' WHERE id = _id;
  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details) VALUES (ws, 'cancel', 'pos_sale', _id, jsonb_build_object('reason', _reason));
END $$;
REVOKE ALL ON FUNCTION public.pos_cancel_sale(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_cancel_sale(uuid,text) TO authenticated;
