DO $$ BEGIN
  EXECUTE replace(pg_get_functiondef('public.pos_manufacture(uuid,numeric,text)'::regprocedure), 'pos_can(''edit_stock'')', 'pos_can(''manufacture'')');
  EXECUTE replace(pg_get_functiondef('public.pos_save_recipe(jsonb)'::regprocedure), 'pos_can(''edit_products'')', 'pos_can(''mfg_settings'')');
  EXECUTE replace(pg_get_functiondef('public.pos_delete_recipe(uuid)'::regprocedure), 'pos_can(''edit_products'')', 'pos_can(''mfg_settings'')');
END $$;