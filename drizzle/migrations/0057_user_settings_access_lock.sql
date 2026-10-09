CREATE OR REPLACE FUNCTION public.user_settings_lock_access()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_platform_owner() OR public.has_role(auth.uid(), 'admin') THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF; RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Only an admin can remove these settings.';
  ELSIF TG_OP = 'UPDATE' AND NEW.allowed_sections IS DISTINCT FROM OLD.allowed_sections THEN
    RAISE EXCEPTION 'Only an admin can change feature access.';
  ELSIF TG_OP = 'INSERT' AND COALESCE(NEW.allowed_sections, '[]'::jsonb) <> '[]'::jsonb THEN
    NEW.allowed_sections := '[]'::jsonb;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS user_settings_lock_access ON public.user_settings;
CREATE TRIGGER user_settings_lock_access BEFORE INSERT OR UPDATE OR DELETE ON public.user_settings
FOR EACH ROW EXECUTE FUNCTION public.user_settings_lock_access();