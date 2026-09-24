import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Sb = any;
const r2 = (x: number) => Math.round(x * 100) / 100;
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const optDate = dateStr.nullable().optional();

export type AccType = "asset" | "liability" | "equity" | "income" | "cogs" | "expense";
export const ACC_TYPES: { v: AccType; label: string }[] = [
  { v: "asset", label: "Assets" },
  { v: "liability", label: "Liabilities" },
  { v: "equity", label: "Equity" },
  { v: "income", label: "Income" },
  { v: "cogs", label: "Cost of Goods Sold" },
  { v: "expense", label: "Expenses" },
];
const debitNormal = (t: AccType) => t === "asset" || t === "expense" || t === "cogs";

export type Account = { id: string; code: string; name: string; type: AccType; parentId: string | null; opening: number; active: boolean; system: boolean; key: string | null };

function msg(e: { message?: string } | null, fb: string) {
  const m = e?.message ?? "";
  return m && !/violates|syntax|relation|column|function/i.test(m) ? m : fb;
}

async function loadAccounts(sb: Sb): Promise<Account[]> {
  let { data } = await sb.from("acc_accounts").select("*").order("code");
  if (!data?.length) {
    await sb.rpc("acc_sync_all");
    ({ data } = await sb.from("acc_accounts").select("*").order("code"));
  }
  return ((data ?? []) as any[]).map((a) => ({ id: a.id, code: a.code, name: a.name, type: a.type, parentId: a.parent_id, opening: Number(a.opening_balance), active: a.is_active, system: a.is_system, key: a.system_key }));
}

async function loadSettings(sb: Sb) {
  const { data } = await sb.from("acc_settings").select("*").maybeSingle();
  return { fyStart: (data?.fy_start ?? null) as string | null, fyEnd: (data?.fy_end ?? null) as string | null, lockDate: (data?.lock_date ?? null) as string | null, creditDays: Number(data?.credit_days ?? 30) };
}

/** Customer/supplier opening balances live on the party records; they feed AR/AP opening. */
async function partyOpenings(sb: Sb) {
  const [{ data: c }, { data: s }] = await Promise.all([
    sb.from("customers").select("opening_balance").neq("opening_balance", 0).limit(20000),
    sb.from("suppliers").select("opening_balance").neq("opening_balance", 0).limit(20000),
  ]);
  return { ar: ((c ?? []) as any[]).reduce((t, r) => t + Number(r.opening_balance), 0), ap: ((s ?? []) as any[]).reduce((t, r) => t + Number(r.opening_balance), 0) };
}

export type BalRow = Account & { openDr: number; periodDr: number; periodCr: number; close: number };

/** Signed (debit-positive) balances per account: opening (before from) + period movement. */
async function balances(sb: Sb, from: string | null, to: string | null) {
  const [accounts, { data: rows, error }, po] = await Promise.all([loadAccounts(sb), sb.rpc("acc_balances", { _from: from, _to: to }), partyOpenings(sb)]);
  if (error) throw new Error("Accounting data could not be loaded");
  const m = new Map<string, any>(((rows ?? []) as any[]).map((r) => [r.account_id, r]));
  // Opening balances entered on the normal side → debit-positive
  let openSum = 0;
  const list: BalRow[] = accounts.map((a) => {
    let op = debitNormal(a.type) ? a.opening : -a.opening;
    if (a.key === "ar") op += po.ar;
    if (a.key === "ap") op -= po.ap;
    openSum += op;
    const r = m.get(a.id);
    const openDr = r2(op + Number(r?.before_dr ?? 0) - Number(r?.before_cr ?? 0));
    const periodDr = r2(Number(r?.dr ?? 0));
    const periodCr = r2(Number(r?.cr ?? 0));
    return { ...a, openDr, periodDr, periodCr, close: r2(openDr + periodDr - periodCr) };
  });
  // Opening Balance Equity absorbs the difference so the books always balance.
  const oe = list.find((a) => a.key === "opening_equity");
  if (oe && Math.abs(openSum) > 0.004) { oe.openDr = r2(oe.openDr - openSum); oe.close = r2(oe.close - openSum); }
  return list;
}

const byKey = (l: BalRow[], k: string) => l.find((a) => a.key === k);

/* --------------------------------- Accounts -------------------------------- */

export const getAccountingBase = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as Sb;
    const [accounts, settings, used] = await Promise.all([
      loadAccounts(sb),
      loadSettings(sb),
      sb.from("acc_journal_lines").select("account_id").limit(50000),
    ]);
    const usedIds = [...new Set(((used.data ?? []) as any[]).map((r) => r.account_id as string))];
    return { accounts, settings, usedIds };
  });

export const saveAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid().optional(), code: z.string().trim().min(1).max(20), name: z.string().trim().min(1).max(120),
    type: z.enum(["asset", "liability", "equity", "income", "cogs", "expense"]), parentId: z.string().uuid().nullable(),
    opening: z.number().min(-1e10).max(1e10), active: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as Sb).rpc("acc_save_account", { _p: { id: data.id ?? null, code: data.code, name: data.name, type: data.type, parent_id: data.parentId, opening_balance: data.opening, is_active: data.active } });
    if (error) throw new Error(msg(error, "Account could not be saved"));
    return { ok: true };
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as Sb).rpc("acc_delete_account", { _id: data.id });
    if (error) throw new Error(msg(error, "Account could not be deleted"));
    return { ok: true };
  });

export const saveAccSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ fyStart: optDate, fyEnd: optDate, lockDate: optDate, creditDays: z.number().int().min(0).max(365) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as Sb).rpc("acc_save_settings", { _p: { fy_start: data.fyStart ?? null, fy_end: data.fyEnd ?? null, lock_date: data.lockDate ?? null, credit_days: data.creditDays } });
    if (error) throw new Error(msg(error, "Settings could not be saved"));
    return { ok: true };
  });

export const syncAccounting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as Sb).rpc("acc_sync_all");
    if (error) throw new Error(msg(error, "Sync failed"));
    return { checked: Number(data ?? 0) };
  });

/* --------------------------------- Journals -------------------------------- */

export const listJournals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ from: dateStr, to: dateStr, source: z.string().max(20).optional(), q: z.string().max(100).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    let q = sb.from("acc_journals").select("id, entry_date, reference, description, status, source_type, total, reversal_of, reversed_by, created_at, acc_journal_lines(account_id, debit, credit, memo, line_no)")
      .gte("entry_date", data.from).lte("entry_date", data.to).order("entry_date", { ascending: false }).order("created_at", { ascending: false }).limit(500);
    if (data.source) q = q.eq("source_type", data.source);
    if (data.q) q = q.ilike("reference", `%${data.q}%`);
    const { data: rows } = await q;
    return {
      journals: ((rows ?? []) as any[]).map((j) => ({
        id: j.id as string, date: j.entry_date as string, reference: (j.reference ?? "") as string, description: (j.description ?? "") as string,
        status: j.status as string, source: j.source_type as string, total: Number(j.total), reversalOf: j.reversal_of as string | null, reversedBy: j.reversed_by as string | null,
        lines: ((j.acc_journal_lines ?? []) as any[]).sort((a, b) => a.line_no - b.line_no).map((l) => ({ accountId: l.account_id as string, debit: Number(l.debit), credit: Number(l.credit), memo: (l.memo ?? "") as string })),
      })),
    };
  });

const lineSchema = z.object({ accountId: z.string().uuid(), debit: z.number().min(0).max(1e10), credit: z.number().min(0).max(1e10), memo: z.string().max(200).optional() });

export const saveJournal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid().optional(), date: dateStr, reference: z.string().max(120), description: z.string().max(300), lines: z.array(lineSchema).min(2).max(100), post: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as Sb).rpc("acc_save_journal", { _p: { id: data.id ?? null, date: data.date, reference: data.reference, description: data.description, post: data.post, lines: data.lines.map((l) => ({ account_id: l.accountId, debit: l.debit, credit: l.credit, memo: l.memo ?? "" })) } });
    if (error) throw new Error(msg(error, "Journal could not be saved"));
    return { ok: true };
  });

export const journalAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), action: z.enum(["post", "reverse", "cancel"]), date: optDate, reason: z.string().max(300).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { error } = data.action === "post" ? await sb.rpc("acc_post_journal", { _id: data.id })
      : data.action === "cancel" ? await sb.rpc("acc_cancel_draft", { _id: data.id })
      : await sb.rpc("acc_reverse_journal", { _id: data.id, _date: data.date ?? null, _reason: data.reason ?? "" });
    if (error) throw new Error(msg(error, "Action failed"));
    return { ok: true };
  });

/* ------------------------------ General ledger ----------------------------- */

export const getGeneralLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ accountId: z.string().uuid(), from: dateStr, to: dateStr, ref: z.string().max(100).optional(), source: z.string().max(20).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const list = await balances(sb, data.from, data.to);
    const acc = list.find((a) => a.id === data.accountId);
    if (!acc) throw new Error("Account not found");
    let q = sb.from("acc_journal_lines").select("debit, credit, memo, acc_journals!inner(entry_date, reference, description, source_type, status, created_at)")
      .eq("account_id", data.accountId).eq("acc_journals.status", "posted").gte("acc_journals.entry_date", data.from).lte("acc_journals.entry_date", data.to).limit(20000);
    if (data.ref) q = q.ilike("acc_journals.reference", `%${data.ref}%`);
    if (data.source) q = q.eq("acc_journals.source_type", data.source);
    const { data: rows } = await q;
    const sign = debitNormal(acc.type) ? 1 : -1;
    const items = ((rows ?? []) as any[]).map((r) => ({ date: r.acc_journals.entry_date as string, at: r.acc_journals.created_at as string, reference: (r.acc_journals.reference ?? "") as string, description: (r.memo || r.acc_journals.description || "") as string, source: r.acc_journals.source_type as string, debit: Number(r.debit), credit: Number(r.credit) }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.at.localeCompare(b.at));
    let run = acc.openDr * sign;
    const filtered = !!(data.ref || data.source);
    return {
      account: { code: acc.code, name: acc.name, type: acc.type }, opening: r2(run), filtered,
      rows: items.map((r) => { run = r2(run + (r.debit - r.credit) * sign); return { ...r, balance: run }; }),
      closing: r2(run),
    };
  });

/* ------------------------------- Trial balance ------------------------------ */

export const getTrialBalance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ to: dateStr }).parse(d))
  .handler(async ({ data, context }) => {
    const list = await balances(context.supabase as Sb, null, data.to);
    const rows = list.filter((a) => Math.abs(a.close) > 0.004).map((a) => ({ code: a.code, name: a.name, type: a.type, debit: a.close > 0 ? a.close : 0, credit: a.close < 0 ? -a.close : 0 }));
    const debit = r2(rows.reduce((s, r) => s + r.debit, 0));
    const credit = r2(rows.reduce((s, r) => s + r.credit, 0));
    return { rows, debit, credit, balanced: Math.abs(debit - credit) < 0.01 };
  });

/* -------------------------------- P&L / BS --------------------------------- */

function pnl(list: BalRow[]) {
  const mv = (a: BalRow) => a.periodDr - a.periodCr; // debit-positive movement
  const inc = list.filter((a) => a.type === "income");
  const sales = r2(-inc.filter((a) => a.key !== "sales_returns" && a.key !== "other_income").reduce((s, a) => s + mv(a), 0));
  const salesReturns = r2(byKey(list, "sales_returns") ? mv(byKey(list, "sales_returns")!) : 0);
  const otherIncome = r2(byKey(list, "other_income") ? -mv(byKey(list, "other_income")!) : 0);
  const netSales = r2(sales - salesReturns);
  const cogsRows = list.filter((a) => a.type === "cogs" && Math.abs(mv(a)) > 0.004).map((a) => ({ name: a.name, amount: r2(mv(a)) }));
  const cogs = r2(cogsRows.reduce((s, r) => s + r.amount, 0));
  const gross = r2(netSales - cogs);
  const expRows = list.filter((a) => a.type === "expense" && a.key !== "other_expenses" && Math.abs(mv(a)) > 0.004).map((a) => ({ name: a.name, amount: r2(mv(a)) }));
  const opex = r2(expRows.reduce((s, r) => s + r.amount, 0));
  const otherExpenses = r2(byKey(list, "other_expenses") ? mv(byKey(list, "other_expenses")!) : 0);
  const net = r2(gross + otherIncome - opex - otherExpenses);
  return { sales, salesReturns, netSales, cogsRows, cogs, gross, otherIncome, expRows, opex, otherExpenses, net };
}

export const getProfitLoss = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ from: dateStr, to: dateStr }).parse(d))
  .handler(async ({ data, context }) => pnl(await balances(context.supabase as Sb, data.from, data.to)));

export const getBalanceSheet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ to: dateStr }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const st = await loadSettings(sb);
    const fy = st.fyStart && st.fyStart <= data.to ? st.fyStart : `${data.to.slice(0, 4)}-01-01`;
    const list = await balances(sb, fy, data.to);
    const close = (a: BalRow) => a.close;
    const plTypes = new Set(["income", "cogs", "expense"]);
    // Income/expense before FY start = retained earnings; within FY = current profit.
    const retainedPL = -list.filter((a) => plTypes.has(a.type)).reduce((s, a) => s + a.openDr, 0);
    const current = pnl(list).net;
    const assets = list.filter((a) => a.type === "asset" && Math.abs(close(a)) > 0.004).map((a) => ({ name: a.name, amount: r2(close(a)) }));
    const liabilities = list.filter((a) => a.type === "liability" && Math.abs(close(a)) > 0.004).map((a) => ({ name: a.name, amount: r2(-close(a)) }));
    const equity = list.filter((a) => a.type === "equity" && Math.abs(close(a)) > 0.004 && a.key !== "retained").map((a) => ({ name: a.name, amount: r2(-close(a)) }));
    const retained = r2(retainedPL + (byKey(list, "retained") ? -byKey(list, "retained")!.close : 0));
    equity.push({ name: "Retained Earnings", amount: retained }, { name: "Current Profit / Loss", amount: r2(current) });
    const tA = r2(assets.reduce((s, r) => s + r.amount, 0));
    const tL = r2(liabilities.reduce((s, r) => s + r.amount, 0));
    const tE = r2(equity.reduce((s, r) => s + r.amount, 0));
    return { fyStart: fy, assets, liabilities, equity, totalAssets: tA, totalLiabilities: tL, totalEquity: tE, balanced: Math.abs(tA - tL - tE) < 0.01 };
  });

/* --------------------------------- AR / AP --------------------------------- */

type Doc = { party: string; partyName: string; ref: string; date: string; amount: number };
type AgingRow = Doc & { due: string; paid: number; outstanding: number; days: number };

function ageFifo(parties: Map<string, { name: string; opening: number; created: string }>, docs: Doc[], credits: Map<string, number>, creditDays: number, today: string) {
  const byParty = new Map<string, Doc[]>();
  for (const [id, p] of parties) if (p.opening > 0) byParty.set(id, [{ party: id, partyName: p.name, ref: "Opening balance", date: p.created.slice(0, 10), amount: p.opening }]);
  for (const d of docs) (byParty.get(d.party) ?? (byParty.set(d.party, []), byParty.get(d.party)!)).push(d);
  const rows: AgingRow[] = [];
  const summary: { party: string; name: string; balance: number; advance: number }[] = [];
  const t0 = Date.parse(today);
  const ids = new Set([...byParty.keys(), ...credits.keys()]);
  for (const id of ids) {
    const p = parties.get(id);
    if (!p) continue;
    let pool = (credits.get(id) ?? 0) + (p.opening < 0 ? -p.opening : 0);
    const list = (byParty.get(id) ?? []).sort((a, b) => a.date.localeCompare(b.date));
    let bal = 0;
    for (const d of list) {
      const paid = r2(Math.max(0, Math.min(d.amount, pool)));
      pool = r2(pool - paid);
      const out = r2(d.amount - paid);
      bal += out;
      if (out > 0.004) {
        const due = new Date(Date.parse(d.date) + creditDays * 86400000).toISOString().slice(0, 10);
        rows.push({ ...d, partyName: p.name, due, paid, outstanding: out, days: Math.max(0, Math.floor((t0 - Date.parse(due)) / 86400000)) });
      }
    }
    const balance = r2(bal - pool);
    if (Math.abs(balance) > 0.004) summary.push({ party: id, name: p.name, balance, advance: r2(pool) });
  }
  const bucket = (d: number) => (d <= 0 ? "current" : d <= 30 ? "d30" : d <= 60 ? "d60" : d <= 90 ? "d90" : "d90p");
  const aging = { current: 0, d30: 0, d60: 0, d90: 0, d90p: 0 } as Record<string, number>;
  for (const r of rows) aging[bucket(r.days)] = r2(aging[bucket(r.days)] + r.outstanding);
  rows.sort((a, b) => b.days - a.days || a.partyName.localeCompare(b.partyName));
  summary.sort((a, b) => b.balance - a.balance);
  return { rows, aging, summary, total: r2(summary.reduce((s, r) => s + r.balance, 0)) };
}

export const getReceivables = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ today: dateStr }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const [{ data: custs }, { data: sales }, { data: pays }, st] = await Promise.all([
      sb.from("customers").select("id, name, phone, opening_balance, created_at").limit(20000),
      sb.from("pos_sales").select("customer_id, doc_type, doc_number, grand_total, created_at").in("doc_type", ["sale", "return"]).neq("status", "cancelled").not("customer_id", "is", null).limit(50000),
      sb.from("pos_payments").select("customer_id, direction, amount").eq("status", "completed").not("customer_id", "is", null).limit(50000),
      loadSettings(sb),
    ]);
    const parties = new Map(((custs ?? []) as any[]).map((c) => [c.id as string, { name: (c.name || c.phone || "Customer") as string, opening: Number(c.opening_balance ?? 0), created: c.created_at as string }]));
    const docs: Doc[] = [];
    const credits = new Map<string, number>();
    const add = (id: string, v: number) => credits.set(id, r2((credits.get(id) ?? 0) + v));
    for (const s of (sales ?? []) as any[]) {
      if (s.doc_type === "sale") docs.push({ party: s.customer_id, partyName: "", ref: s.doc_number, date: String(s.created_at).slice(0, 10), amount: Number(s.grand_total) });
      else add(s.customer_id, Number(s.grand_total));
    }
    for (const p of (pays ?? []) as any[]) add(p.customer_id, p.direction === "in" ? Number(p.amount) : -Number(p.amount));
    return { creditDays: st.creditDays, ...ageFifo(parties, docs, credits, st.creditDays, data.today) };
  });

export const getPayables = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ today: dateStr }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const [{ data: sups }, { data: purs }, { data: pays }, st] = await Promise.all([
      sb.from("suppliers").select("id, name, opening_balance, created_at").limit(20000),
      sb.from("purchases").select("supplier_id, doc_type, doc_number, grand_total, created_at").neq("status", "cancelled").not("supplier_id", "is", null).limit(50000),
      sb.from("pos_payments").select("supplier_id, direction, amount").eq("status", "completed").not("supplier_id", "is", null).limit(50000),
      loadSettings(sb),
    ]);
    const parties = new Map(((sups ?? []) as any[]).map((c) => [c.id as string, { name: (c.name || "Supplier") as string, opening: Number(c.opening_balance ?? 0), created: c.created_at as string }]));
    const docs: Doc[] = [];
    const credits = new Map<string, number>();
    const add = (id: string, v: number) => credits.set(id, r2((credits.get(id) ?? 0) + v));
    for (const s of (purs ?? []) as any[]) {
      if (s.doc_type === "purchase") docs.push({ party: s.supplier_id, partyName: "", ref: s.doc_number, date: String(s.created_at).slice(0, 10), amount: Number(s.grand_total) });
      else add(s.supplier_id, Number(s.grand_total));
    }
    for (const p of (pays ?? []) as any[]) add(p.supplier_id, p.direction === "out" ? Number(p.amount) : -Number(p.amount));
    return { creditDays: st.creditDays, ...ageFifo(parties, docs, credits, st.creditDays, data.today) };
  });

/* -------------------------------- Dashboard -------------------------------- */

export const getAccountingDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ today: dateStr }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const st = await loadSettings(sb);
    const fy = st.fyStart && st.fyStart <= data.today ? st.fyStart : `${data.today.slice(0, 4)}-01-01`;
    const [list, errs] = await Promise.all([
      balances(sb, fy, data.today),
      sb.from("audit_log").select("id", { count: "exact", head: true }).eq("action", "acc_error"),
    ]);
    const p = pnl(list);
    const cl = (k: string) => r2(byKey(list, k)?.close ?? 0);
    return {
      fyStart: fy, cash: cl("cash"), bank: cl("bank"), receivables: cl("ar"), payables: r2(-cl("ap")), inventory: cl("inventory"),
      sales: p.netSales, expenses: r2(p.opex + p.otherExpenses), gross: p.gross, net: p.net, syncErrors: errs.count ?? 0,
    };
  });
