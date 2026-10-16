CREATE TABLE public.pos_fixed_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL DEFAULT public.current_workspace(),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 160),
  category text NOT NULL DEFAULT 'Other' CHECK (length(trim(category)) BETWEEN 1 AND 80),
  quantity numeric NOT NULL DEFAULT 1 CHECK (quantity > 0 AND quantity <= 1000000000),
  purchase_cost numeric NOT NULL DEFAULT 0 CHECK (purchase_cost >= 0 AND purchase_cost <= 1000000000000),
  purchase_date date,
  serial_number text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','repair','retired','archived')),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.pos_fixed_assets TO authenticated;
GRANT ALL ON public.pos_fixed_assets TO service_role;
ALTER TABLE public.pos_fixed_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "POS assets read" ON public.pos_fixed_assets FOR SELECT TO authenticated USING (workspace_id = public.current_workspace() AND public.pos_can('view_pos') AND NOT EXISTS (SELECT 1 FROM public.user_settings u WHERE u.user_id = auth.uid() AND u.allowed_sections ? '!pos'));
CREATE POLICY "POS assets insert" ON public.pos_fixed_assets FOR INSERT TO authenticated WITH CHECK (workspace_id = public.current_workspace() AND public.pos_can('edit_stock'));
CREATE POLICY "POS assets update" ON public.pos_fixed_assets FOR UPDATE TO authenticated USING (workspace_id = public.current_workspace() AND public.pos_can('edit_stock')) WITH CHECK (workspace_id = public.current_workspace() AND public.pos_can('edit_stock'));
CREATE INDEX pos_fixed_assets_workspace_name_idx ON public.pos_fixed_assets(workspace_id, name);
CREATE TRIGGER pos_fixed_assets_updated BEFORE UPDATE ON public.pos_fixed_assets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER pos_fixed_assets_subscription BEFORE INSERT OR UPDATE OR DELETE ON public.pos_fixed_assets FOR EACH ROW EXECUTE FUNCTION public.sub_guard();
COMMENT ON TABLE public.pos_fixed_assets IS 'POS-only asset register; no inventory, payments or journal entries are posted by register edits.';