CREATE TABLE public.pos_courier_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL DEFAULT public.current_workspace(),
  courier text NOT NULL CHECK (courier IN ('postex','trax','leopards','manual','confirmflow')),
  label text NOT NULL DEFAULT '',
  credentials jsonb NOT NULL DEFAULT '{}'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  webhook_token text UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pos_courier_accounts_ws ON public.pos_courier_accounts(workspace_id);

CREATE TABLE public.pos_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL DEFAULT public.current_workspace(),
  sale_id uuid,
  doc_number text NOT NULL,
  account_id uuid REFERENCES public.pos_courier_accounts(id) ON DELETE SET NULL,
  courier text NOT NULL,
  confirm_token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
  confirmation text NOT NULL DEFAULT 'pending' CHECK (confirmation IN ('pending','confirmed','cancelled','not_required')),
  status text NOT NULL DEFAULT 'draft',
  tracking_number text,
  consignee_name text NOT NULL DEFAULT '',
  consignee_phone text NOT NULL DEFAULT '',
  consignee_address text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  city_code text,
  cod_amount numeric NOT NULL DEFAULT 0,
  weight_kg numeric NOT NULL DEFAULT 0.5,
  pieces int NOT NULL DEFAULT 1,
  item_summary text NOT NULL DEFAULT '',
  remarks text,
  history jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_error text,
  booked_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pos_shipments_ws ON public.pos_shipments(workspace_id, created_at DESC);
CREATE INDEX pos_shipments_doc ON public.pos_shipments(workspace_id, doc_number);
CREATE INDEX pos_shipments_tn ON public.pos_shipments(tracking_number);

CREATE TABLE public.pos_courier_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid,
  source text NOT NULL,
  payload jsonb NOT NULL,
  shipment_id uuid,
  result text,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pos_courier_events_ws ON public.pos_courier_events(workspace_id, received_at DESC);

GRANT SELECT ON public.pos_courier_accounts TO authenticated;
GRANT SELECT ON public.pos_shipments TO authenticated;
GRANT SELECT ON public.pos_courier_events TO authenticated;
GRANT ALL ON public.pos_courier_accounts, public.pos_shipments, public.pos_courier_events TO service_role;

ALTER TABLE public.pos_courier_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_courier_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY courier_accounts_admin_read ON public.pos_courier_accounts FOR SELECT TO authenticated
  USING (workspace_id = public.current_workspace() AND public.pos_is_admin());
CREATE POLICY shipments_read ON public.pos_shipments FOR SELECT TO authenticated
  USING (workspace_id = public.current_workspace() AND public.pos_can('view_pos'));
CREATE POLICY courier_events_admin_read ON public.pos_courier_events FOR SELECT TO authenticated
  USING (workspace_id = public.current_workspace() AND public.pos_is_admin());