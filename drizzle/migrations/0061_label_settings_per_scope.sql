ALTER TABLE public.label_settings ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'workspace';
ALTER TABLE public.label_settings DROP CONSTRAINT label_settings_pkey;
ALTER TABLE public.label_settings ADD CONSTRAINT label_settings_pkey PRIMARY KEY (user_id, scope);