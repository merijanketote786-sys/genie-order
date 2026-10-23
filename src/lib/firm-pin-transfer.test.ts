import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const OWNER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const FIRM_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const STORE_A = "11111111-1111-1111-1111-111111111111";
const STORE_B = "22222222-2222-2222-2222-222222222222";
const PROD_A = "33333333-3333-3333-3333-333333333333";

async function setup() {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE SCHEMA extensions;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${OWNER}'::uuid $$;
    -- test stub for pgcrypto
    CREATE FUNCTION extensions.crypt(p text, s text) RETURNS text LANGUAGE sql AS $$ SELECT 'h:' || p $$;
    CREATE FUNCTION extensions.gen_salt(t text) RETURNS text LANGUAGE sql AS $$ SELECT 'salt' $$;

    CREATE TABLE public.user_roles(user_id uuid, workspace_id uuid, role text);
    CREATE TABLE public.profiles(id uuid PRIMARY KEY, workspace_id uuid);
    CREATE TABLE public.pos_firms(id uuid PRIMARY KEY, owner_id uuid, root_id uuid, name text, created_at timestamptz DEFAULT now());
    CREATE TABLE public.workspace_settings(workspace_id uuid, business_name text);
    CREATE TABLE auth.users(id uuid, created_at timestamptz DEFAULT now());
    CREATE TABLE public.audit_log(workspace_id uuid, action text, entity text, entity_id uuid, details jsonb, created_by uuid);
    CREATE TABLE public.pos_stores(id uuid PRIMARY KEY, workspace_id uuid, name text, kind text, is_default boolean, is_active boolean, created_at timestamptz DEFAULT now());
    CREATE TABLE public.products(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid, name text, normalized_name text, unit text, sale_price numeric DEFAULT 0, wholesale_price numeric DEFAULT 0, purchase_price numeric DEFAULT 0, p100_staff_price numeric, p250_staff_price numeric, p500_staff_price numeric, tax_percent numeric, min_stock numeric, scope text, store_id uuid, stock numeric DEFAULT 0, is_active boolean DEFAULT true, updated_at timestamptz DEFAULT now());
    CREATE TABLE public.pos_store_stock(workspace_id uuid, store_id uuid, product_id uuid, qty numeric, UNIQUE(store_id, product_id));
    CREATE TABLE public.stock_movements(workspace_id uuid, product_id uuid, kind text, qty numeric, ref_id uuid, note text, created_by uuid, store_id uuid);

    CREATE FUNCTION public.current_workspace() RETURNS uuid LANGUAGE sql AS $$ SELECT '${OWNER}'::uuid $$;
    CREATE FUNCTION public.pos_can(p text) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;

    INSERT INTO public.user_roles VALUES('${OWNER}', '${OWNER}', 'admin');
    INSERT INTO public.profiles VALUES('${OWNER}', '${OWNER}');
    INSERT INTO public.pos_firms(id, owner_id, root_id, name) VALUES('${OWNER}', '${OWNER}', '${OWNER}', 'Main firm');
    INSERT INTO public.pos_firms(id, owner_id, root_id, name) VALUES('${FIRM_B}', '${OWNER}', '${OWNER}', 'Firm B');
    INSERT INTO public.pos_stores VALUES('${STORE_A}', '${OWNER}', 'Main Store', 'store', true, true, now());
    INSERT INTO public.pos_stores VALUES('${STORE_B}', '${FIRM_B}', 'B Store', 'store', true, true, now());
    INSERT INTO public.products(id, workspace_id, name, normalized_name, unit, scope, stock, is_active) VALUES('${PROD_A}', '${OWNER}', 'Soda Ash', 'soda ash', 'kg', 'pos', 50, true);
    INSERT INTO public.pos_store_stock VALUES('${OWNER}', '${STORE_A}', '${PROD_A}', 20);
  `);
  await db.exec(readFileSync(new URL("../../drizzle/migrations/0073_firm_pin_and_firm_stock_transfer.sql", import.meta.url), "utf8"));
  return db;
}

test("firm PIN must be 4-8 digits", async () => {
  const db = await setup();
  try {
    await assert.rejects(() => db.query("SELECT public.pos_set_firm_pin($1, $2)", [FIRM_B, "12"]));
    await assert.rejects(() => db.query("SELECT public.pos_set_firm_pin($1, $2)", [FIRM_B, "abcd"]));
    await db.query("SELECT public.pos_set_firm_pin($1, $2)", [FIRM_B, "1234"]);
    const r = await db.query<{ has_pin: boolean }>("SELECT (SELECT pin_hash FROM public.pos_firms WHERE id=$1) IS NOT NULL AS has_pin", [FIRM_B]);
    assert.equal(r.rows[0].has_pin, true);
  } finally { await db.close(); }
});

test("switching to a PIN-locked firm requires the correct PIN", async () => {
  const db = await setup();
  try {
    await db.query("SELECT public.pos_set_firm_pin($1, $2)", [FIRM_B, "4321"]);
    await assert.rejects(() => db.query("SELECT public.pos_switch_firm($1)", [FIRM_B]), /Firm PIN required/);
    await assert.rejects(() => db.query("SELECT public.pos_switch_firm($1, $2)", [FIRM_B, "0000"]), /Firm PIN required/);
    await db.query("SELECT public.pos_switch_firm($1, $2)", [FIRM_B, "4321"]);
    const r = await db.query<{ workspace_id: string }>("SELECT workspace_id FROM public.profiles WHERE id=$1", [OWNER]);
    assert.equal(r.rows[0].workspace_id, FIRM_B);
  } finally { await db.close(); }
});

test("firm-to-firm transfer moves stock and auto-creates the item in the other firm", async () => {
  const db = await setup();
  try {
    const items = JSON.stringify([{ product_id: PROD_A, qty: 8 }]);
    const n = await db.query<{ n: number }>("SELECT public.pos_transfer_firm_stock($1, $2, $3, $4) AS n", [STORE_A, STORE_B, items, "test"]);
    assert.equal(n.rows[0].n, 1);
    // source store decreased
    const src = await db.query<{ qty: string }>("SELECT qty FROM public.pos_store_stock WHERE store_id=$1 AND product_id=$2", [STORE_A, PROD_A]);
    assert.equal(Number(src.rows[0].qty), 12);
    // product auto-created in firm B with same name
    const prod = await db.query<{ id: string; stock: string }>("SELECT id, stock FROM public.products WHERE workspace_id=$1 AND normalized_name='soda ash'", [FIRM_B]);
    assert.equal(prod.rows.length, 1);
    assert.equal(Number(prod.rows[0].stock), 8);
    // target store gained stock
    const dst = await db.query<{ qty: string }>("SELECT qty FROM public.pos_store_stock WHERE store_id=$1 AND product_id=$2", [STORE_B, prod.rows[0].id]);
    assert.equal(Number(dst.rows[0].qty), 8);
    // movements recorded in both workspaces
    const mv = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM public.stock_movements");
    assert.equal(mv.rows[0].n, 2);
  } finally { await db.close(); }
});

test("firm-to-firm transfer rejects same-firm target and insufficient stock", async () => {
  const db = await setup();
  try {
    const items = JSON.stringify([{ product_id: PROD_A, qty: 5 }]);
    await assert.rejects(() => db.query("SELECT public.pos_transfer_firm_stock($1, $2, $3, $4)", [STORE_A, STORE_A, items, "x"]), /Same firm/);
    const big = JSON.stringify([{ product_id: PROD_A, qty: 999 }]);
    await assert.rejects(() => db.query("SELECT public.pos_transfer_firm_stock($1, $2, $3, $4)", [STORE_A, STORE_B, big, "x"]), /Stock kam hai/);
  } finally { await db.close(); }
});
