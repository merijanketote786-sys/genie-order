ALTER TABLE public.order_templates
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'order';

CREATE INDEX IF NOT EXISTS order_templates_user_kind_idx
  ON public.order_templates (user_id, kind);