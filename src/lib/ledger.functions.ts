import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { friendlyDbError } from "./pos-errors";

type Sb = any;
const r2 = (x: number) => Math.round(x * 100) / 100;

/* --------------------------- Customer balances --------------------------- */

/** Invoice ke custom charges (shipping waghera) ka total — statement/balance mein shamil nahi hote. */
function payloadCharges(payload: unknown): number {
  const fields = (payload as { customFields?: { addToTotal?: boolean; value?: string }[] } | null)?.customFields;
  if (!Array.isArray(fields)) return 0;
  return fields.reduce((s, f) => { if (!f?.addToTotal) return s; const v = Number(String(f.value ?? "").replace(/,/g, "").trim()); return Number.isFinite(v) && v > 0 ? s + v : s; }, 0);
}

async function customerFlows(sb: Sb, customerId?: string) {
  let s = sb.from("pos_sales").select("id, customer_id, doc_type, doc_number, grand_total, payload, created_at").in("doc_type", ["sale", "return"]).neq("status", "cancelled").not("customer_id", "is", null);
  let p = sb.from("pos_payments").select("customer_id, kind, direction, method, amount, note, created_at").eq("status", "completed").not("customer_id", "is", null);
  if (customerId) { s = s.eq("customer_id", customerId); p = p.eq("customer_id", customerId); }
  const [{ data: sales }, { data: pays }] = await Promise.all([s.limit(20000), p.limit(20000)]);
  return { sales: (sales ?? []) as any[], pays: (pays ?? []) as any[] };
}

export type CustomerBal = { id: string; name: string; phone: string; city: string; opening: number; creditLimit: number | null; sales: number; paid: number; balance: number };

export const listCustomerBalances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ posOnly: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const [{ data: custs }, flows] = await Promise.all([
      sb.from("customers").select("id, name, phone, city, opening_balance, credit_limit, pos_scoped").order("name").limit(5000),
      customerFlows(sb),
    ]);
    const agg = new Map<string, { sales: number; paid: number; bal: number }>();
    const g = (id: string) => agg.get(id) ?? (agg.set(id, { sales: 0, paid: 0, bal: 0 }), agg.get(id)!);
    for (const s of flows.sales) { const a = g(s.customer_id); const v = Number(s.grand_total); if (s.doc_type === "sale") { a.sales += v; a.bal += v; } else a.bal -= v; }
    for (const p of flows.pays) { const a = g(p.customer_id); const v = Number(p.amount); if (p.direction === "in") { a.paid += v; a.bal -= v; } else a.bal += v; }
    // posOnly: sirf woh customers jo POS mein use hue (sale/return/payment) — baqi workspace customers chhupa do.
    const posIds = data.posOnly ? new Set<string>([...flows.sales.map((s) => s.customer_id), ...flows.pays.map((p) => p.customer_id)]) : null;
    const customers: CustomerBal[] = ((custs ?? []) as any[]).filter((c) => !posIds || c.pos_scoped || posIds.has(c.id)).map((c) => {
      const a = agg.get(c.id) ?? { sales: 0, paid: 0, bal: 0 };
      return { id: c.id, name: c.name ?? "", phone: c.phone ?? "", city: c.city ?? "", opening: Number(c.opening_balance ?? 0), creditLimit: c.credit_limit == null ? null : Number(c.credit_limit), sales: r2(a.sales), paid: r2(a.paid), balance: r2(Number(c.opening_balance ?? 0) + a.bal) };
    });
    return { customers };
  });

export const getCustomerLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const [{ data: c }, flows] = await Promise.all([
      sb.from("customers").select("name, phone, city, address, opening_balance, credit_limit").eq("id", data.id).maybeSingle(),
      customerFlows(sb, data.id),
    ]);
    type Row = { date: string; kind: string; ref: string; debit: number; credit: number };
    const rows: Row[] = [];
    for (const s of flows.sales) rows.push(s.doc_type === "sale" ? { date: s.created_at, kind: "Sale invoice", ref: s.doc_number, debit: Number(s.grand_total), credit: 0 } : { date: s.created_at, kind: "Sale return", ref: s.doc_number, debit: 0, credit: Number(s.grand_total) });
    for (const p of flows.pays) {
      const v = Number(p.amount);
      if (p.direction === "in") rows.push({ date: p.created_at, kind: p.kind === "receipt" ? `Payment mili (${p.method})` : `Bill par paid (${p.method})`, ref: p.note ?? "", debit: 0, credit: v });
      else rows.push({ date: p.created_at, kind: `Refund diya (${p.method})`, ref: p.note ?? "", debit: v, credit: 0 });
    }
    rows.sort((a, b) => a.date.localeCompare(b.date));
    let run = Number(c?.opening_balance ?? 0);
    return {
      customer: { name: (c?.name ?? "") as string, phone: (c?.phone ?? "") as string, city: (c?.city ?? "") as string, address: (c?.address ?? "") as string, creditLimit: c?.credit_limit == null ? null : Number(c.credit_limit) },
      opening: run,
      rows: rows.map((r) => { run = r2(run + r.debit - r.credit); return { ...r, balance: run }; }),
    };
  });

export const saveCustomerAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), openingBalance: z.number().min(-1e9).max(1e9), creditLimit: z.number().min(0).max(1e9).nullable() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as Sb).from("customers").update({ opening_balance: data.openingBalance, credit_limit: data.creditLimit }).eq("id", data.id);
    if (error) throw new Error("Failed to save");
    return { ok: true };
  });

/* -------------------------------- Expenses -------------------------------- */

export const EXPENSE_CATEGORIES = ["Rent", "Electricity", "Gas", "Salary", "Transport", "Courier", "Marketing", "Other"];

export const listExpenses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ from: z.string().max(10), to: z.string().max(10) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows } = await (context.supabase as Sb).from("expenses").select("id, category, amount, expense_date, method, description, status, created_at").gte("expense_date", data.from).lte("expense_date", data.to).order("expense_date", { ascending: false }).order("created_at", { ascending: false }).limit(1000);
    return { expenses: ((rows ?? []) as any[]).map((r) => ({ id: r.id as string, category: r.category as string, amount: Number(r.amount), date: r.expense_date as string, method: r.method as string, description: (r.description ?? "") as string, status: r.status as string })) };
  });

export const saveExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ category: z.string().trim().min(1).max(60), amount: z.number().positive().max(1e9), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), method: z.string().max(30), description: z.string().max(500).optional(), clientRef: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { data: row, error } = await sb.from("expenses").insert({ category: data.category, amount: data.amount, expense_date: data.date, method: data.method, description: data.description || null, client_ref: data.clientRef ?? null }).select("id").single();
    if (error?.code === "23505") return { ok: true, duplicate: true };
    if (error) throw new Error(friendlyDbError(error, "Failed to save expense."));
    await sb.from("audit_log").insert({ action: "create", entity: "expense", entity_id: row.id, details: { amount: data.amount, category: data.category } }).then(() => null, () => null);
    return { ok: true };
  });

export const cancelExpense = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as Sb).from("expenses").update({ status: "cancelled" }).eq("id", data.id);
    if (error) throw new Error("Failed to cancel");
    return { ok: true };
  });

/* -------------------------------- Day book -------------------------------- */

export const getDayBook = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), tzOffsetMin: z.number().min(-840).max(840) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    // Local din ki shuruaat UTC me
    const start = new Date(Date.parse(`${data.date}T00:00:00Z`) + data.tzOffsetMin * 60000).toISOString();
    const end = new Date(Date.parse(start) + 86400000).toISOString();
    const [{ data: before }, { data: today }, { data: expBefore }, { data: expToday }] = await Promise.all([
      sb.from("pos_payments").select("direction, amount").eq("status", "completed").eq("method", "Cash").lt("created_at", start).limit(50000),
      sb.from("pos_payments").select("direction, kind, method, amount, note, created_at, customer_id, supplier_id").eq("status", "completed").gte("created_at", start).lt("created_at", end).order("created_at"),
      sb.from("expenses").select("amount").eq("status", "completed").eq("method", "Cash").lt("expense_date", data.date).limit(50000),
      sb.from("expenses").select("category, amount, method, description, created_at").eq("status", "completed").eq("expense_date", data.date),
    ]);
    const opening = r2(((before ?? []) as any[]).reduce((s, p) => s + (p.direction === "in" ? 1 : -1) * Number(p.amount), 0) - ((expBefore ?? []) as any[]).reduce((s, e) => s + Number(e.amount), 0));
    const LABEL: Record<string, string> = { sale: "Cash sale", receipt: "Customer payment", refund: "Sale refund", purchase: "Cash purchase", supplier_payment: "Supplier payment", purchase_refund: "Purchase refund", expense: "Expense" };
    const rows = [
      ...((today ?? []) as any[]).map((p) => ({ time: p.created_at as string, kind: LABEL[p.kind] ?? p.kind, method: p.method as string, note: (p.note ?? "") as string, cashIn: p.method === "Cash" && p.direction === "in" ? Number(p.amount) : 0, cashOut: p.method === "Cash" && p.direction === "out" ? Number(p.amount) : 0, amount: Number(p.amount), dir: p.direction as string })),
      ...((expToday ?? []) as any[]).map((e) => ({ time: e.created_at as string, kind: `Expense: ${e.category}`, method: e.method as string, note: (e.description ?? "") as string, cashIn: 0, cashOut: e.method === "Cash" ? Number(e.amount) : 0, amount: Number(e.amount), dir: "out" })),
    ].sort((a, b) => a.time.localeCompare(b.time));
    const byKind: Record<string, number> = {};
    for (const r of rows) if (r.cashIn || r.cashOut) byKind[r.kind.startsWith("Expense") ? "Expenses" : r.kind] = r2((byKind[r.kind.startsWith("Expense") ? "Expenses" : r.kind] ?? 0) + r.cashIn - r.cashOut);
    const cashIn = r2(rows.reduce((s, r) => s + r.cashIn, 0));
    const cashOut = r2(rows.reduce((s, r) => s + r.cashOut, 0));
    const byMethod: Record<string, number> = {};
    for (const r of rows) byMethod[r.method] = r2((byMethod[r.method] ?? 0) + (r.dir === "in" ? r.amount : -r.amount));
    return { opening, cashIn, cashOut, closing: r2(opening + cashIn - cashOut), byKind, byMethod, rows };
  });

/** Line items per document number for a party statement (POS sales + purchases). */
export const getPartyStatementItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ customerId: z.string().uuid().optional(), supplierId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    type It = { name: string; unit: string; qty: number; rate: number; total: number };
    const out: Record<string, It[]> = {};
    const add = (docs: { id: string; doc_number: string }[], items: { parent: string; name: string; unit: string | null; qty: number; rate: number; line_total: number }[]) => {
      const byId = new Map(docs.map((d) => [d.id, d.doc_number]));
      for (const i of items) { const n = byId.get(i.parent); if (!n) continue; (out[n] ??= []).push({ name: i.name, unit: i.unit ?? "", qty: Number(i.qty), rate: Number(i.rate), total: Number(i.line_total) }); }
    };
    if (data.customerId) {
      const { data: s } = await sb.from("pos_sales").select("id, doc_number").eq("customer_id", data.customerId);
      const ids = (s ?? []).map((x: { id: string }) => x.id);
      if (ids.length) {
        const { data: it } = await sb.from("pos_sale_items").select("sale_id, name, unit, qty, rate, line_total").in("sale_id", ids);
        add(s ?? [], (it ?? []).map((x: { sale_id: string; name: string; unit: string | null; qty: number; rate: number; line_total: number }) => ({ ...x, parent: x.sale_id })));
      }
    }
    if (data.supplierId) {
      const { data: p } = await sb.from("purchases").select("id, doc_number").eq("supplier_id", data.supplierId);
      const ids = (p ?? []).map((x: { id: string }) => x.id);
      if (ids.length) {
        const { data: it } = await sb.from("purchase_items").select("purchase_id, name, unit, qty, rate, line_total").in("purchase_id", ids);
        add(p ?? [], (it ?? []).map((x: { purchase_id: string; name: string; unit: string | null; qty: number; rate: number; line_total: number }) => ({ ...x, parent: x.purchase_id })));
      }
    }
    return { items: out };
  });
