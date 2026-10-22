import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { z } from "zod";

// Execute the actual server handlers against a filtered in-memory Data API,
// keeping regression coverage on queries and results rather than source text.
function handlers(file: string) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: Record<string, (args: unknown) => Promise<any>> = {};
  const builder = { middleware: () => builder, inputValidator: () => builder, handler: (fn: unknown) => fn };
  const requireStub = (id: string) => {
    if (id === "@tanstack/react-start") return { createServerFn: () => builder };
    if (id.includes("auth-middleware")) return { requireSupabaseAuth: {} };
    if (id.includes("pos-store.server")) return { withStore: (q: unknown) => q };
    if (id === "./pos-errors") return { friendlyDbError: (_e: unknown, fallback: string) => fallback };
    if (id === "zod") return { z };
    throw new Error(`Unexpected import ${id}`);
  };
  new Function("require", "exports", code)(requireStub, exports);
  return exports;
}

const date = new Date().toISOString();
const purchases = [
  { doc_type: "order", status: "open", grand_total: 900, supplier_id: "s", doc_number: "PO-1", created_at: date },
  { doc_type: "order", status: "converted", grand_total: 100, supplier_id: "s", doc_number: "PO-2", created_at: date },
  { doc_type: "purchase", status: "completed", grand_total: 100, supplier_id: "s", doc_number: "PUR-2", created_at: date, paid_total: 0, balance: 100 },
  { doc_type: "return", status: "completed", grand_total: 20, supplier_id: "s", doc_number: "RET-1", created_at: date, paid_total: 0, balance: 0 },
  { doc_type: "purchase", status: "cancelled", grand_total: 500, supplier_id: "s", created_at: date },
];
function sb() {
  return {
    rpc: async () => ({ data: true }),
    from(table: string) {
      let rows: any[] = table === "purchases" ? [...purchases] : table === "suppliers" ? [{ id: "s", name: "Supplier", opening_balance: 0, created_at: date }] : [];
      const q: any = {
        select: () => q, order: () => q, limit: () => q,
        in: (key: string, values: unknown[]) => { rows = rows.filter(r => values.includes(r[key])); return q; },
        eq: (key: string, value: unknown) => { rows = rows.filter(r => r[key] === value); return q; },
        neq: (key: string, value: unknown) => { rows = rows.filter(r => r[key] !== value); return q; },
        gt: (key: string, value: number) => { rows = rows.filter(r => r[key] > value); return q; },
        not: (key: string) => { rows = rows.filter(r => r[key] != null); return q; },
        gte: () => q, lt: () => q, lte: () => q,
        maybeSingle: async () => ({ data: rows[0] ?? null }),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows }).then(resolve),
      };
      return q;
    },
  };
}
const args = { context: { supabase: sb() }, data: { from: date.slice(0, 10), to: date.slice(0, 10), date: date.slice(0, 10), today: date.slice(0, 10), tzOffsetMin: 0 } };
test("dashboard counts converted purchase once, excludes both order statuses, and subtracts returns", async () => {
  const result = await handlers("./pos-dashboard.functions.ts").getPosDashboard?.(args);
  assert.equal(result.month.purchases, 80);
  assert.equal(result.today.purchases, 80);
  assert.equal(result.series.reduce((sum: number, r: any) => sum + r.purchases, 0), 80);
});
test("reports exclude orders from purchases and purchase returns", async () => {
  const result = await handlers("./inventory.functions.ts").getReport?.(args);
  assert.equal(result.summary.purchases, 100);
  assert.equal(result.summary.purchaseReturns, 20);
});
test("day book contains only real purchase and return documents", async () => {
  const result = await handlers("./ledger.functions.ts").getDayBook?.(args);
  assert.deepEqual(result.docs.map((r: any) => r.number).sort(), ["PUR-2", "RET-1"]);
  assert.equal(result.summary.purchases, 100);
});
test("supplier aging applies only actual return credits, not purchase orders", async () => {
  const result = await handlers("./accounting.functions.ts").getPayables?.(args);
  assert.equal(result.total, 80);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].outstanding, 80);
});