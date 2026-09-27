import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const r2 = (x: number) => Math.round(x * 100) / 100;

export type PosDashPoint = { date: string; sales: number; purchases: number; expenses: number; profit: number };
export type PosDashRow = { label: string; qty: number; amount: number };
export type PosDashDoc = { id: string; kind: string; number: string; party: string; total: number; status: string; createdAt: string };

export type PosDashboard = {
  today: { sales: number; bills: number; profit: number; returns: number; purchases: number; expenses: number; cashIn: number; cashOut: number; estimates: number };
  month: { sales: number; bills: number; profit: number; returns: number; purchases: number; expenses: number; avgBill: number };
  receivable: number;
  payable: number;
  unpaidBills: number;
  stock: { products: number; value: number; low: number; out: number; lowList: { name: string; stock: number; min: number }[] };
  series: PosDashPoint[];
  topProducts: PosDashRow[];
  topCustomers: PosDashRow[];
  methods: PosDashRow[];
  recent: PosDashDoc[];
};

export const getPosDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PosDashboard> => {
    const sb = context.supabase as any;
    const now = Date.now();
    const day = 86400000;
    const since = new Date(now - 30 * day).toISOString();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const t0 = todayStart.getTime();

    const [sales, items, purchases, expenses, pays, products, balSales, balPurch] = await Promise.all([
      sb.from("pos_sales").select("id, doc_type, doc_number, status, payment_status, customer_name, grand_total, balance, cost_total, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(10000),
      sb.from("pos_sale_items").select("name, qty, line_total, sale_id, pos_sales!inner(created_at, doc_type, status)").gte("pos_sales.created_at", since).eq("pos_sales.doc_type", "sale").neq("pos_sales.status", "cancelled").limit(20000),
      sb.from("purchases").select("id, doc_type, doc_number, status, supplier_name, grand_total, created_at").gte("created_at", since).neq("status", "cancelled").limit(10000),
      sb.from("expenses").select("amount, expense_date, created_at, status").gte("created_at", since).neq("status", "cancelled").limit(10000),
      sb.from("pos_payments").select("direction, method, amount, created_at").eq("status", "completed").gte("created_at", since).limit(20000),
      sb.from("products").select("name, stock, min_stock, purchase_price, sale_price, is_active").eq("scope", "pos").eq("is_active", true).limit(5000),
      sb.from("pos_sales").select("balance").eq("doc_type", "sale").neq("status", "cancelled").gt("balance", 0).limit(20000),
      sb.from("purchases").select("balance").eq("doc_type", "purchase").neq("status", "cancelled").gt("balance", 0).limit(20000),
    ]);

    const byDay = new Map<string, PosDashPoint>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now - i * day); d.setHours(0, 0, 0, 0);
      const k = d.toLocaleDateString("en-CA");
      byDay.set(k, { date: k, sales: 0, purchases: 0, expenses: 0, profit: 0 });
    }
    const key = (iso: string) => new Date(iso).toLocaleDateString("en-CA");

    const today = { sales: 0, bills: 0, profit: 0, returns: 0, purchases: 0, expenses: 0, cashIn: 0, cashOut: 0, estimates: 0 };
    const month = { sales: 0, bills: 0, profit: 0, returns: 0, purchases: 0, expenses: 0, avgBill: 0 };
    const custs = new Map<string, PosDashRow>();
    const recent: PosDashDoc[] = [];

    for (const s of (sales.data ?? []) as any[]) {
      const isToday = new Date(s.created_at).getTime() >= t0;
      const total = Number(s.grand_total) || 0;
      if (recent.length < 12 && s.status !== "cancelled") recent.push({ id: s.id, kind: s.doc_type, number: s.doc_number, party: s.customer_name || "Walk-in", total, status: s.payment_status || s.status, createdAt: s.created_at });
      if (s.status === "cancelled") continue;
      const profit = total - (Number(s.cost_total) || 0);
      const p = byDay.get(key(s.created_at));
      if (s.doc_type === "sale") {
        month.sales += total; month.bills += 1; month.profit += profit;
        if (isToday) { today.sales += total; today.bills += 1; today.profit += profit; }
        if (p) { p.sales += total; p.profit += profit; }
        const n = s.customer_name || "Walk-in";
        const c = custs.get(n) ?? { label: n, qty: 0, amount: 0 }; c.qty += 1; c.amount += total; custs.set(n, c);
      } else if (s.doc_type === "return") {
        month.returns += total; month.profit -= profit;
        if (isToday) { today.returns += total; today.profit -= profit; }
        if (p) { p.sales -= total; p.profit -= profit; }
      } else if (s.doc_type === "estimate" && isToday) today.estimates += 1;
    }
    for (const x of (purchases.data ?? []) as any[]) {
      const v = (Number(x.grand_total) || 0) * (x.doc_type === "return" ? -1 : 1);
      month.purchases += v;
      if (new Date(x.created_at).getTime() >= t0) today.purchases += v;
      const p = byDay.get(key(x.created_at)); if (p) p.purchases += v;
    }
    for (const e of (expenses.data ?? []) as any[]) {
      const v = Number(e.amount) || 0;
      month.expenses += v;
      const d = e.expense_date || e.created_at;
      if (key(d) === todayStart.toLocaleDateString("en-CA")) today.expenses += v;
      const p = byDay.get(key(d)); if (p) { p.expenses += v; p.profit -= v; }
    }
    month.profit -= month.expenses;
    today.profit -= today.expenses;
    month.avgBill = month.bills ? month.sales / month.bills : 0;

    const methods = new Map<string, PosDashRow>();
    for (const x of (pays.data ?? []) as any[]) {
      const v = Number(x.amount) || 0;
      if (new Date(x.created_at).getTime() >= t0) { if (x.direction === "in") today.cashIn += v; else today.cashOut += v; }
      if (x.direction === "in") { const m = methods.get(x.method) ?? { label: x.method, qty: 0, amount: 0 }; m.qty += 1; m.amount += v; methods.set(x.method, m); }
    }

    const prods = new Map<string, PosDashRow>();
    for (const it of (items.data ?? []) as any[]) {
      const r = prods.get(it.name) ?? { label: it.name, qty: 0, amount: 0 };
      r.qty += Number(it.qty) || 0; r.amount += Number(it.line_total) || 0; prods.set(it.name, r);
    }

    const stock = { products: 0, value: 0, low: 0, out: 0, lowList: [] as { name: string; stock: number; min: number }[] };
    for (const p of (products.data ?? []) as any[]) {
      stock.products += 1;
      const q = Number(p.stock) || 0;
      const min = Number(p.min_stock) || 0;
      stock.value += Math.max(0, q) * (Number(p.purchase_price) || Number(p.sale_price) || 0);
      if (q <= 0) stock.out += 1;
      else if (min > 0 && q <= min) { stock.low += 1; stock.lowList.push({ name: p.name, stock: q, min }); }
    }
    stock.lowList = stock.lowList.sort((a, b) => a.stock - b.stock).slice(0, 8);

    const sum = (rows: any[] | null) => (rows ?? []).reduce((s, r) => s + (Number(r.balance) || 0), 0);
    const top = (m: Map<string, PosDashRow>) => [...m.values()].sort((a, b) => b.amount - a.amount).slice(0, 6).map((r) => ({ ...r, amount: r2(r.amount), qty: r2(r.qty) }));
    const round = <T extends Record<string, number>>(o: T) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, r2(v)])) as T;

    return {
      today: round(today),
      month: round(month),
      receivable: r2(sum(balSales.data)),
      payable: r2(sum(balPurch.data)),
      unpaidBills: (balSales.data ?? []).length,
      stock: { ...stock, value: r2(stock.value) },
      series: [...byDay.values()].map((p) => round(p as any) as PosDashPoint).map((p, i) => ({ ...p, date: [...byDay.keys()][i] })),
      topProducts: top(prods),
      topCustomers: top(custs),
      methods: top(methods),
      recent,
    };
  });
