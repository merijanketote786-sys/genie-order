ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.pos_stores(id);
CREATE INDEX IF NOT EXISTS expenses_ws_store_idx ON public.expenses(workspace_id, store_id);
CREATE OR REPLACE FUNCTION public.expenses_check_store() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.store_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.pos_stores WHERE id = NEW.store_id AND workspace_id = NEW.workspace_id) THEN
    RAISE EXCEPTION 'Store not found';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.expenses_check_store() FROM PUBLIC, anon;
DROP TRIGGER IF EXISTS expenses_store_guard ON public.expenses;
CREATE TRIGGER expenses_store_guard BEFORE INSERT OR UPDATE OF store_id ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.expenses_check_store();
UPDATE public.expenses e SET store_id = s.id FROM public.pos_stores s WHERE e.store_id IS NULL AND s.workspace_id = e.workspace_id AND s.is_default;