import type { DashboardActivity, DashboardData, DashboardPoint, DashboardRank } from "@/lib/dashboard.functions";
import { db } from "./store";

function rank(map: Map<string, { count: number; total: number }>, limit: number): DashboardRank[] {
  return [...map.entries()]
    .map(([label, v]) => ({ label, count: v.count, total: v.total }))
    .sort((a, b) => b.count - a.count || b.total - a.total)
    .slice(0, limit);
}

function bump(map: Map<string, { count: number; total: number }>, key: string, amount: number) {
  const k = (key || "").trim();
  if (!k) return;
  const cur = map.get(k) ?? { count: 0, total: 0 };
  cur.count += 1;
  cur.total += amount;
  map.set(k, cur);
}

export async function getDashboard(): Promise<DashboardData> {
  const d = db();
  const nowMs = Date.now();
  const dayMs = 86_400_000;
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const orders = d.orders;
  const invoices = d.invoices;
  const amount = (v: number | null | undefined) => Number(v ?? 0);

  const inRange = (iso: string, days: number) => nowMs - new Date(iso).getTime() <= days * dayMs;
  const isToday = (iso: string) => new Date(iso).getTime() >= startOfDay.getTime();

  const revenue = (list: typeof orders) => list.reduce((s, o) => s + amount(o.product_total), 0);
  const todayOrders = orders.filter((o) => isToday(o.created_at));
  const weekOrders = orders.filter((o) => inRange(o.created_at, 7));
  const monthOrders = orders.filter((o) => inRange(o.created_at, 30));

  const statuses = new Map<string, { count: number; total: number }>();
  const cities = new Map<string, { count: number; total: number }>();
  const topProducts = new Map<string, { count: number; total: number }>();
  const topCustomers = new Map<string, { count: number; total: number }>();
  for (const o of orders) {
    bump(statuses, o.status || "Unknown", amount(o.product_total));
    bump(cities, o.city || "", amount(o.product_total));
    for (const part of (o.product || "").split(",")) bump(topProducts, part.trim(), amount(o.product_total));
    bump(topCustomers, o.customer_name || o.phone || "", amount(o.product_total));
  }

  const series: DashboardPoint[] = [];
  for (let i = 13; i >= 0; i--) {
    const day = new Date(nowMs - i * dayMs).toISOString().slice(0, 10);
    const dayOrders = orders.filter((o) => o.created_at.slice(0, 10) === day);
    series.push({
      date: day,
      orders: dayOrders.length,
      revenue: revenue(dayOrders),
      invoices: invoices.filter((iv) => iv.created_at.slice(0, 10) === day).length,
    });
  }

  const activity: DashboardActivity[] = [
    ...orders.slice(0, 10).map(
      (o): DashboardActivity => ({
        id: o.id,
        kind: "order",
        title: o.order_number ? `Order ${o.order_number}` : "Order",
        subtitle: [o.customer_name, o.city].filter(Boolean).join(" • "),
        amount: o.product_total,
        status: o.status,
        createdAt: o.created_at,
      }),
    ),
    ...invoices.slice(0, 10).map(
      (iv): DashboardActivity => ({
        id: iv.id,
        kind: "invoice",
        title: iv.invoice_number,
        subtitle: iv.customer_name ?? "",
        amount: iv.total,
        status: iv.payment_status,
        createdAt: iv.created_at,
      }),
    ),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12);

  const paid = invoices.filter((i) => i.payment_status === "paid");
  const amountTotal = invoices.reduce((s, i) => s + amount(i.total), 0);
  const amountPaid = paid.reduce((s, i) => s + amount(i.total), 0);

  const products = d.products;
  const stockValue = products.reduce((s, p) => s + Number(p.stock ?? 0) * Number(p.sale_price ?? 0), 0);

  return {
    currency: d.workspace.currency || "Rs",
    businessName: d.workspace.businessName || "",
    isAdmin: false,
    orders: {
      today: todayOrders.length,
      week: weekOrders.length,
      month: monthOrders.length,
      total: orders.length,
      revenueToday: revenue(todayOrders),
      revenueWeek: revenue(weekOrders),
      revenueMonth: revenue(monthOrders),
      revenueTotal: revenue(orders),
      avgValue: orders.length ? revenue(orders) / orders.length : 0,
      cod: orders.filter((o) => o.payment_method === "COD").length,
      cc: orders.filter((o) => o.payment_method === "CC").length,
      codAmount: orders.reduce((s, o) => s + amount(o.cod_amount), 0),
    },
    invoices: {
      total: invoices.length,
      month: invoices.filter((i) => inRange(i.created_at, 30)).length,
      paid: paid.length,
      unpaid: invoices.filter((i) => i.payment_status === "unpaid").length,
      partial: invoices.filter((i) => i.payment_status === "partial").length,
      amountTotal,
      amountPaid,
      amountOutstanding: amountTotal - amountPaid,
    },
    customers: {
      total: d.customers.length,
      newMonth: d.customers.filter((c) => inRange(c.created_at, 30)).length,
      repeat: d.customers.filter((c) => orders.filter((o) => o.customer_id === c.id).length > 1).length,
    },
    products: {
      total: products.length,
      active: products.length,
      outOfStock: products.filter((p) => Number(p.stock ?? 0) <= 0).length,
      lowStock: products.filter((p) => Number(p.stock ?? 0) > 0 && Number(p.stock ?? 0) < 5).length,
      stockValue,
    },
    series,
    statuses: rank(statuses, 6),
    cities: rank(cities, 8),
    topProducts: rank(topProducts, 8),
    topCustomers: rank(topCustomers, 8),
    team: [],
    activity,
    sync: d.sync
      ? {
          at: d.sync.synced_at,
          status: d.sync.status,
          total: d.sync.total_rows,
          updated: d.sync.updated_count,
          inserted: d.sync.inserted_count,
        }
      : null,
  };
}

export type { DashboardData, DashboardRank, DashboardPoint, DashboardActivity };
