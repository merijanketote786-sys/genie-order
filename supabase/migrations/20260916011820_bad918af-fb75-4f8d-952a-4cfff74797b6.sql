-- 1) current_workspace(): SECURITY DEFINER -> SECURITY INVOKER, callable by signed-in users only
CREATE OR REPLACE FUNCTION public.current_workspace()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT p.workspace_id FROM public.profiles p WHERE p.id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.current_workspace() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_workspace() TO authenticated, service_role;

-- 2) workspace columns on business tables
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS workspace_id uuid;
ALTER TABLE public.orders    ADD COLUMN IF NOT EXISTS workspace_id uuid;
ALTER TABLE public.invoices  ADD COLUMN IF NOT EXISTS workspace_id uuid;

UPDATE public.customers c
SET workspace_id = COALESCE(
  (SELECT p.workspace_id FROM public.profiles p WHERE p.id = c.created_by),
  (SELECT p.workspace_id FROM public.profiles p ORDER BY p.created_at LIMIT 1)
)
WHERE c.workspace_id IS NULL;

UPDATE public.orders o
SET workspace_id = COALESCE(
  (SELECT p.workspace_id FROM public.profiles p WHERE p.id = o.created_by),
  (SELECT p.workspace_id FROM public.profiles p ORDER BY p.created_at LIMIT 1)
)
WHERE o.workspace_id IS NULL;

UPDATE public.invoices i
SET workspace_id = COALESCE(
  (SELECT p.workspace_id FROM public.profiles p WHERE p.id = i.created_by),
  (SELECT p.workspace_id FROM public.profiles p ORDER BY p.created_at LIMIT 1)
)
WHERE i.workspace_id IS NULL;

ALTER TABLE public.customers ALTER COLUMN workspace_id SET DEFAULT public.current_workspace();
ALTER TABLE public.orders    ALTER COLUMN workspace_id SET DEFAULT public.current_workspace();
ALTER TABLE public.invoices  ALTER COLUMN workspace_id SET DEFAULT public.current_workspace();

ALTER TABLE public.customers ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.orders    ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.invoices  ALTER COLUMN workspace_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS customers_workspace_idx ON public.customers (workspace_id);
CREATE INDEX IF NOT EXISTS orders_workspace_idx ON public.orders (workspace_id);
CREATE INDEX IF NOT EXISTS invoices_workspace_idx ON public.invoices (workspace_id);

-- phone unique per workspace instead of globally
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_phone_key;
DROP INDEX IF EXISTS public.customers_phone_key;
CREATE UNIQUE INDEX IF NOT EXISTS customers_workspace_phone_key
  ON public.customers (workspace_id, phone);

-- 3) workspace-scoped policies for customers / orders / invoices
DROP POLICY IF EXISTS "Active team can view customers" ON public.customers;
DROP POLICY IF EXISTS "Active team can add customers" ON public.customers;
DROP POLICY IF EXISTS "Active team can update customers" ON public.customers;
DROP POLICY IF EXISTS "Admins can delete customers" ON public.customers;

CREATE POLICY "Workspace team can view customers" ON public.customers FOR SELECT TO authenticated
  USING (public.is_active_team_member(auth.uid()) AND workspace_id = public.current_workspace());
CREATE POLICY "Workspace team can add customers" ON public.customers FOR INSERT TO authenticated
  WITH CHECK (public.is_active_team_member(auth.uid()) AND workspace_id = public.current_workspace());
CREATE POLICY "Workspace team can update customers" ON public.customers FOR UPDATE TO authenticated
  USING (public.is_active_team_member(auth.uid()) AND workspace_id = public.current_workspace())
  WITH CHECK (public.is_active_team_member(auth.uid()) AND workspace_id = public.current_workspace());
CREATE POLICY "Workspace admins can delete customers" ON public.customers FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND workspace_id = public.current_workspace());

DROP POLICY IF EXISTS "Active team can view orders" ON public.orders;
DROP POLICY IF EXISTS "Active team can add orders" ON public.orders;
DROP POLICY IF EXISTS "Active team can update orders" ON public.orders;
DROP POLICY IF EXISTS "Admins can delete orders" ON public.orders;

CREATE POLICY "Workspace team can view orders" ON public.orders FOR SELECT TO authenticated
  USING (public.is_active_team_member(auth.uid()) AND workspace_id = public.current_workspace());
CREATE POLICY "Workspace team can add orders" ON public.orders FOR INSERT TO authenticated
  WITH CHECK (public.is_active_team_member(auth.uid()) AND workspace_id = public.current_workspace());
CREATE POLICY "Workspace team can update orders" ON public.orders FOR UPDATE TO authenticated
  USING (public.is_active_team_member(auth.uid()) AND workspace_id = public.current_workspace())
  WITH CHECK (public.is_active_team_member(auth.uid()) AND workspace_id = public.current_workspace());
CREATE POLICY "Workspace admins can delete orders" ON public.orders FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND workspace_id = public.current_workspace());

DROP POLICY IF EXISTS "Active team can view invoices" ON public.invoices;
DROP POLICY IF EXISTS "Active team can add invoices" ON public.invoices;
DROP POLICY IF EXISTS "Active team can update invoices" ON public.invoices;
DROP POLICY IF EXISTS "Admins can delete invoices" ON public.invoices;

CREATE POLICY "Workspace team can view invoices" ON public.invoices FOR SELECT TO authenticated
  USING (public.is_active_team_member(auth.uid()) AND workspace_id = public.current_workspace());
CREATE POLICY "Workspace team can add invoices" ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (public.is_active_team_member(auth.uid()) AND workspace_id = public.current_workspace());
CREATE POLICY "Workspace team can update invoices" ON public.invoices FOR UPDATE TO authenticated
  USING (public.is_active_team_member(auth.uid()) AND workspace_id = public.current_workspace())
  WITH CHECK (public.is_active_team_member(auth.uid()) AND workspace_id = public.current_workspace());
CREATE POLICY "Workspace admins can delete invoices" ON public.invoices FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND workspace_id = public.current_workspace());

-- 4) products + sync_logs: explicit workspace-scoped read access
GRANT SELECT ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
DROP POLICY IF EXISTS "Workspace members can view products" ON public.products;
CREATE POLICY "Workspace members can view products" ON public.products FOR SELECT TO authenticated
  USING (public.is_active_team_member(auth.uid()) AND workspace_id = public.current_workspace());

GRANT SELECT ON public.sync_logs TO authenticated;
GRANT ALL ON public.sync_logs TO service_role;
DROP POLICY IF EXISTS "Workspace members can view sync logs" ON public.sync_logs;
CREATE POLICY "Workspace members can view sync logs" ON public.sync_logs FOR SELECT TO authenticated
  USING (public.is_active_team_member(auth.uid()) AND workspace_id = public.current_workspace());
