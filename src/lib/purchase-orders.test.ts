import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { purchaseSaveError } from "./purchase-save-guard";

const ws = "10000000-0000-4000-8000-000000000001";
const uid = "10000000-0000-4000-8000-000000000002";
const sup = "10000000-0000-4000-8000-000000000003";
const prod = "10000000-0000-4000-8000-000000000004";

async function setup() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${uid}'::uuid $$;
    CREATE FUNCTION public.current_workspace() RETURNS uuid LANGUAGE sql AS $$ SELECT '${ws}'::uuid $$;
    CREATE FUNCTION public.is_active_team_member(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.pos_can(text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1 = 'manage_purchases' $$;
    CREATE FUNCTION public.pos_cfg_prefix(_cfg jsonb, _key text, _def text) RETURNS text LANGUAGE sql AS $$ SELECT coalesce(_cfg->>_key, _def) $$;
    CREATE SEQUENCE public.purchase_seq START 6;
    CREATE TABLE public.test_moves(workspace_id uuid, product_id uuid, qty numeric, kind text, ref_id uuid);
    CREATE FUNCTION public.pos_move_stock(_ws uuid, _product uuid, _qty numeric, _kind text, _ref uuid, _note text) RETURNS void LANGUAGE sql AS $$ INSERT INTO public.test_moves VALUES(_ws,_product,_qty,_kind,_ref) $$;
    CREATE TABLE public.pos_settings(workspace_id uuid PRIMARY KEY, config jsonb);
    CREATE TABLE public.suppliers(id uuid PRIMARY KEY, workspace_id uuid, name text);
    CREATE TABLE public.products(id uuid PRIMARY KEY, workspace_id uuid, purchase_price numeric);
    CREATE TABLE public.purchases(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid, doc_type text DEFAULT 'purchase', doc_number text, status text DEFAULT 'completed',
      payment_status text DEFAULT 'paid', supplier_id uuid, supplier_name text, subtotal numeric DEFAULT 0, discount_total numeric DEFAULT 0, tax_total numeric DEFAULT 0,
      grand_total numeric DEFAULT 0, paid_total numeric DEFAULT 0, balance numeric DEFAULT 0, notes text, ref_purchase_id uuid, ref_order_id uuid,
      created_by uuid, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), client_ref uuid, supplier_bill_no text, freight numeric DEFAULT 0);
    CREATE TABLE public.purchase_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), purchase_id uuid, workspace_id uuid, product_id uuid, name text, unit text,
      qty numeric, rate numeric, discount numeric DEFAULT 0, tax_percent numeric DEFAULT 0, tax_amount numeric DEFAULT 0, line_total numeric, batch text, expiry date);
    CREATE TABLE public.pos_payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid, direction text, method text, amount numeric, supplier_id uuid, purchase_id uuid, kind text, created_by uuid);
    CREATE TABLE public.audit_log(workspace_id uuid, action text, entity text, entity_id uuid, details jsonb, created_by uuid);
    CREATE TABLE public.pos_sales(id uuid, workspace_id uuid, doc_type text, status text, customer_id uuid, supplier_id uuid, grand_total numeric, tax_total numeric, cost_total numeric, created_at timestamptz DEFAULT now());
    INSERT INTO public.suppliers VALUES('${sup}','${ws}','Test Supplier');
    INSERT INTO public.products VALUES('${prod}','${ws}', 100);
  `);
  await db.exec(readFileSync(new URL("../../drizzle/migrations/0066_purchase_orders.sql", import.meta.url), "utf8"));
  await db.exec(readFileSync(new URL("../../drizzle/migrations/0067_purchase_order_conversion_safety.sql", import.meta.url), "utf8"));
  return db;
}

const orderInput = (rate: number | null) => ({
  supplier_id: sup, subtotal: 50, discount_total: 0, tax_total: 0, grand_total: 50,
  items: [{ product_id: prod, name: "Item A", unit: "kg", qty: 5, rate: rate ?? 0, discount: 0, tax_percent: 0, tax_amount: 0, line_total: 50 }],
});

async function saveOrder(db: PGlite, rate: number | null, clientRef?: string) {
  const input = { ...orderInput(rate), client_ref: clientRef ?? "" };
  return (await db.query<{ result: { id: string; number: string; duplicate?: boolean } }>("select public.pos_save_purchase_order($1::jsonb) result", [JSON.stringify(input)])).rows[0]?.result;
}
async function convert(db: PGlite, orderId: string, paid: number) {
  const input = { order_id: orderId, supplier_id: sup, subtotal: 50, discount_total: 0, tax_total: 0, grand_total: 50, paid, method: "Cash", items: orderInput(10).items };
  return (await db.query<{ result: { id: string; number: string } }>("select public.pos_convert_purchase_order($1::jsonb) result", [JSON.stringify(input)])).rows[0]?.result;
}

test("saving an order keeps it open with PO- number, no stock, no payment, no price change", async () => {
  const db = await setup(); try {
    const r = await saveOrder(db, 10);
    assert.equal(r?.number, "PO-00006");
    const row = (await db.query<{ doc_type: string; status: string; payment_status: string; paid_total: string; balance: string }>("select doc_type,status,payment_status,paid_total,balance from purchases")).rows[0];
    assert.equal(row?.doc_type, "order"); assert.equal(row?.status, "open"); assert.equal(row?.payment_status, "pending");
    assert.equal(Number(row?.paid_total), 0); assert.equal(Number(row?.balance), 0);
    assert.equal((await db.query("select * from test_moves")).rows.length, 0);
    assert.equal((await db.query("select * from pos_payments")).rows.length, 0);
    assert.equal(Number((await db.query<{ purchase_price: string }>("select purchase_price from products")).rows[0]?.purchase_price), 100);
  } finally { await db.close(); }
});

test("an order saves even when the rate is left blank", async () => {
  const db = await setup(); try {
    const r = await saveOrder(db, null);
    assert.equal(r?.number, "PO-00006");
    assert.equal(Number((await db.query<{ grand_total: string }>("select grand_total from purchases")).rows[0]?.grand_total), 50);
    assert.equal(Number((await db.query<{ rate: string }>("select rate from purchase_items")).rows[0]?.rate), 0);
  } finally { await db.close(); }
});

test("converting an order creates a real purchase, moves stock, posts payment and marks the order converted", async () => {
  const db = await setup(); try {
    const o = await saveOrder(db, null);
    const r = await convert(db, o!.id, 20);
    assert.equal(r?.number, "PUR-00007");
    const order = (await db.query<{ status: string }>("select status from purchases where doc_type='order'")).rows[0];
    assert.equal(order?.status, "converted");
    const pur = (await db.query<{ ref_order_id: string; paid_total: string; balance: string }>("select ref_order_id,paid_total,balance from purchases where doc_type='purchase'")).rows[0];
    assert.equal(pur?.ref_order_id, o!.id); assert.equal(Number(pur?.paid_total), 20); assert.equal(Number(pur?.balance), 30);
    const moves = (await db.query<{ qty: string; kind: string }>("select qty,kind from test_moves")).rows;
    assert.equal(moves.length, 1); assert.equal(Number(moves[0]?.qty), 5); assert.equal(moves[0]?.kind, "purchase");
    assert.equal((await db.query<{ kind: string }>("select kind from pos_payments")).rows[0]?.kind, "purchase");
    assert.equal(Number((await db.query<{ purchase_price: string }>("select purchase_price from products")).rows[0]?.purchase_price), 10);
  } finally { await db.close(); }
});

test("an order cannot be converted twice", async () => {
  const db = await setup(); try {
    const o = await saveOrder(db, 10);
    await convert(db, o!.id, 0);
    await assert.rejects(convert(db, o!.id, 0), /already converted/);
    assert.equal((await db.query("select * from purchases where doc_type='purchase'")).rows.length, 1);
  } finally { await db.close(); }
});

test("cancelling an open order touches nothing else; a converted order cannot be cancelled", async () => {
  const db = await setup(); try {
    const o = await saveOrder(db, 10);
    await db.query("select public.pos_cancel_purchase_order($1::uuid, $2::text)", [o!.id, "test"]);
    assert.equal((await db.query<{ status: string }>("select status from purchases")).rows[0]?.status, "cancelled");
    assert.equal((await db.query("select * from test_moves")).rows.length, 0);
    const o2 = await saveOrder(db, 10);
    await convert(db, o2!.id, 0);
    await assert.rejects(db.query("select public.pos_cancel_purchase_order($1::uuid, $2::text)", [o2!.id, "x"]), /converted to a purchase/);
  } finally { await db.close(); }
});

test("duplicate client_ref returns the same order instead of inserting again", async () => {
  const db = await setup(); try {
    const ref = "30000000-0000-4000-8000-000000000001";
    const a = await saveOrder(db, 10, ref);
    const b = await saveOrder(db, 10, ref);
    assert.equal(a?.id, b?.id); assert.equal(b?.duplicate, true);
    assert.equal((await db.query("select * from purchases")).rows.length, 1);
  } finally { await db.close(); }
});

test("All stores blocks actual purchases including conversion, but permits non-stock orders", async () => {
  assert.equal(purchaseSaveError("purchase", true, 50, 50, true), "Select a specific store before saving a purchase");
  assert.equal(purchaseSaveError("order", true, 0, 50, false), null);
  const db = await setup(); try {
    const order = await saveOrder(db, 10);
    assert.ok(order);
    await db.query("select set_config('request.headers', $1, false)", [JSON.stringify({ "x-pos-store": "all-stores" })]);
    await assert.rejects(convert(db, order.id, 50), /Select a specific store/);
    assert.equal((await db.query("select * from test_moves")).rows.length, 0);
    assert.equal((await db.query("select * from purchases where doc_type='purchase'")).rows.length, 0);
    assert.equal((await db.query<{status: string}>("select status from purchases")).rows[0]?.status, "open");
  } finally { await db.close(); }
});

test("unpaid conversion without a supplier is rejected atomically; fully paid cash is allowed", async () => {
  assert.equal(purchaseSaveError("purchase", false, 20, 50, false), "Select a party for a credit purchase");
  const db = await setup(); try {
    const order = await saveOrder(db, 10);
    assert.ok(order);
    await db.query("update purchases set supplier_id = null where id = $1", [order.id]);
    const input = { order_id: order.id, grand_total: 50, paid: 20, items: orderInput(10).items };
    await assert.rejects(db.query("select public.pos_convert_purchase_order($1::jsonb)", [JSON.stringify(input)]), /Select a party/);
    assert.equal((await db.query("select * from test_moves")).rows.length, 0);
    assert.equal((await db.query("select * from pos_payments")).rows.length, 0);
    assert.equal((await db.query<{status: string}>("select status from purchases")).rows[0]?.status, "open");
    await db.query("select public.pos_convert_purchase_order($1::jsonb)", [JSON.stringify({ ...input, paid: 50 })]);
    assert.equal((await db.query("select * from purchases where doc_type='purchase'")).rows.length, 1);
  } finally { await db.close(); }
});
