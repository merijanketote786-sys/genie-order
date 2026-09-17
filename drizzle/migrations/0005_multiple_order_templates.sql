ALTER TABLE public.order_templates
  ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT 'My template',
  ADD COLUMN IF NOT EXISTS is_selected boolean NOT NULL DEFAULT true;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.order_templates'::regclass AND contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE public.order_templates DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

DROP INDEX IF EXISTS public.order_templates_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS order_templates_user_name_key
  ON public.order_templates (user_id, lower(name));

CREATE UNIQUE INDEX IF NOT EXISTS order_templates_one_selected_key
  ON public.order_templates (user_id) WHERE is_selected;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_templates TO authenticated;
GRANT ALL ON public.order_templates TO service_role;