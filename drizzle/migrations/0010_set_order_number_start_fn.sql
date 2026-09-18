CREATE OR REPLACE FUNCTION public.set_order_number_start(_start integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'only admins can change order numbering';
  END IF;
  IF _start < 1 THEN
    RAISE EXCEPTION 'start must be positive';
  END IF;
  PERFORM setval('public.order_seq', _start, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_order_number_start(integer) TO authenticated;
