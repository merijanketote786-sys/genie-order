REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_admin_for_owner_email() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.profiles_guard_privileged_columns() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.products_apply_pricing() FROM PUBLIC, anon, authenticated;