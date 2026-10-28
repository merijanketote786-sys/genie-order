CREATE TABLE public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'PKR',
  period text NOT NULL DEFAULT 'month',
  features text NOT NULL DEFAULT '',
  highlight boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_plans TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription_plans TO authenticated;
GRANT ALL ON public.subscription_plans TO service_role;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone sees active plans" ON public.subscription_plans FOR SELECT TO anon, authenticated USING (is_active OR public.is_platform_owner());
CREATE POLICY "Owner inserts plans" ON public.subscription_plans FOR INSERT TO authenticated WITH CHECK (public.is_platform_owner());
CREATE POLICY "Owner updates plans" ON public.subscription_plans FOR UPDATE TO authenticated USING (public.is_platform_owner()) WITH CHECK (public.is_platform_owner());
CREATE POLICY "Owner deletes plans" ON public.subscription_plans FOR DELETE TO authenticated USING (public.is_platform_owner());