CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.pos_member_roles (
  workspace_id uuid NOT NULL DEFAULT public.current_workspace(),
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('manager','cashier','salesman','staff')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
GRANT SELECT ON public.pos_member_roles TO authenticated;
GRANT ALL ON public.pos_member_roles TO service_role;
ALTER TABLE public.pos_member_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members read pos roles" ON public.pos_member_roles FOR SELECT TO authenticated
  USING (workspace_id = public.current_workspace());

CREATE TABLE public.pos_settings (
  workspace_id uuid PRIMARY KEY DEFAULT public.current_workspace(),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  pin_hash text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
GRANT SELECT (workspace_id, config, updated_at) ON public.pos_settings TO authenticated;
GRANT ALL ON public.pos_settings TO service_role;
ALTER TABLE public.pos_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Workspace members read pos settings" ON public.pos_settings FOR SELECT TO authenticated
  USING (workspace_id = public.current_workspace());

CREATE OR REPLACE FUNCTION public.pos_role(_uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.has_role(_uid, 'admin') THEN 'admin'
    ELSE coalesce((SELECT role FROM public.pos_member_roles WHERE user_id = _uid AND workspace_id = public.current_workspace()), 'manager') END
$$;

CREATE OR REPLACE FUNCTION public.pos_perms(_role text)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _role
    WHEN 'admin' THEN ARRAY['view_pos','create_sale','edit_price','apply_discount','cancel_invoice','view_reports','view_profit','edit_stock','edit_products','view_balances','manage_expenses','manage_purchases','manage_users','settings']
    WHEN 'manager' THEN ARRAY['view_pos','create_sale','edit_price','apply_discount','cancel_invoice','view_reports','view_profit','edit_stock','edit_products','view_balances','manage_expenses','manage_purchases']
    WHEN 'salesman' THEN ARRAY['view_pos','create_sale','apply_discount','view_balances']
    WHEN 'cashier' THEN ARRAY['view_pos','create_sale','view_balances','manage_expenses']
    ELSE ARRAY['view_pos','create_sale'] END
$$;

CREATE OR REPLACE FUNCTION public.pos_can(_perm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND public.is_active_team_member(auth.uid()) AND _perm = ANY(public.pos_perms(public.pos_role(auth.uid())))
$$;

CREATE OR REPLACE FUNCTION public.pos_my_access()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('role', public.pos_role(auth.uid()), 'perms', to_jsonb(public.pos_perms(public.pos_role(auth.uid()))),
    'hasPin', EXISTS (SELECT 1 FROM public.pos_settings WHERE workspace_id = public.current_workspace() AND pin_hash IS NOT NULL))
$$;

CREATE OR REPLACE FUNCTION public.pos_verify_pin(_pin text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE h text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_team_member(auth.uid()) THEN RETURN false; END IF;
  SELECT pin_hash INTO h FROM public.pos_settings WHERE workspace_id = public.current_workspace();
  RETURN h IS NOT NULL AND coalesce(_pin,'') <> '' AND extensions.crypt(_pin, h) = h;
END $$;

CREATE OR REPLACE FUNCTION public.pos_set_member_role(_user uuid, _role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ws uuid := public.current_workspace();
BEGIN
  IF NOT public.pos_can('manage_users') THEN RAISE EXCEPTION 'Ijazat nahi'; END IF;
  IF _role NOT IN ('manager','cashier','salesman','staff') THEN RAISE EXCEPTION 'bad role'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user AND workspace_id = ws) THEN RAISE EXCEPTION 'user not in workspace'; END IF;
  INSERT INTO public.pos_member_roles(workspace_id, user_id, role) VALUES (ws, _user, _role)
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role, updated_at = now();
  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by) VALUES (ws, 'set_role', 'pos_member', _user, jsonb_build_object('role', _role), auth.uid());
END $$;

CREATE OR REPLACE FUNCTION public.pos_save_settings(_config jsonb, _pin text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE ws uuid := public.current_workspace();
BEGIN
  IF NOT public.pos_can('settings') THEN RAISE EXCEPTION 'Ijazat nahi'; END IF;
  INSERT INTO public.pos_settings(workspace_id, config, updated_by) VALUES (ws, coalesce(_config,'{}'::jsonb), auth.uid())
  ON CONFLICT (workspace_id) DO UPDATE SET config = EXCLUDED.config, updated_at = now(), updated_by = auth.uid();
  IF _pin IS NOT NULL THEN
    IF _pin = '' THEN UPDATE public.pos_settings SET pin_hash = NULL WHERE workspace_id = ws;
    ELSIF _pin !~ '^\d{4,8}$' THEN RAISE EXCEPTION 'PIN 4-8 digits';
    ELSE UPDATE public.pos_settings SET pin_hash = extensions.crypt(_pin, extensions.gen_salt('bf')) WHERE workspace_id = ws; END IF;
  END IF;
  INSERT INTO public.audit_log(workspace_id, action, entity, details, created_by) VALUES (ws, 'update', 'pos_settings', jsonb_build_object('pin_changed', _pin IS NOT NULL), auth.uid());
END $$;

-- Cancel: core (internal) + permission ya PIN wale wrappers
CREATE OR REPLACE FUNCTION public.pos_cancel_sale_core(_id uuid, _reason text)
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
  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by) VALUES (ws, 'cancel', 'pos_sale', _id, jsonb_build_object('reason', _reason), auth.uid());
END $$;
REVOKE ALL ON FUNCTION public.pos_cancel_sale_core(uuid,text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pos_cancel_sale(_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.pos_sales WHERE id = _id AND doc_type IN ('sale','return')) AND NOT public.pos_can('cancel_invoice') THEN
    RAISE EXCEPTION 'Cancel ki ijazat nahi — manager PIN chahiye';
  END IF;
  PERFORM public.pos_cancel_sale_core(_id, _reason);
END $$;

CREATE OR REPLACE FUNCTION public.pos_cancel_sale_pin(_id uuid, _reason text, _pin text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.pos_verify_pin(_pin) THEN RAISE EXCEPTION 'PIN ghalat'; END IF;
  PERFORM public.pos_cancel_sale_core(_id, coalesce(_reason,'') || ' (PIN override)');
END $$;

-- Stock / product / purchase par permission
CREATE OR REPLACE FUNCTION public.pos_adjust_stock(_id uuid, _qty numeric, _kind text, _note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ws uuid := public.current_workspace(); uid uuid := auth.uid();
BEGIN
  IF NOT public.pos_can('edit_stock') THEN RAISE EXCEPTION 'Stock edit ki ijazat nahi'; END IF;
  IF _kind NOT IN ('adjust_in','adjust_out','damage','opening') THEN RAISE EXCEPTION 'bad kind'; END IF;
  IF _qty IS NULL OR _qty <= 0 THEN RAISE EXCEPTION 'qty ghalat'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = _id AND workspace_id = ws) THEN RAISE EXCEPTION 'product not found'; END IF;
  PERFORM public.pos_move_stock(ws, _id, CASE WHEN _kind IN ('adjust_in','opening') THEN _qty ELSE -_qty END, _kind, NULL, _note);
  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by)
  VALUES (ws, _kind, 'stock', _id, jsonb_build_object('qty',_qty,'note',_note), uid);
END $$;

CREATE OR REPLACE FUNCTION public.pos_update_product(_id uuid, _p jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ws uuid := public.current_workspace(); uid uuid := auth.uid();
BEGIN
  IF NOT public.pos_can('edit_products') THEN RAISE EXCEPTION 'Product edit ki ijazat nahi'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = _id AND workspace_id = ws) THEN RAISE EXCEPTION 'product not found'; END IF;
  UPDATE public.products SET
    sku = nullif(trim(_p->>'sku'),''), barcode = nullif(trim(_p->>'barcode'),''), category = nullif(trim(_p->>'category'),''), brand = nullif(trim(_p->>'brand'),''),
    purchase_price = nullif(_p->>'purchase_price','')::numeric, wholesale_price = nullif(_p->>'wholesale_price','')::numeric,
    min_sale_price = nullif(_p->>'min_sale_price','')::numeric, min_stock = nullif(_p->>'min_stock','')::numeric, tax_percent = nullif(_p->>'tax_percent','')::numeric
  WHERE id = _id;
  INSERT INTO public.audit_log(workspace_id, action, entity, entity_id, details, created_by) VALUES (ws, 'update', 'product', _id, _p, uid);
END $$;

CREATE OR REPLACE FUNCTION public.pos_guard_purchase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.pos_can('manage_purchases') THEN RAISE EXCEPTION 'Purchase ki ijazat nahi'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER purchases_permission_guard BEFORE INSERT ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.pos_guard_purchase();

CREATE OR REPLACE FUNCTION public.pos_guard_expense()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.pos_can('manage_expenses') THEN RAISE EXCEPTION 'Expense ki ijazat nahi'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER expenses_permission_guard BEFORE INSERT OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.pos_guard_expense();

REVOKE ALL ON FUNCTION public.pos_role(uuid), public.pos_can(text), public.pos_my_access(), public.pos_verify_pin(text), public.pos_set_member_role(uuid,text), public.pos_save_settings(jsonb,text), public.pos_cancel_sale(uuid,text), public.pos_cancel_sale_pin(uuid,text,text), public.pos_adjust_stock(uuid,numeric,text,text), public.pos_update_product(uuid,jsonb), public.pos_guard_purchase(), public.pos_guard_expense() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_role(uuid), public.pos_can(text), public.pos_my_access(), public.pos_verify_pin(text), public.pos_set_member_role(uuid,text), public.pos_save_settings(jsonb,text), public.pos_cancel_sale(uuid,text), public.pos_cancel_sale_pin(uuid,text,text), public.pos_adjust_stock(uuid,numeric,text,text), public.pos_update_product(uuid,jsonb) TO authenticated;