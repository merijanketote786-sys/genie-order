CREATE OR REPLACE FUNCTION public.is_platform_owner()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND lower(coalesce(auth.jwt() ->> 'email', '')) = 'hhtraders008@gmail.com'
    AND public.has_role(auth.uid(), 'admin');
$$;
REVOKE ALL ON FUNCTION public.is_platform_owner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_owner() TO authenticated, service_role;