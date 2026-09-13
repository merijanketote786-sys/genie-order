DROP POLICY IF EXISTS "Public can read active products" ON public.products;
DROP POLICY IF EXISTS "Public can read sync logs" ON public.sync_logs;

REVOKE ALL ON public.products FROM anon;
REVOKE ALL ON public.products FROM authenticated;
REVOKE ALL ON public.sync_logs FROM anon;
REVOKE ALL ON public.sync_logs FROM authenticated;

GRANT ALL ON public.products TO service_role;
GRANT ALL ON public.sync_logs TO service_role;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;