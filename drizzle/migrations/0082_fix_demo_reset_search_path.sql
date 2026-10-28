CREATE OR REPLACE FUNCTION public.pos_reset_demo_workspace()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  ws uuid := '11111111-1111-4111-8111-111111111111';
  firm uuid := '22222222-2222-4222-8222-222222222222';
  store uuid := '33333333-3333-4333-8333-333333333333';
BEGIN
  DELETE FROM public.pos_sale_items WHERE workspace_id = ws;
  DELETE FROM public.pos_payments WHERE workspace_id = ws;
  DELETE FROM public.pos_sales WHERE workspace_id = ws;

  DELETE FROM public.acc_journal_lines WHERE workspace_id = ws;
  DELETE FROM public.acc_journals WHERE workspace_id = ws;

  DELETE FROM public.purchase_items WHERE workspace_id = ws;
  DELETE FROM public.purchases WHERE workspace_id = ws;

  DELETE FROM public.stock_movements WHERE workspace_id = ws;

  DELETE FROM public.pos_cash_counts WHERE workspace_id = ws;
  DELETE FROM public.pos_cash_entries WHERE workspace_id = ws;
  DELETE FROM public.pos_shift_moves WHERE workspace_id = ws;
  DELETE FROM public.pos_shifts WHERE workspace_id = ws;

  DELETE FROM public.pos_recipes WHERE workspace_id = ws;
  DELETE FROM public.pos_fixed_assets WHERE workspace_id = ws;
  DELETE FROM public.pos_store_stock WHERE workspace_id = ws;
  DELETE FROM public.pos_backup_runs WHERE workspace_id = ws;
  DELETE FROM public.sync_logs WHERE workspace_id = ws;
  DELETE FROM public.audit_log WHERE workspace_id = ws;
  DELETE FROM public.label_settings WHERE workspace_id = ws;
  DELETE FROM public.courier_profiles WHERE workspace_id = ws;

  DELETE FROM public.att_punches WHERE workspace_id = ws;
  DELETE FROM public.att_payments WHERE workspace_id = ws;
  DELETE FROM public.att_labour WHERE workspace_id = ws;
  DELETE FROM public.att_days WHERE workspace_id = ws;
  DELETE FROM public.att_devices WHERE workspace_id = ws;

  DELETE FROM public.expenses WHERE workspace_id = ws;
  DELETE FROM public.orders WHERE workspace_id = ws;
  DELETE FROM public.invoices WHERE workspace_id = ws;

  DELETE FROM public.customers WHERE workspace_id = ws;
  DELETE FROM public.suppliers WHERE workspace_id = ws;
  DELETE FROM public.products WHERE workspace_id = ws;

  DELETE FROM public.pos_stores WHERE workspace_id = ws;

  DELETE FROM public.pos_settings WHERE workspace_id = ws;
  DELETE FROM public.workspace_settings WHERE workspace_id = ws;
  DELETE FROM public.user_settings WHERE workspace_id = ws;
  DELETE FROM public.acc_settings WHERE workspace_id = ws;
  DELETE FROM public.pos_categories WHERE workspace_id = ws;
  DELETE FROM public.pos_units WHERE workspace_id = ws;

  DELETE FROM public.pos_member_roles WHERE workspace_id = ws;
  DELETE FROM public.user_roles WHERE workspace_id = ws AND user_id <> ws;

  DELETE FROM public.pos_firms WHERE root_id = ws AND id <> firm;

  INSERT INTO public.pos_firms (id, owner_id, root_id, name, pin_hash)
  VALUES (firm, ws, ws, 'Demo Business', NULL)
  ON CONFLICT (id) DO UPDATE SET owner_id = EXCLUDED.owner_id, root_id = EXCLUDED.root_id, name = EXCLUDED.name, pin_hash = NULL;

  INSERT INTO public.pos_stores (id, workspace_id, name, kind, is_default, is_active)
  VALUES (store, ws, 'Main Store', 'store', true, true)
  ON CONFLICT (id) DO UPDATE SET workspace_id = EXCLUDED.workspace_id, name = EXCLUDED.name, is_active = true;

  INSERT INTO public.workspace_subscriptions (workspace_id, expires_at, pos_enabled, ws_enabled)
  VALUES (ws, now() + interval '10 years', true, true)
  ON CONFLICT (workspace_id) DO UPDATE SET expires_at = now() + interval '10 years', pos_enabled = true;

  INSERT INTO public.products (id, workspace_id, name, normalized_name, unit, purchase_price, sale_price, wholesale_price, wholesale_min_qty, stock, tax_percent, category, brand, scope, is_active)
  VALUES
   ('44444444-4444-4444-8444-000000000001', ws, 'Demo Detergent Powder 500g','demo detergent powder 500g','piece',180,240,210,12,120,0,'Cleaning','Demo Brand','pos',true),
   ('44444444-4444-4444-8444-000000000002', ws, 'Demo Bleach 1L','demo bleach 1l','litre',90,130,115,12,80,0,'Cleaning','Demo Brand','pos',true),
   ('44444444-4444-4444-8444-000000000003', ws, 'Demo Glass Cleaner 500ml','demo glass cleaner 500ml','piece',120,170,150,12,100,0,'Cleaning','Demo Brand','pos',true),
   ('44444444-4444-4444-8444-000000000004', ws, 'Demo Dishwash Gel 1L','demo dishwash gel 1l','litre',200,280,250,10,60,0,'Cleaning','Demo Brand','pos',true),
   ('44444444-4444-4444-8444-000000000005', ws, 'Demo Floor Cleaner 5L','demo floor cleaner 5l','litre',850,1100,1000,5,24,0,'Cleaning','Demo Brand','pos',true),
   ('44444444-4444-4444-8444-000000000006', ws, 'Demo Hand Wash 250ml','demo hand wash 250ml','piece',70,110,95,24,150,0,'Personal Care','Demo Brand','pos',true),
   ('44444444-4444-4444-8444-000000000007', ws, 'Demo Caustic Soda 1kg','demo caustic soda 1kg','kg',260,340,310,10,50,17,'Raw Material','Demo Brand','pos',true),
   ('44444444-4444-4444-8444-000000000008', ws, 'Demo Soda Ash 1kg','demo soda ash 1kg','kg',180,230,210,10,70,17,'Raw Material','Demo Brand','pos',true),
   ('44444444-4444-4444-8444-000000000009', ws, 'Demo Soap Base 5kg','demo soap base 5kg','kg',900,1150,1050,5,20,0,'Raw Material','Demo Brand','pos',true),
   ('44444444-4444-4444-8444-000000000010', ws, 'Demo Fragrance Oil 100ml','demo fragrance oil 100ml','piece',150,220,190,12,90,0,'Fragrance','Demo Brand','pos',true),
   ('44444444-4444-4444-8444-000000000011', ws, 'Demo Plastic Bottles (Pack of 12)','demo plastic bottles pack of 12','piece',300,420,370,10,40,0,'Packaging','Demo Brand','pos',true),
   ('44444444-4444-4444-8444-000000000012', ws, 'Demo Labels Roll (1000 pcs)','demo labels roll 1000 pcs','piece',250,350,310,10,35,0,'Packaging','Demo Brand','pos',true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.pos_store_stock (workspace_id, store_id, product_id, qty)
  SELECT ws, store, p.id, p.stock
  FROM public.products p
  WHERE p.workspace_id = ws;

  INSERT INTO public.customers (id, workspace_id, created_by, name, phone, city, address, email, opening_balance, credit_limit, pos_scoped)
  VALUES
   ('55555555-5555-4555-8555-000000000001', ws, ws, 'Demo Shop (Sample)','03001110001','Karachi','Sample Market, Karachi',null,0,50000,true),
   ('55555555-5555-4555-8555-000000000002', ws, ws, 'Demo Traders (Sample)','03001110002','Lahore','Sample Plaza, Lahore',null,2500,100000,true),
   ('55555555-5555-4555-8555-000000000003', ws, ws, 'Demo Mart (Sample)','03001110003','Islamabad','Sample Road, Islamabad',null,0,null,true),
   ('55555555-5555-4555-8555-000000000004', ws, ws, 'Demo General Store (Sample)','03001110004','Faisalabad','Sample Bazaar, Faisalabad',null,0,30000,true),
   ('55555555-5555-4555-8555-000000000005', ws, ws, 'Demo Wholesaler (Sample)','03001110005','Multan','Sample Chowk, Multan',null,5000,200000,true)
  ON CONFLICT (id) DO NOTHING;

  UPDATE public.profiles
  SET full_name = 'Demo User', workspace_id = ws
  WHERE id = ws;

  UPDATE auth.users
  SET encrypted_password = crypt('hbpos-demo-2026', gen_salt('bf')),
      email = 'demo@hbpos.demo',
      updated_at = now()
  WHERE id = ws;

  UPDATE auth.identities
  SET identity_data = identity_data || jsonb_build_object('email', 'demo@hbpos.demo')
  WHERE user_id = ws AND provider = 'email';
END;
$$;