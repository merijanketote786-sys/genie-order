-- 1) profiles.workspace_id
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS workspace_id uuid;
UPDATE public.profiles SET workspace_id = id WHERE workspace_id IS NULL;

-- HB owner workspace
DO $$
DECLARE hb uuid;
BEGIN
  SELECT id INTO hb FROM auth.users WHERE lower(email) = 'hhtraders008@gmail.com' LIMIT 1;
  IF hb IS NOT NULL THEN
    UPDATE public.profiles SET workspace_id = hb WHERE id = hb;
    UPDATE public.profiles p SET workspace_id = hb
      FROM auth.users u
      WHERE u.id = p.id AND lower(u.email) = 'merijanketote786@gmail.com';
  END IF;
END $$;

ALTER TABLE public.profiles ALTER COLUMN workspace_id SET NOT NULL;

-- 2) products.workspace_id
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS workspace_id uuid;
UPDATE public.products SET workspace_id = COALESCE(
  (SELECT id FROM auth.users WHERE lower(email) = 'hhtraders008@gmail.com' LIMIT 1),
  '00000000-0000-0000-0000-000000000000'::uuid
) WHERE workspace_id IS NULL;
ALTER TABLE public.products ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_normalized_name_key;
DROP INDEX IF EXISTS products_normalized_name_key;
DROP INDEX IF EXISTS products_normalized_name_idx;
CREATE UNIQUE INDEX IF NOT EXISTS products_workspace_normalized_key
  ON public.products (workspace_id, normalized_name);

-- 3) sync_logs.workspace_id
ALTER TABLE public.sync_logs ADD COLUMN IF NOT EXISTS workspace_id uuid;
UPDATE public.sync_logs SET workspace_id = (
  SELECT id FROM auth.users WHERE lower(email) = 'hhtraders008@gmail.com' LIMIT 1
) WHERE workspace_id IS NULL;
CREATE INDEX IF NOT EXISTS sync_logs_workspace_idx ON public.sync_logs (workspace_id, synced_at DESC);

-- 4) helper
CREATE OR REPLACE FUNCTION public.current_workspace(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT workspace_id FROM public.profiles WHERE id = _user_id), _user_id);
$$;

-- 5) new users get their own workspace
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, workspace_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', ''),
    CASE WHEN lower(NEW.email) = 'merijanketote786@gmail.com'
      THEN COALESCE((SELECT id FROM auth.users WHERE lower(email) = 'hhtraders008@gmail.com' LIMIT 1), NEW.id)
      ELSE NEW.id END
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'staff')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;