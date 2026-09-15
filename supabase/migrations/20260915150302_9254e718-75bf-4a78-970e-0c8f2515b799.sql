ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS custom_sale_price numeric,
  ADD COLUMN IF NOT EXISTS custom_p100_price numeric,
  ADD COLUMN IF NOT EXISTS custom_p250_price numeric,
  ADD COLUMN IF NOT EXISTS custom_p500_price numeric;

CREATE OR REPLACE FUNCTION public.products_apply_pricing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v100 numeric;
  v250 numeric;
  v500 numeric;
  u text;
BEGIN
  u := lower(coalesce(NEW.unit, ''));

  IF u IN ('kg', 'kilograms', 'litre', 'litres', 'liter', 'ltr') THEN
    v100 := round(NEW.sale_price * 1.15 / 10);
    v250 := round(NEW.sale_price * 1.08 / 4);
    v500 := round(NEW.sale_price * 1.05 / 2);

    IF v100 < 150 THEN
      v100 := round(v100 * 1.85);
    END IF;
    IF v250 < 150 THEN
      v250 := 280;
    END IF;
    IF v500 < 150 THEN
      v500 := 280;
    END IF;

    NEW.p100_staff_price := v100;
    NEW.p250_staff_price := v250;
    NEW.p500_staff_price := v500;
  ELSIF u IN ('grammes', 'gram', 'grams') THEN
    NEW.p100_staff_price := NEW.sale_price;
    NEW.p250_staff_price := NEW.sale_price;
    NEW.p500_staff_price := NEW.sale_price;
  ELSE
    NEW.p100_staff_price := NULL;
    NEW.p250_staff_price := NULL;
    NEW.p500_staff_price := NULL;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;