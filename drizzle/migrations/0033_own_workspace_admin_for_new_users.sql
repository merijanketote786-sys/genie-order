CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  ws uuid;
  shared boolean;
BEGIN
  shared := lower(NEW.email) IN ('merijanketote786@gmail.com','hhtraders008@gmail.com');
  ws := CASE WHEN lower(NEW.email) = 'merijanketote786@gmail.com'
    THEN COALESCE((SELECT id FROM auth.users WHERE lower(email) = 'hhtraders008@gmail.com' LIMIT 1), NEW.id)
    ELSE NEW.id END;

  INSERT INTO public.profiles (id, full_name, workspace_id, role)
  VALUES (NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', ''),
    ws, CASE WHEN shared THEN 'staff' ELSE 'admin' END)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role, workspace_id)
  VALUES (NEW.id, CASE WHEN shared THEN 'staff'::app_role ELSE 'admin'::app_role END,
    (SELECT workspace_id FROM public.profiles WHERE id = NEW.id))
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;