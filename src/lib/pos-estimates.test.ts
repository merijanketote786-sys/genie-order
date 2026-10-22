import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { estimateInvoiceNumber } from "./pos-doc-number";

const ws = "10000000-0000-4000-8000-000000000001";
const id = "10000000-0000-4000-8000-000000000002";
async function setup() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${id}'::uuid $$;
    CREATE FUNCTION public.current_workspace() RETURNS uuid LANGUAGE sql AS $$ SELECT '${ws}'::uuid $$;
    CREATE FUNCTION public.is_active_team_member(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.pos_can(text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1 IN ('view_pos','create_sale') $$;
    CREATE FUNCTION public.pos_find_customer(uuid,text) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION public.pos_delete_doc(uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
    CREATE FUNCTION public.pos_save_sale(jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('number',$1->>'doc_number') $$;
    CREATE TABLE public.pos_sales(id uuid PRIMARY KEY,workspace_id uuid,doc_type text,doc_number text,status text,payment_status text,client_ref uuid,customer_id uuid,customer_name text,customer_phone text,subtotal numeric,discount_total numeric,tax_total numeric,delivery numeric,grand_total numeric,paid_total numeric,balance numeric,notes text,payload jsonb,updated_at timestamptz,cost_total numeric);
    CREATE TABLE public.customers(id uuid,workspace_id uuid);
    CREATE TABLE public.products(id uuid,workspace_id uuid,scope text,purchase_price numeric);
    CREATE TABLE public.pos_sale_items(sale_id uuid,workspace_id uuid,product_id uuid,name text,sku text,unit text,rate_type text,qty numeric,stock_qty numeric,rate numeric,cost numeric,discount numeric,tax_percent numeric,tax_amount numeric,line_total numeric,note text);
    CREATE TABLE public.pos_payments(sale_id uuid,workspace_id uuid);
    CREATE TABLE public.audit_log(workspace_id uuid,action text,entity text,entity_id uuid,details jsonb,created_by uuid);
    INSERT INTO public.pos_sales(id,workspace_id,doc_type,doc_number,status,payment_status,grand_total) VALUES('${id}','${ws}','quotation','QT-00053','completed','quotation',12500);
  `);
  for (const file of ["0063_add_estimate_save_delete_functions.sql", "0064_clarify_estimate_cost_variable.sql", "0065_pos_conversion_prefix_and_party_details.sql"]) {
    await db.exec(readFileSync(new URL(`../../drizzle/migrations/${file}`, import.meta.url), "utf8"));
  }
  return db;
}
async function save(db: PGlite, docType = "quotation", clientRef?: string) {
  const input = { convert_from_id: id, doc_type: docType, doc_number: "NEW-NUMBER", grand_total: 12500, subtotal: 12500, items: [{ name: "Test item", qty: 1, stock_qty: 1, rate: 12500, line_total: 12500 }], client_ref: clientRef };
  return (await db.query<{ result: { id: string; number: string; duplicate?: boolean } }>("select public.pos_save_doc_v3($1::jsonb) result", [JSON.stringify(input)])).rows[0]?.result;
}
test("estimate edit retains QT-00053 and its identity rather than inserting another estimate", async () => {
  const db = await setup();
  try {
    const result = await save(db);
    assert.equal(result?.number, "QT-00053"); assert.equal(result?.id, id);
    const rows = (await db.query<{ doc_number: string; status: string; grand_total: string }>("select doc_number,status,grand_total from pos_sales")).rows;
    assert.equal(rows.length, 1); assert.equal(rows[0]?.status, "completed");
    assert.equal((await db.query("select * from pos_sale_items")).rows.length, 1);
    assert.equal((await db.query("select * from pos_payments")).rows.length, 0);
  } finally { await db.close(); }
});
test("conversion replaces QT with INV and preserves 00053 even when a different number is submitted", async () => {
  const db = await setup(); try {
    assert.equal((await save(db, "sale"))?.number, "INV-00053");
    assert.equal(estimateInvoiceNumber("QT-00053"), "INV-00053");
  } finally { await db.close(); }
});
test("sales staff without edit_sale or admin can delete estimates and receive an audit entry", async () => {
  const db = await setup(); try {
    await db.query("select public.pos_delete_doc_v2($1::uuid)", [id]);
    assert.equal((await db.query("select * from pos_sales")).rows.length, 0);
    assert.equal((await db.query<{ action: string }>("select action from audit_log")).rows[0]?.action, "delete");
  } finally { await db.close(); }
});
test("staff cannot delete invoices", async () => {
  const db = await setup(); try {
    await db.exec("update pos_sales set doc_type='sale'");
    await assert.rejects(db.query("select public.pos_delete_doc_v2($1::uuid)", [id]), /Only estimates/);
    assert.equal((await db.query("select * from pos_sales")).rows.length, 1);
  } finally { await db.close(); }
});
test("cross-workspace estimate deletion is denied", async () => {
  const db = await setup(); try {
    await db.exec("update pos_sales set workspace_id='20000000-0000-4000-8000-000000000001'");
    await assert.rejects(db.query("select public.pos_delete_doc_v2($1::uuid)", [id]), /Document not found/);
  } finally { await db.close(); }
});
test("staff without POS sales permission cannot delete estimates", async () => {
  const db = await setup(); try {
    await db.exec("CREATE OR REPLACE FUNCTION public.pos_can(text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$");
    await assert.rejects(db.query("select public.pos_delete_doc_v2($1::uuid)", [id]), /permission required/);
  } finally { await db.close(); }
});
test("estimate save retries do not replace items again", async () => {
  const db = await setup(); try {
    const ref = "30000000-0000-4000-8000-000000000001";
    await save(db, "quotation", ref);
    assert.equal((await save(db, "quotation", ref))?.duplicate, true);
    assert.equal((await db.query("select * from pos_sale_items")).rows.length, 1);
  } finally { await db.close(); }
});