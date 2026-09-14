ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS p250_staff_price numeric,
  ADD COLUMN IF NOT EXISTS p500_staff_price numeric;

CREATE OR REPLACE FUNCTION public.products_apply_pricing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_unit text := lower(coalesce(NEW.unit, ''));
  v100 numeric;
  v250 numeric;
  v500 numeric;
BEGIN
  IF v_unit IN ('kg', 'litre') THEN
    v100 := round(NEW.sale_price * 1.15 / 10);
    v250 := round(NEW.sale_price * 1.08 / 4);
    v500 := round(NEW.sale_price * 1.05 / 2);
    IF v100 < 150 THEN v100 := 280; END IF;
    IF v250 < 150 THEN v250 := 280; END IF;
    IF v500 < 150 THEN v500 := 280; END IF;
    NEW.p100_staff_price := v100;
    NEW.p250_staff_price := v250;
    NEW.p500_staff_price := v500;
  ELSIF v_unit = 'grammes' THEN
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