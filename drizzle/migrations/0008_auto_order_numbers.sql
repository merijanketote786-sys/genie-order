CREATE SEQUENCE IF NOT EXISTS public.order_seq START WITH 370 INCREMENT BY 1;

CREATE OR REPLACE FUNCTION public.next_order_number()
RETURNS text
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT lpad(nextval('public.order_seq')::text, 5, '0');
$$;

GRANT EXECUTE ON FUNCTION public.next_order_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_order_number() TO service_role;