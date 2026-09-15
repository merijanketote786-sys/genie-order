CREATE TABLE public.order_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  template_text text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_templates TO authenticated;
GRANT ALL ON public.order_templates TO service_role;

ALTER TABLE public.order_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own order template"
ON public.order_templates
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own order template"
ON public.order_templates
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own order template"
ON public.order_templates
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own order template"
ON public.order_templates
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.order_templates_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER order_templates_updated_at
BEFORE UPDATE ON public.order_templates
FOR EACH ROW
EXECUTE FUNCTION public.order_templates_set_updated_at();