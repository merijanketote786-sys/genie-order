CREATE TABLE public.att_labour (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL DEFAULT public.current_workspace(),
  name text NOT NULL,
  phone text,
  bio_id text,
  salary_type text NOT NULL DEFAULT 'daily' CHECK (salary_type IN ('daily','weekly','monthly')),
  rate numeric NOT NULL DEFAULT 0,
  work_days numeric NOT NULL DEFAULT 6,
  full_hours numeric NOT NULL DEFAULT 8,
  half_hours numeric NOT NULL DEFAULT 4,
  paid_leaves integer NOT NULL DEFAULT 0,
  ot_rate numeric NOT NULL DEFAULT 0,
  post_expense boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX att_labour_ws_bio ON public.att_labour(workspace_id, bio_id);

CREATE TABLE public.att_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL DEFAULT public.current_workspace(),
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'wifi' CHECK (kind IN ('wifi','usb')),
  serial text,
  token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(16),'hex'),
  last_seen timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX att_devices_serial ON public.att_devices(upper(serial)) WHERE serial IS NOT NULL AND serial <> '';
CREATE UNIQUE INDEX att_devices_token ON public.att_devices(token);

CREATE TABLE public.att_punches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL DEFAULT public.current_workspace(),
  bio_id text NOT NULL,
  day date NOT NULL,
  tm time NOT NULL,
  device_id uuid REFERENCES public.att_devices(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'file',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, bio_id, day, tm)
);

CREATE TABLE public.att_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL DEFAULT public.current_workspace(),
  labour_id uuid NOT NULL REFERENCES public.att_labour(id) ON DELETE CASCADE,
  day date NOT NULL,
  status text NOT NULL CHECK (status IN ('full','half','leave','absent')),
  in_time time,
  out_time time,
  ot_hours numeric NOT NULL DEFAULT 0,
  source text NOT NULL DEFAULT 'manual',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (labour_id, day)
);
CREATE INDEX att_days_ws_day ON public.att_days(workspace_id, day);

CREATE TABLE public.att_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL DEFAULT public.current_workspace(),
  labour_id uuid NOT NULL REFERENCES public.att_labour(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('salary','advance')),
  amount numeric NOT NULL CHECK (amount > 0),
  pay_date date NOT NULL DEFAULT CURRENT_DATE,
  method text NOT NULL DEFAULT 'Cash',
  period_from date,
  period_to date,
  note text,
  expense_posted boolean NOT NULL DEFAULT false,
  client_ref uuid UNIQUE,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.att_labour, public.att_devices, public.att_punches, public.att_days, public.att_payments TO authenticated;
GRANT ALL ON public.att_labour, public.att_devices, public.att_punches, public.att_days, public.att_payments TO service_role;

ALTER TABLE public.att_labour ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.att_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.att_punches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.att_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.att_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ws read" ON public.att_labour FOR SELECT TO authenticated USING (workspace_id = (SELECT public.current_workspace()));
CREATE POLICY "ws write" ON public.att_labour FOR ALL TO authenticated USING (workspace_id = (SELECT public.current_workspace()) AND (SELECT public.pos_can('manage_expenses'))) WITH CHECK (workspace_id = (SELECT public.current_workspace()) AND (SELECT public.pos_can('manage_expenses')));
CREATE POLICY "ws read" ON public.att_devices FOR SELECT TO authenticated USING (workspace_id = (SELECT public.current_workspace()) AND (SELECT public.pos_can('settings')));
CREATE POLICY "ws write" ON public.att_devices FOR ALL TO authenticated USING (workspace_id = (SELECT public.current_workspace()) AND (SELECT public.pos_can('settings'))) WITH CHECK (workspace_id = (SELECT public.current_workspace()) AND (SELECT public.pos_can('settings')));
CREATE POLICY "ws read" ON public.att_punches FOR SELECT TO authenticated USING (workspace_id = (SELECT public.current_workspace()));
CREATE POLICY "ws insert" ON public.att_punches FOR INSERT TO authenticated WITH CHECK (workspace_id = (SELECT public.current_workspace()) AND (SELECT public.pos_can('manage_expenses')));
CREATE POLICY "ws read" ON public.att_days FOR SELECT TO authenticated USING (workspace_id = (SELECT public.current_workspace()));
CREATE POLICY "ws write" ON public.att_days FOR ALL TO authenticated USING (workspace_id = (SELECT public.current_workspace()) AND (SELECT public.pos_can('manage_expenses'))) WITH CHECK (workspace_id = (SELECT public.current_workspace()) AND (SELECT public.pos_can('manage_expenses')));
CREATE POLICY "ws read" ON public.att_payments FOR SELECT TO authenticated USING (workspace_id = (SELECT public.current_workspace()));
CREATE POLICY "ws insert" ON public.att_payments FOR INSERT TO authenticated WITH CHECK (workspace_id = (SELECT public.current_workspace()) AND (SELECT public.pos_can('manage_expenses')));

CREATE OR REPLACE FUNCTION public.att_recalc_day(_ws uuid, _bio text, _day date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; mn time; mx time; n int; hrs numeric; st text;
BEGIN
  SELECT * INTO l FROM att_labour WHERE workspace_id = _ws AND bio_id = _bio AND is_active ORDER BY created_at LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT min(tm), max(tm), count(*) INTO mn, mx, n FROM att_punches WHERE workspace_id = _ws AND bio_id = _bio AND day = _day;
  IF n = 0 THEN RETURN; END IF;
  hrs := extract(epoch FROM (mx - mn)) / 3600.0;
  st := CASE WHEN n > 1 AND hrs >= l.full_hours THEN 'full' ELSE 'half' END;
  INSERT INTO att_days (workspace_id, labour_id, day, status, in_time, out_time, ot_hours, source)
  VALUES (_ws, l.id, _day, st, mn, CASE WHEN n > 1 THEN mx END, round(greatest(0, hrs - l.full_hours)::numeric, 2), 'device')
  ON CONFLICT (labour_id, day) DO UPDATE SET status = EXCLUDED.status, in_time = EXCLUDED.in_time, out_time = EXCLUDED.out_time, ot_hours = EXCLUDED.ot_hours, updated_at = now()
  WHERE att_days.source <> 'manual';
END $$;
REVOKE ALL ON FUNCTION public.att_recalc_day(uuid, text, date) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.att_on_punch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.att_recalc_day(NEW.workspace_id, NEW.bio_id, NEW.day);
  RETURN NEW;
END $$;
CREATE TRIGGER att_punch_after AFTER INSERT ON public.att_punches FOR EACH ROW EXECUTE FUNCTION public.att_on_punch();