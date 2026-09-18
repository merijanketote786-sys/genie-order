CREATE TABLE public.workspace_settings (
  workspace_id uuid PRIMARY KEY,
  business_name text NOT NULL DEFAULT '',
  business_phone text NOT NULL DEFAULT '',
  business_address text NOT NULL DEFAULT '',
  currency text NOT NULL DEFAULT 'Rs',
  invoice_prefix text NOT NULL DEFAULT 'INV-',
  order_number_start integer NOT NULL DEFAULT 370,
  default_delivery text NOT NULL DEFAULT '',
  default_payment_method text NOT NULL DEFAULT 'COD',
  allowed_sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE ON public.workspace_settings TO authenticated;
GRANT ALL ON public.workspace_settings TO service_role;

ALTER TABLE public.workspace_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace team can view workspace settings"
ON public.workspace_settings FOR SELECT TO authenticated
USING (is_active_team_member(auth.uid()) AND workspace_id = current_workspace());

CREATE POLICY "Workspace admins can add workspace settings"
ON public.workspace_settings FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND workspace_id = current_workspace());

CREATE POLICY "Workspace admins can update workspace settings"
ON public.workspace_settings FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) AND workspace_id = current_workspace())
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND workspace_id = current_workspace());

CREATE TRIGGER workspace_settings_updated_at
BEFORE UPDATE ON public.workspace_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL DEFAULT current_workspace(),
  theme text NOT NULL DEFAULT 'system',
  payment_enabled boolean NOT NULL DEFAULT false,
  default_payment_method text NOT NULL DEFAULT 'COD',
  default_delivery text NOT NULL DEFAULT '',
  default_city text NOT NULL DEFAULT '',
  default_courier_profile_id uuid,
  default_weight text NOT NULL DEFAULT '1',
  auto_order_number boolean NOT NULL DEFAULT true,
  compact_mode boolean NOT NULL DEFAULT false,
  allowed_sections jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settings"
ON public.user_settings FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can add own settings"
ON public.user_settings FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND workspace_id = current_workspace());

CREATE POLICY "Users can update own settings"
ON public.user_settings FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Workspace admins can view member settings"
ON public.user_settings FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) AND workspace_id = current_workspace());

CREATE POLICY "Workspace admins can update member settings"
ON public.user_settings FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) AND workspace_id = current_workspace())
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) AND workspace_id = current_workspace());

CREATE TRIGGER user_settings_updated_at
BEFORE UPDATE ON public.user_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
