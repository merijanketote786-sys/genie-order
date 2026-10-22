DO $migration$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.pos_save_doc_v2(jsonb)'::regprocedure) INTO definition;
  definition := replace(definition,'cost_total numeric := 0;', 'estimate_cost numeric := 0;');
  definition := replace(definition,'cost_total := cost_total + coalesce(cost,0);','estimate_cost := estimate_cost + coalesce(cost,0);');
  definition := replace(definition,'SET cost_total = cost_total WHERE','SET cost_total = estimate_cost WHERE');
  EXECUTE definition;
END;
$migration$;