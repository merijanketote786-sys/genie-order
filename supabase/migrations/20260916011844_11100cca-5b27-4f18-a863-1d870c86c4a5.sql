ALTER FUNCTION public.current_workspace() SECURITY INVOKER;
REVOKE ALL ON FUNCTION public.current_workspace() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_workspace() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_workspace() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_workspace() TO service_role;
