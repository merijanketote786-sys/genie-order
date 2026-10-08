CREATE OR REPLACE FUNCTION public.auto_confirm_phone_signup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF lower(NEW.email) LIKE '%@phone.hbchemicalspakistan.com' AND NEW.email_confirmed_at IS NULL THEN
    NEW.email_confirmed_at := now();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS auto_confirm_phone_signup ON auth.users;
CREATE TRIGGER auto_confirm_phone_signup BEFORE INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.auto_confirm_phone_signup();