CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  name text,
  city text,
  address text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active users can view customers" ON public.customers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Active users can add customers" ON public.customers
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Active users can update customers" ON public.customers
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins can delete customers" ON public.customers
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text,
  customer_name text,
  phone text,
  city text,
  address text,
  product text,
  qty text,
  product_total numeric,
  delivery text,
  advance text,
  status text,
  order_text text NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX orders_created_at_idx ON public.orders (created_at DESC);
CREATE INDEX orders_phone_idx ON public.orders (phone);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active users can view orders" ON public.orders
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Active users can add orders" ON public.orders
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Active users can update orders" ON public.orders
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins can delete orders" ON public.orders
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE SEQUENCE IF NOT EXISTS public.invoice_seq;

CREATE TABLE public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  customer_name text,
  phone text,
  total numeric,
  payment_status text NOT NULL DEFAULT 'unpaid',
  paid_at timestamptz,
  invoice_text text NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX invoices_created_at_idx ON public.invoices (created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active users can view invoices" ON public.invoices
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Active users can add invoices" ON public.invoices
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Active users can update invoices" ON public.invoices
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Admins can delete invoices" ON public.invoices
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER customers_updated_at BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER invoices_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.next_invoice_number()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT 'INV-' || to_char(now(), 'YYMM') || '-' || lpad(nextval('public.invoice_seq')::text, 4, '0');
$$;

REVOKE ALL ON FUNCTION public.next_invoice_number() FROM public;
GRANT EXECUTE ON FUNCTION public.next_invoice_number() TO service_role;
GRANT USAGE ON SEQUENCE public.invoice_seq TO service_role;