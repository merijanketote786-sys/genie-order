CREATE TABLE public.courier_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL DEFAULT current_workspace(),
  name text NOT NULL,
  config jsonb NOT NULL,
  source_file text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX courier_profiles_workspace_name_idx
  ON public.courier_profiles (workspace_id, lower(name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.courier_profiles TO authenticated;
GRANT ALL ON public.courier_profiles TO service_role;

ALTER TABLE public.courier_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace team can view courier profiles"
  ON public.courier_profiles FOR SELECT TO authenticated
  USING (is_active_team_member(auth.uid()) AND workspace_id = current_workspace());

CREATE POLICY "Workspace team can add courier profiles"
  ON public.courier_profiles FOR INSERT TO authenticated
  WITH CHECK (is_active_team_member(auth.uid()) AND workspace_id = current_workspace());

CREATE POLICY "Workspace team can update courier profiles"
  ON public.courier_profiles FOR UPDATE TO authenticated
  USING (is_active_team_member(auth.uid()) AND workspace_id = current_workspace())
  WITH CHECK (is_active_team_member(auth.uid()) AND workspace_id = current_workspace());

CREATE POLICY "Workspace team can delete courier profiles"
  ON public.courier_profiles FOR DELETE TO authenticated
  USING (is_active_team_member(auth.uid()) AND workspace_id = current_workspace());

CREATE TRIGGER courier_profiles_set_updated_at
  BEFORE UPDATE ON public.courier_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();