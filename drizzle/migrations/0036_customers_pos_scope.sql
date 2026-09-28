ALTER TABLE public.customers ADD COLUMN pos_scoped boolean NOT NULL DEFAULT false;

-- Backfill: customers already used in POS sales/payments are POS parties
UPDATE public.customers c SET pos_scoped = true
WHERE EXISTS (SELECT 1 FROM public.pos_sales s WHERE s.customer_id = c.id)
   OR EXISTS (SELECT 1 FROM public.pos_payments p WHERE p.customer_id = c.id);

-- Future POS transactions auto-mark their customer as a POS party
CREATE OR REPLACE FUNCTION public.customers_mark_pos_scoped()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.customer_id IS NOT NULL THEN
    UPDATE public.customers SET pos_scoped = true WHERE id = NEW.customer_id AND NOT pos_scoped;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER pos_sales_mark_customer_scoped
  AFTER INSERT ON public.pos_sales
  FOR EACH ROW EXECUTE FUNCTION public.customers_mark_pos_scoped();

CREATE TRIGGER pos_payments_mark_customer_scoped
  AFTER INSERT ON public.pos_payments
  FOR EACH ROW EXECUTE FUNCTION public.customers_mark_pos_scoped();