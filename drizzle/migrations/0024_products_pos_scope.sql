ALTER TABLE public.products ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'rates';
ALTER TABLE public.products ADD CONSTRAINT products_scope_check CHECK (scope IN ('rates','pos'));
CREATE UNIQUE INDEX IF NOT EXISTS products_ws_norm_scope_key ON public.products (workspace_id, normalized_name, scope);
DROP INDEX IF EXISTS public.products_workspace_normalized_key;
CREATE INDEX IF NOT EXISTS products_ws_scope_idx ON public.products (workspace_id, scope);