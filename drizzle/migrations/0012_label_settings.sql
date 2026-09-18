CREATE TABLE public.label_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.label_settings TO authenticated;
GRANT ALL ON public.label_settings TO service_role;

ALTER TABLE public.label_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own label settings" ON public.label_settings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own label settings" ON public.label_settings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own label settings" ON public.label_settings
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own label settings" ON public.label_settings
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER label_settings_updated_at
  BEFORE UPDATE ON public.label_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();