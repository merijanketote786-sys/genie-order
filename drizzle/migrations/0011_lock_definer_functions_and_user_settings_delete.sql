REVOKE ALL ON FUNCTION public.next_order_number() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_order_number_start(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_order_number() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_order_number_start(integer) TO authenticated, service_role;

GRANT DELETE ON public.user_settings TO authenticated;
DROP POLICY IF EXISTS "Users can delete own settings" ON public.user_settings;
CREATE POLICY "Users can delete own settings"
ON public.user_settings
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);