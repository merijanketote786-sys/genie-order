import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

async function check(email: string, role: string) {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
      CREATE TABLE public.user_roles(user_id uuid, role text);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '61244c5b-5fcf-4e53-b21b-918dda3f3059'::uuid $$;
      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT current_setting('test.claims')::jsonb $$;
      CREATE FUNCTION public.has_role(uid uuid, wanted text) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=uid AND role=wanted) $$;
    `);
    await db.query("SELECT set_config('test.claims', $1, false)", [JSON.stringify({ email })]);
    await db.query("INSERT INTO public.user_roles VALUES(auth.uid(), $1)", [role]);
    await db.exec(readFileSync(new URL("../../drizzle/migrations/0072_correct_platform_owner_staff_identity.sql", import.meta.url), "utf8"));
    return (await db.query<{ owner: boolean }>("SELECT public.is_platform_owner() AS owner")).rows[0]?.owner;
  } finally { await db.close(); }
}

test("merijanketote786@gmail.com is staff, not platform owner", async () => {
  assert.equal(await check("merijanketote786@gmail.com", "staff"), false);
  assert.equal(await check("merijanketote786@gmail.com", "admin"), false);
});

test("main owner requires a protected admin role", async () => {
  assert.equal(await check("hhtraders008@gmail.com", "admin"), true);
  assert.equal(await check("hhtraders008@gmail.com", "staff"), false);
});