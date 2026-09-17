GRANT INSERT ON public.sync_logs TO authenticated;

DROP POLICY IF EXISTS "Workspace admins can add sync logs" ON public.sync_logs;
CREATE POLICY "Workspace admins can add sync logs"
ON public.sync_logs
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  AND public.is_active_team_member(auth.uid())
  AND workspace_id = public.current_workspace()
);