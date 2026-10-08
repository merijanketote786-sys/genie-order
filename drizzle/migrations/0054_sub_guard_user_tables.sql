CREATE OR REPLACE FUNCTION public.sub_guard_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE uid uuid; ws uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN uid := (to_jsonb(OLD) ->> 'user_id')::uuid; ELSE uid := (to_jsonb(NEW) ->> 'user_id')::uuid; END IF;
  IF auth.uid() IS NOT NULL AND NOT public.is_platform_owner() THEN
    SELECT workspace_id INTO ws FROM public.profiles WHERE id = uid;
    IF ws IS NOT NULL AND NOT public.ws_active(ws) THEN
      RAISE EXCEPTION 'Subscription expired. Your account is read-only. Please contact the admin to renew.';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS sub_guard_order_templates ON public.order_templates;
CREATE TRIGGER sub_guard_order_templates BEFORE INSERT OR UPDATE OR DELETE ON public.order_templates
  FOR EACH ROW EXECUTE FUNCTION public.sub_guard_user();
DROP TRIGGER IF EXISTS sub_guard_att_punches ON public.att_punches;
CREATE TRIGGER sub_guard_att_punches BEFORE INSERT OR UPDATE OR DELETE ON public.att_punches
  FOR EACH ROW EXECUTE FUNCTION public.sub_guard();