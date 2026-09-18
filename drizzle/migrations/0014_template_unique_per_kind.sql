DROP INDEX IF EXISTS public.order_templates_user_name_key;
DROP INDEX IF EXISTS public.order_templates_one_selected_key;
CREATE UNIQUE INDEX order_templates_user_kind_name_key ON public.order_templates (user_id, kind, lower(name));
CREATE UNIQUE INDEX order_templates_one_selected_per_kind_key ON public.order_templates (user_id, kind) WHERE is_selected;