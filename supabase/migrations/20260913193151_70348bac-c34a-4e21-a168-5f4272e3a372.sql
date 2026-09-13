CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  normalized_name text NOT NULL UNIQUE,
  unit text NOT NULL CHECK (unit IN ('kg','piece')),
  sale_price numeric(12,2) NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
  p100_staff_price numeric(12,2),
  stock numeric(12,3) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.products TO anon;
GRANT SELECT ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read active products" ON public.products FOR SELECT USING (is_active = true);

CREATE TABLE public.sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  synced_at timestamptz NOT NULL DEFAULT now(),
  total_rows integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  inserted_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'success',
  error_details jsonb
);
GRANT SELECT ON public.sync_logs TO anon;
GRANT SELECT ON public.sync_logs TO authenticated;
GRANT ALL ON public.sync_logs TO service_role;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read sync logs" ON public.sync_logs FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.products_apply_pricing()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE v numeric;
BEGIN
  NEW.updated_at = now();
  IF NEW.unit = 'kg' THEN
    v := round(NEW.sale_price * 1.15 / 10);
    IF v < 150 THEN v := 280; END IF;
    NEW.p100_staff_price := v;
  ELSE
    NEW.p100_staff_price := NULL;
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER products_pricing
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.products_apply_pricing();

CREATE INDEX products_normalized_name_idx ON public.products (normalized_name);