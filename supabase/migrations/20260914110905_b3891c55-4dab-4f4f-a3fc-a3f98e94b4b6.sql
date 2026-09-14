ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_unit_check;
ALTER TABLE public.products ADD CONSTRAINT products_unit_check CHECK (unit = ANY (ARRAY['kg'::text, 'piece'::text, 'litre'::text, 'grammes'::text, 'pcs'::text, 'bottles'::text, 'bundles'::text]));

CREATE OR REPLACE FUNCTION public.products_apply_pricing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE v numeric;
BEGIN
  NEW.updated_at = now();
  IF NEW.unit = 'kg' OR NEW.unit = 'litre' THEN
    v := round(NEW.sale_price * 1.15 / 10);
    IF v < 150 THEN v := 280; END IF;
    NEW.p100_staff_price := v;
  ELSIF NEW.unit = 'grammes' THEN
    NEW.p100_staff_price := NEW.sale_price;
  ELSE
    NEW.p100_staff_price := NULL;
  END IF;
  RETURN NEW;
END;
$function$;

-- Ensure trigger exists (idempotent)
DROP TRIGGER IF EXISTS products_pricing ON public.products;
CREATE TRIGGER products_pricing
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.products_apply_pricing();