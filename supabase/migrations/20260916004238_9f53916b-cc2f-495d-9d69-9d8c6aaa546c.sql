CREATE OR REPLACE FUNCTION public.is_active_team_member(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = _user_id
      AND p.is_active
  ) AND EXISTS (
    SELECT 1
    FROM public.user_roles r
    WHERE r.user_id = _user_id
      AND r.role IN ('admin','staff')
  )
$$;

DROP POLICY IF EXISTS "Active users can view customers" ON public.customers;
DROP POLICY IF EXISTS "Active users can add customers" ON public.customers;
DROP POLICY IF EXISTS "Active users can update customers" ON public.customers;
CREATE POLICY "Active team can view customers" ON public.customers FOR SELECT TO authenticated USING (public.is_active_team_member(auth.uid()));
CREATE POLICY "Active team can add customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (public.is_active_team_member(auth.uid()));
CREATE POLICY "Active team can update customers" ON public.customers FOR UPDATE TO authenticated USING (public.is_active_team_member(auth.uid())) WITH CHECK (public.is_active_team_member(auth.uid()));

DROP POLICY IF EXISTS "Active users can view orders" ON public.orders;
DROP POLICY IF EXISTS "Active users can add orders" ON public.orders;
DROP POLICY IF EXISTS "Active users can update orders" ON public.orders;
CREATE POLICY "Active team can view orders" ON public.orders FOR SELECT TO authenticated USING (public.is_active_team_member(auth.uid()));
CREATE POLICY "Active team can add orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (public.is_active_team_member(auth.uid()));
CREATE POLICY "Active team can update orders" ON public.orders FOR UPDATE TO authenticated USING (public.is_active_team_member(auth.uid())) WITH CHECK (public.is_active_team_member(auth.uid()));

DROP POLICY IF EXISTS "Active users can view invoices" ON public.invoices;
DROP POLICY IF EXISTS "Active users can add invoices" ON public.invoices;
DROP POLICY IF EXISTS "Active users can update invoices" ON public.invoices;
CREATE POLICY "Active team can view invoices" ON public.invoices FOR SELECT TO authenticated USING (public.is_active_team_member(auth.uid()));
CREATE POLICY "Active team can add invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (public.is_active_team_member(auth.uid()));
CREATE POLICY "Active team can update invoices" ON public.invoices FOR UPDATE TO authenticated USING (public.is_active_team_member(auth.uid())) WITH CHECK (public.is_active_team_member(auth.uid()));