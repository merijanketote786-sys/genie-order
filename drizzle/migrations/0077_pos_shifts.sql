CREATE TABLE public.pos_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL DEFAULT public.current_workspace(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  opened_at timestamptz NOT NULL DEFAULT now(),
  opening_float numeric NOT NULL DEFAULT 0,
  closed_at timestamptz,
  counted_cash numeric,
  expected_cash numeric,
  summary jsonb,
  note text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed'))
);
CREATE UNIQUE INDEX pos_shifts_one_open ON public.pos_shifts(workspace_id, user_id) WHERE status = 'open';
CREATE TABLE public.pos_shift_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES public.pos_shifts(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL DEFAULT public.current_workspace(),
  direction text NOT NULL CHECK (direction IN ('in','out')),
  amount numeric NOT NULL CHECK (amount > 0),
  note text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.pos_shifts TO authenticated;
GRANT SELECT, INSERT ON public.pos_shift_moves TO authenticated;
GRANT ALL ON public.pos_shifts, public.pos_shift_moves TO service_role;
ALTER TABLE public.pos_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_shift_moves ENABLE ROW LEVEL SECURITY;
CREATE POLICY shifts_read ON public.pos_shifts FOR SELECT TO authenticated USING (workspace_id = public.current_workspace() AND (user_id = auth.uid() OR public.pos_is_admin()));
CREATE POLICY shifts_open ON public.pos_shifts FOR INSERT TO authenticated WITH CHECK (workspace_id = public.current_workspace() AND user_id = auth.uid() AND status = 'open' AND public.pos_can('view_pos'));
CREATE POLICY shifts_close ON public.pos_shifts FOR UPDATE TO authenticated USING (workspace_id = public.current_workspace() AND user_id = auth.uid() AND status = 'open') WITH CHECK (workspace_id = public.current_workspace() AND user_id = auth.uid());
CREATE POLICY moves_read ON public.pos_shift_moves FOR SELECT TO authenticated USING (workspace_id = public.current_workspace() AND (created_by = auth.uid() OR public.pos_is_admin()));
CREATE POLICY moves_add ON public.pos_shift_moves FOR INSERT TO authenticated WITH CHECK (workspace_id = public.current_workspace() AND created_by = auth.uid() AND EXISTS (SELECT 1 FROM public.pos_shifts s WHERE s.id = shift_id AND s.user_id = auth.uid() AND s.status = 'open'));