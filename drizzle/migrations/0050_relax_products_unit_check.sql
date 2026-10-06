ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_unit_check;
ALTER TABLE public.products ADD CONSTRAINT products_unit_check CHECK (length(btrim(unit)) BETWEEN 1 AND 40);