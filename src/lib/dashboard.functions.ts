import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DashboardPoint = { date: string; orders: number; revenue: number; invoices: number };
export type DashboardRank = { label: string; count: number; total: number };
export type DashboardActivity = {
  id: string;
  kind: "order" | "invoice";
  title: string;
  subtitle: string;
  amount: number | null;
  status: string | null;
  createdAt: string;
};

export type DashboardData = {
  currency: string;
  businessName: string;
  isAdmin: boolean;
  orders: {
    today: number;
    week: number;
    month: number;
    total: number;
    revenueToday: number;
    revenueWeek: number;
    revenueMonth: number;
    revenueTotal: number;
    avgValue: number;
    cod: number;
    cc: number;
    codAmount: number;
  };
  invoices: {
    total: number;
    month: number;
    paid: number;
    unpaid: number;
    partial: number;
    amountTotal: number;
    amountPaid: number;
    amountOutstanding: number;
  };
  customers: { total: number; newMonth: number; repeat: number };
  products: { total: number; active: number; outOfStock: number; lowStock: number; stockValue: number };
  series: DashboardPoint[];
  statuses: DashboardRank[];
  cities: DashboardRank[];
  topProducts: DashboardRank[];
  topCustomers: DashboardRank[];
  team: (DashboardRank & { name: string })[];
  activity: DashboardActivity[];
  sync: { at: string | null; status: string | null; total: number; updated: number; inserted: number } | null;
};

function dayKey(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

function rank(map: Map<string, { count: number; total: number }>, limit: number): DashboardRank[] {
  return [...map.entries()]
    .map(([label, v]) => ({ label, count: v.count, total: v.total }))
    .sort((a, b) => b.count - a.count || b.total - a.total)
    .slice(0, limit);
}

function bump(map: Map<string, { count: number; total: number }>, key: string, amount: number) {
  const k = key.trim();
  if (!k) return;
  const cur = map.get(k) ?? { count: 0, total: 0 };
  cur.count += 1;
  cur.total += amount;
  map.set(k, cur);
}

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DashboardData> => {
    const supabase = context.supabase as any;
    const { isActiveProfile } = await import("@/lib/access.server");
    const active = await isActiveProfile(supabase, context.userId);

    const empty: DashboardData = {
      currency: "Rs",
      businessName: "",
      isAdmin: false,
      orders: {
        today: 0, week: 0, month: 0, total: 0,
        revenueToday: 0, revenueWeek: 0, revenueMonth: 0, revenueTotal: 0,
        avgValue: 0, cod: 0, cc: 0, codAmount: 0,
      },
      invoices: { total: 0, month: 0, paid: 0, unpaid: 0, partial: 0, amountTotal: 0, amountPaid: 0, amountOutstanding: 0 },
      customers: { total: 0, newMonth: 0, repeat: 0 },
      products: { total: 0, active: 0, outOfStock: 0, lowStock: 0, stockValue: 0 },
      series: [],
      statuses: [],
      cities: [],
      topProducts: [],
      topCustomers: [],
      team: [],
      activity: [],
      sync: null,
    };
    if (!active) return empty;

    const [ordersRes, invoicesRes, customersRes, productsRes, profilesRes, syncRes, adminRes, wsRes] =
      await Promise.all([
        supabase
          .from("orders")
          .select(
            "id, order_number, customer_name, phone, city, product, product_total, status, payment_method, cod_amount, customer_id, created_by, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(5000),
        supabase
          .from("invoices")
          .select("id, invoice_number, customer_name, total, payment_status, created_by, created_at")
          .order("created_at", { ascending: false })
          .limit(5000),
        supabase.from("customers").select("id, name, created_at").limit(5000),
        supabase.from("products").select("id, is_active, stock, sale_price").eq("scope", "pos").limit(5000),
        supabase.from("profiles").select("id, full_name").limit(500),
        supabase
          .from("sync_logs")
          .select("synced_at, status, total_rows, updated_count, inserted_count")
          .order("synced_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
        supabase.from("workspace_settings").select("business_name, currency").maybeSingle(),
      ]);

    const orderRows: any[] = ordersRes.data ?? [];
    const invoiceRows: any[] = invoicesRes.data ?? [];
    const customerRows: any[] = customersRes.data ?? [];
    const productRows: any[] = productsRes.data ?? [];

    const names: Record<string, string> = {};
    for (const p of profilesRes.data ?? []) names[p.id] = p.full_name || "";

    const now = Date.now();
    const dayMs = 86400000;
    const startToday = new Date(new Date().toISOString().slice(0, 10)).getTime();
    const week = now - 7 * dayMs;
    const month = now - 30 * dayMs;

    const o = { ...empty.orders };
    const statuses = new Map<string, { count: number; total: number }>();
    const cities = new Map<string, { count: number; total: number }>();
    const products = new Map<string, { count: number; total: number }>();
    const customersMap = new Map<string, { count: number; total: number }>();
    const team = new Map<string, { count: number; total: number }>();
    const byDay = new Map<string, DashboardPoint>();
    for (let i = 13; i >= 0; i--) {
      const key = new Date(now - i * dayMs).toISOString().slice(0, 10);
      byDay.set(key, { date: key, orders: 0, revenue: 0, invoices: 0 });
    }
    const perCustomer = new Map<string, number>();

    for (const r of orderRows) {
      const amount = Number(r.product_total ?? 0) || 0;
      const t = new Date(r.created_at).getTime();
      o.total += 1;
      o.revenueTotal += amount;
      if (t >= startToday) { o.today += 1; o.revenueToday += amount; }
      if (t >= week) { o.week += 1; o.revenueWeek += amount; }
      if (t >= month) { o.month += 1; o.revenueMonth += amount; }
      if (r.payment_method === "COD") { o.cod += 1; o.codAmount += Number(r.cod_amount ?? 0) || 0; }
      if (r.payment_method === "CC") o.cc += 1;

      bump(statuses, String(r.status ?? "Unknown"), amount);
      bump(cities, String(r.city ?? ""), amount);
      bump(products, String(r.product ?? ""), amount);
      bump(customersMap, String(r.customer_name ?? r.phone ?? ""), amount);
      bump(team, String(r.created_by ?? ""), amount);
      if (r.customer_id) perCustomer.set(r.customer_id, (perCustomer.get(r.customer_id) ?? 0) + 1);

      const point = byDay.get(dayKey(r.created_at));
      if (point) { point.orders += 1; point.revenue += amount; }
    }
    o.avgValue = o.total > 0 ? Math.round(o.revenueTotal / o.total) : 0;

    const inv = { ...empty.invoices };
    for (const r of invoiceRows) {
      const amount = Number(r.total ?? 0) || 0;
      const t = new Date(r.created_at).getTime();
      inv.total += 1;
      inv.amountTotal += amount;
      if (t >= month) inv.month += 1;
      if (r.payment_status === "paid") { inv.paid += 1; inv.amountPaid += amount; }
      else if (r.payment_status === "partial") inv.partial += 1;
      else inv.unpaid += 1;
      const point = byDay.get(dayKey(r.created_at));
      if (point) point.invoices += 1;
    }
    inv.amountOutstanding = Math.max(0, inv.amountTotal - inv.amountPaid);

    const prod = { ...empty.products };
    for (const p of productRows) {
      prod.total += 1;
      if (p.is_active) prod.active += 1;
      const stock = Number(p.stock ?? 0) || 0;
      if (stock <= 0) prod.outOfStock += 1;
      else if (stock < 5) prod.lowStock += 1;
      prod.stockValue += stock * (Number(p.sale_price ?? 0) || 0);
    }

    const activity: DashboardActivity[] = [
      ...orderRows.slice(0, 12).map((r): DashboardActivity => ({
        id: `o-${r.id}`,
        kind: "order",
        title: `${r.customer_name || "Bina naam"}${r.order_number ? ` · ${r.order_number}` : ""}`,
        subtitle: [r.city, r.product].filter(Boolean).join(" · "),
        amount: r.product_total == null ? null : Number(r.product_total),
        status: r.status ?? null,
        createdAt: r.created_at,
      })),
      ...invoiceRows.slice(0, 12).map((r): DashboardActivity => ({
        id: `i-${r.id}`,
        kind: "invoice",
        title: `${r.customer_name || "Bina naam"} · ${r.invoice_number}`,
        subtitle: "Invoice",
        amount: r.total == null ? null : Number(r.total),
        status: r.payment_status ?? null,
        createdAt: r.created_at,
      })),
    ]
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, 15);

    const sync = syncRes?.data
      ? {
          at: syncRes.data.synced_at as string,
          status: syncRes.data.status as string,
          total: Number(syncRes.data.total_rows ?? 0),
          updated: Number(syncRes.data.updated_count ?? 0),
          inserted: Number(syncRes.data.inserted_count ?? 0),
        }
      : null;

    return {
      currency: wsRes?.data?.currency || "Rs",
      businessName: wsRes?.data?.business_name || "",
      isAdmin: adminRes?.data === true,
      orders: o,
      invoices: inv,
      customers: {
        total: customerRows.length,
        newMonth: customerRows.filter((c) => new Date(c.created_at).getTime() >= month).length,
        repeat: [...perCustomer.values()].filter((n) => n > 1).length,
      },
      products: prod,
      series: [...byDay.values()],
      statuses: rank(statuses, 6),
      cities: rank(cities, 6),
      topProducts: rank(products, 6),
      topCustomers: rank(customersMap, 6),
      team: rank(team, 8).map((t) => ({ ...t, name: names[t.label] || "Team member" })),
      activity,
      sync,
    };
  });
