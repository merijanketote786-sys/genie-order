CREATE TABLE public.signup_requests (
  user_id uuid PRIMARY KEY,
  login_email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz
);
GRANT SELECT ON public.signup_requests TO authenticated;
GRANT ALL ON public.signup_requests TO service_role;
ALTER TABLE public.signup_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own request read" ON public.signup_requests FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.flag_phone_signup()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE em text;
BEGIN
  SELECT email INTO em FROM auth.users WHERE id = NEW.id;
  IF em ILIKE '%@phone.hbchemicalspakistan.com' AND NEW.workspace_id IS NOT DISTINCT FROM NEW.id THEN
    INSERT INTO public.signup_requests(user_id, login_email) VALUES (NEW.id, em) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;
CREATE TRIGGER trg_flag_phone_signup AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.flag_phone_signup();