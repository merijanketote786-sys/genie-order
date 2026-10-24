import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

async function setup() {
  const db = new PGlite();
  await db.exec(`
    CREATE TABLE public.invoices(id uuid, payment_status text);
    CREATE TABLE public.pos_sales(id uuid DEFAULT gen_random_uuid(), invoice_id uuid, status text);
    CREATE TABLE public.pos_sale_items(sale_id uuid, qty numeric);
    CREATE TABLE public.pos_payments(sale_id uuid, amount numeric, status text);
    CREATE TABLE public.access_flags(pos boolean, workspace boolean);
    INSERT INTO public.access_flags VALUES(true,false);
    CREATE FUNCTION public.workspace_guard() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'You do not have Workspace access'; END $$;
    CREATE TRIGGER workspace_guard BEFORE INSERT OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.workspace_guard();
    CREATE FUNCTION public.pos_save_sale(_p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $function$
    DECLARE dtype text := _p->>'doc_type'; sid uuid; inv uuid; edit_id uuid;
    BEGIN
      IF NOT (SELECT pos FROM public.access_flags) THEN RAISE EXCEPTION 'POS access denied'; END IF;
      INSERT INTO public.pos_sales(status) VALUES('completed') RETURNING id INTO sid;
      INSERT INTO public.pos_sale_items VALUES(sid,1);
      INSERT INTO public.pos_payments VALUES(sid,100,'completed');
  IF dtype = 'sale' THEN
    INSERT INTO public.invoices(id) VALUES(sid) RETURNING id INTO inv;
    UPDATE public.pos_sales SET invoice_id = inv WHERE id = sid;
  END IF;
  IF edit_id IS NOT NULL THEN
    UPDATE public.pos_sales SET status = 'converted' WHERE id = edit_id;
  END IF;
      RETURN jsonb_build_object('id',sid);
    END $function$;
    CREATE FUNCTION public.pos_cancel_sale_core(_id uuid,_reason text) RETURNS void LANGUAGE plpgsql AS $function$
    DECLARE s record;
    BEGIN
      SELECT * INTO s FROM public.pos_sales WHERE id=_id;
      UPDATE public.pos_payments SET status='cancelled' WHERE sale_id=_id;
    UPDATE public.invoices SET payment_status = 'cancelled' WHERE id = s.invoice_id;
      UPDATE public.pos_sales SET status='cancelled' WHERE id=_id;
    END $function$;
  `);
  return db;
}
const migration = readFileSync(new URL("../../drizzle/migrations/0075_keep_pos_invoice_saves_in_pos.sql", import.meta.url), "utf8");

test("POS-only user saves invoice with items/payment without any Workspace invoice write", async () => {
  const db = await setup();
  try {
    await assert.rejects(db.query("select pos_save_sale('{\"doc_type\":\"sale\"}')"), /Workspace access/);
    await db.exec(migration);
    const result = await db.query<{ result: { id: string } }>("select pos_save_sale('{\"doc_type\":\"sale\"}') result");
    assert.ok(result.rows[0]?.result.id);
    assert.equal((await db.query("select * from pos_sales")).rows.length, 1);
    assert.equal((await db.query("select * from pos_sale_items")).rows.length, 1);
    assert.equal((await db.query("select * from pos_payments")).rows.length, 1);
    assert.equal((await db.query("select * from invoices")).rows.length, 0);
  } finally { await db.close(); }
});

test("POS cancellation stays independent of Workspace and retains historical mirror link", async () => {
  const db = await setup();
  try {
    await db.exec(migration);
    const id = "10000000-0000-4000-8000-000000000001";
    await db.query("insert into pos_sales(id,invoice_id,status) values($1,$1,'completed')", [id]);
    await db.query("select pos_cancel_sale_core($1,'Cancelled')", [id]);
    const row = (await db.query<{ status: string; invoice_id: string }>("select status,invoice_id from pos_sales")).rows[0];
    assert.equal(row?.status, "cancelled");
    assert.equal(row?.invoice_id, id);
  } finally { await db.close(); }
});

test("removing Workspace mirror does not bypass disabled POS access", async () => {
  const db = await setup();
  try {
    await db.exec(migration);
    await db.exec("update access_flags set pos=false,workspace=true");
    await assert.rejects(db.query("select pos_save_sale('{\"doc_type\":\"sale\"}')"), /POS access denied/);
    assert.equal((await db.query("select * from pos_sales")).rows.length, 0);
  } finally { await db.close(); }
});