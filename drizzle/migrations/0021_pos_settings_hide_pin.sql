REVOKE SELECT ON public.pos_settings FROM authenticated, anon;
GRANT SELECT (workspace_id, config, updated_at) ON public.pos_settings TO authenticated;