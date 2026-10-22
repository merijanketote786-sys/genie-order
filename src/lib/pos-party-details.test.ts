import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const customer = "10000000-0000-4000-8000-000000000002";
const supplier = "10000000-0000-4000-8000-000000000003";
async function setup() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${customer}'::uuid $$;
    CREATE FUNCTION public.current_workspace() RETURNS uuid LANGUAGE sql AS $$ SELECT '${customer}'::uuid $$;
    CREATE FUNCTION public.is_active_team_member(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION public.pos_save_doc_v2(jsonb) RETURNS jsonb LANGUAGE sql AS $$ SELECT $1 $$;
    CREATE TABLE customers(id uuid PRIMARY KEY,workspace_id uuid,pos_scoped boolean,name text,phone text,address text,updated_at timestamptz,opening_balance numeric);
    CREATE TABLE suppliers(id uuid PRIMARY KEY,workspace_id uuid,is_active boolean,name text,phone text,address text,opening_balance numeric);
    CREATE TABLE pos_sales(id uuid,workspace_id uuid,customer_id uuid,doc_type text);
    CREATE TABLE pos_payments(workspace_id uuid,customer_id uuid);
    INSERT INTO customers VALUES('${customer}','${customer}',true,'Original','03000000000','Old',now(),125);
    INSERT INTO suppliers VALUES('${supplier}','${customer}',true,'Original','03000000000','Old',250);
    INSERT INTO pos_sales VALUES('${supplier}','${customer}','${customer}','sale');
  `);
  await db.exec(readFileSync(new URL("../../drizzle/migrations/0065_pos_conversion_prefix_and_party_details.sql", import.meta.url), "utf8"));
  return db;
}
async function edit(db: PGlite, supplierId: string | null = supplier) {
  return db.query("select pos_edit_party_details($1::uuid,$2::uuid,$3::jsonb)", [customer, supplierId, JSON.stringify({ name: "Updated", phone: "03000000001", address: "New address" })]);
}
test("party details change on both existing IDs without changing balances or invoice links", async () => {
  const db = await setup(); try {
    await edit(db);
    assert.deepEqual((await db.query("select id,name,phone,address,opening_balance::text from customers")).rows, [{ id: customer, name: "Updated", phone: "03000000001", address: "New address", opening_balance: "125" }]);
    assert.deepEqual((await db.query("select id,name,phone,address,opening_balance::text from suppliers")).rows, [{ id: supplier, name: "Updated", phone: "03000000001", address: "New address", opening_balance: "250" }]);
    assert.equal((await db.query<{customer_id: string}>("select customer_id from pos_sales")).rows[0]?.customer_id, customer);
  } finally { await db.close(); }
});
test("party save is atomic when a linked record belongs to another workspace", async () => {
  const db = await setup(); try {
    await db.exec(`update suppliers set workspace_id='20000000-0000-4000-8000-000000000001'`);
    await assert.rejects(edit(db), /Party not found/);
    assert.equal((await db.query<{name: string}>("select name from customers")).rows[0]?.name, "Original");
  } finally { await db.close(); }
});
test("Workspace-only customers cannot be edited through POS party details", async () => {
  const db = await setup(); try {
    await db.exec("update customers set pos_scoped=false; delete from pos_sales where customer_id is not null");
    await assert.rejects(edit(db, null), /POS party not found/);
  } finally { await db.close(); }
});