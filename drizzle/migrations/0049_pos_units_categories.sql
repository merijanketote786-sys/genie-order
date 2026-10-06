CREATE TABLE public.pos_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL DEFAULT public.current_workspace(),
  name text NOT NULL,
  short_name text,
  parent_id uuid REFERENCES public.pos_units(id) ON DELETE CASCADE,
  factor numeric NOT NULL DEFAULT 1 CHECK (factor > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);
COMMENT ON COLUMN public.pos_units.factor IS 'For sub units: how many of this unit make 1 parent (main) unit';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_units TO authenticated;
GRANT ALL ON public.pos_units TO service_role;
ALTER TABLE public.pos_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pos units read" ON public.pos_units FOR SELECT TO authenticated USING (workspace_id = public.current_workspace() AND public.is_active_team_member(auth.uid()));
CREATE POLICY "pos units insert" ON public.pos_units FOR INSERT TO authenticated WITH CHECK (workspace_id = public.current_workspace() AND (public.pos_can('edit_stock') OR public.pos_is_admin()));
CREATE POLICY "pos units update" ON public.pos_units FOR UPDATE TO authenticated USING (workspace_id = public.current_workspace() AND (public.pos_can('edit_stock') OR public.pos_is_admin())) WITH CHECK (workspace_id = public.current_workspace());
CREATE POLICY "pos units delete" ON public.pos_units FOR DELETE TO authenticated USING (workspace_id = public.current_workspace() AND (public.pos_can('edit_stock') OR public.pos_is_admin()));

CREATE TABLE public.pos_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL DEFAULT public.current_workspace(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_categories TO authenticated;
GRANT ALL ON public.pos_categories TO service_role;
ALTER TABLE public.pos_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pos cats read" ON public.pos_categories FOR SELECT TO authenticated USING (workspace_id = public.current_workspace() AND public.is_active_team_member(auth.uid()));
CREATE POLICY "pos cats insert" ON public.pos_categories FOR INSERT TO authenticated WITH CHECK (workspace_id = public.current_workspace() AND (public.pos_can('edit_stock') OR public.pos_is_admin()));
CREATE POLICY "pos cats update" ON public.pos_categories FOR UPDATE TO authenticated USING (workspace_id = public.current_workspace() AND (public.pos_can('edit_stock') OR public.pos_is_admin())) WITH CHECK (workspace_id = public.current_workspace());
CREATE POLICY "pos cats delete" ON public.pos_categories FOR DELETE TO authenticated USING (workspace_id = public.current_workspace() AND (public.pos_can('edit_stock') OR public.pos_is_admin()));