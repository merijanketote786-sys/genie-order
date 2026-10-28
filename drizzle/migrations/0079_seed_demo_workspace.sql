-- One-time demo workspace: lets new visitors try the full POS before signing up.
-- All rows use fixed UUIDs so re-running is a no-op.

-- 1) Demo auth user (handle_new_user trigger auto-creates profile + admin role)
INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-4111-8111-111111111111',
  'authenticated', 'authenticated',
  'demo@hbpos.demo',
  crypt('hbpos-demo-2026', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Demo User"}'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'email',
  jsonb_build_object('sub','11111111-1111-4111-8111-111111111111','email','demo@hbpos.demo','email_verified',true,'full_name','Demo User'),
  now(), now(), now()
WHERE NOT EXISTS (SELECT 1 FROM auth.identities WHERE user_id = '11111111-1111-4111-8111-111111111111' AND provider = 'email');

-- 2) Demo firm + store
INSERT INTO public.pos_firms (id, owner_id, root_id, name)
VALUES ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'Demo Business')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.pos_stores (id, workspace_id, name, kind, is_default, is_active)
VALUES ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111', 'Main Store', 'store', true, true)
ON CONFLICT (id) DO NOTHING;

-- 3) Subscription stays active for the demo workspace
INSERT INTO public.workspace_subscriptions (workspace_id, expires_at, pos_enabled, ws_enabled)
VALUES ('11111111-1111-4111-8111-111111111111', now() + interval '10 years', true, true)
ON CONFLICT (workspace_id) DO NOTHING;

-- 4) Sample products (clearly-labelled demo items)
INSERT INTO public.products (id, workspace_id, name, normalized_name, unit, purchase_price, sale_price, wholesale_price, wholesale_min_qty, stock, tax_percent, category, brand, scope, is_active)
VALUES
 ('44444444-4444-4444-8444-000000000001','11111111-1111-4111-8111-111111111111','Demo Detergent Powder 500g','demo detergent powder 500g','piece',180,240,210,12,120,0,'Cleaning','Demo Brand','pos',true),
 ('44444444-4444-4444-8444-000000000002','11111111-1111-4111-8111-111111111111','Demo Bleach 1L','demo bleach 1l','litre',90,130,115,12,80,0,'Cleaning','Demo Brand','pos',true),
 ('44444444-4444-4444-8444-000000000003','11111111-1111-4111-8111-111111111111','Demo Glass Cleaner 500ml','demo glass cleaner 500ml','piece',120,170,150,12,100,0,'Cleaning','Demo Brand','pos',true),
 ('44444444-4444-4444-8444-000000000004','11111111-1111-4111-8111-111111111111','Demo Dishwash Gel 1L','demo dishwash gel 1l','litre',200,280,250,10,60,0,'Cleaning','Demo Brand','pos',true),
 ('44444444-4444-4444-8444-000000000005','11111111-1111-4111-8111-111111111111','Demo Floor Cleaner 5L','demo floor cleaner 5l','litre',850,1100,1000,5,24,0,'Cleaning','Demo Brand','pos',true),
 ('44444444-4444-4444-8444-000000000006','11111111-1111-4111-8111-111111111111','Demo Hand Wash 250ml','demo hand wash 250ml','piece',70,110,95,24,150,0,'Personal Care','Demo Brand','pos',true),
 ('44444444-4444-4444-8444-000000000007','11111111-1111-4111-8111-111111111111','Demo Caustic Soda 1kg','demo caustic soda 1kg','kg',260,340,310,10,50,17,'Raw Material','Demo Brand','pos',true),
 ('44444444-4444-4444-8444-000000000008','11111111-1111-4111-8111-111111111111','Demo Soda Ash 1kg','demo soda ash 1kg','kg',180,230,210,10,70,17,'Raw Material','Demo Brand','pos',true),
 ('44444444-4444-4444-8444-000000000009','11111111-1111-4111-8111-111111111111','Demo Soap Base 5kg','demo soap base 5kg','kg',900,1150,1050,5,20,0,'Raw Material','Demo Brand','pos',true),
 ('44444444-4444-4444-8444-000000000010','11111111-1111-4111-8111-111111111111','Demo Fragrance Oil 100ml','demo fragrance oil 100ml','piece',150,220,190,12,90,0,'Fragrance','Demo Brand','pos',true),
 ('44444444-4444-4444-8444-000000000011','11111111-1111-4111-8111-111111111111','Demo Plastic Bottles (Pack of 12)','demo plastic bottles pack of 12','piece',300,420,370,10,40,0,'Packaging','Demo Brand','pos',true),
 ('44444444-4444-4444-8444-000000000012','11111111-1111-4111-8111-111111111111','Demo Labels Roll (1000 pcs)','demo labels roll 1000 pcs','piece',250,350,310,10,35,0,'Packaging','Demo Brand','pos',true)
ON CONFLICT (id) DO NOTHING;

-- 5) Per-store stock for the demo store
INSERT INTO public.pos_store_stock (workspace_id, store_id, product_id, qty)
SELECT '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', p.id, p.stock
FROM public.products p
WHERE p.workspace_id = '11111111-1111-4111-8111-111111111111'
  AND NOT EXISTS (
    SELECT 1 FROM public.pos_store_stock s
    WHERE s.workspace_id = p.workspace_id AND s.store_id = '33333333-3333-4333-8333-333333333333' AND s.product_id = p.id
  );

-- 6) Sample customers
INSERT INTO public.customers (id, workspace_id, created_by, name, phone, city, address, email, opening_balance, credit_limit, pos_scoped)
VALUES
 ('55555555-5555-4555-8555-000000000001','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','Demo Shop (Sample)','03001110001','Karachi','Sample Market, Karachi',null,0,50000,true),
 ('55555555-5555-4555-8555-000000000002','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','Demo Traders (Sample)','03001110002','Lahore','Sample Plaza, Lahore',null,2500,100000,true),
 ('55555555-5555-4555-8555-000000000003','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','Demo Mart (Sample)','03001110003','Islamabad','Sample Road, Islamabad',null,0,null,true),
 ('55555555-5555-4555-8555-000000000004','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','Demo General Store (Sample)','03001110004','Faisalabad','Sample Bazaar, Faisalabad',null,0,30000,true),
 ('55555555-5555-4555-8555-000000000005','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','Demo Wholesaler (Sample)','03001110005','Multan','Sample Chowk, Multan',null,5000,200000,true)
ON CONFLICT (id) DO NOTHING;