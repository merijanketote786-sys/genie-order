import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Sb = any;
const r2 = (x: number) => Math.round(x * 100) / 100;
const optNum = z.number().min(0).max(1e9).nullable();

export type InvProduct = {
  id: string; name: string; unit: string; stock: number; salePrice: number; purchasePrice: number | null;
  wholesalePrice: number | null; minSalePrice: number | null; minStock: number | null; taxPercent: number | null;
  sku: string; barcode: string; category: string; brand: string;
};

export const listInventory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await (context.supabase as Sb).from("products")
      .select("id, name, unit, stock, sale_price, custom_sale_price, purchase_price, wholesale_price, min_sale_price, min_stock, tax_percent, sku, barcode, category, brand")
      .eq("is_active", true).order("name").limit(5000);
    const products: InvProduct[] = ((data ?? []) as any[]).map((p) => ({
      id: p.id, name: p.name, unit: p.unit, stock: Number(p.stock ?? 0), salePrice: Number(p.custom_sale_price ?? p.sale_price ?? 0),
      purchasePrice: p.purchase_price == null ? null : Number(p.purchase_price), wholesalePrice: p.wholesale_price == null ? null : Number(p.wholesale_price),
      minSalePrice: p.min_sale_price == null ? null : Number(p.min_sale_price), minStock: p.min_stock == null ? null : Number(p.min_stock),
      taxPercent: p.tax_percent == null ? null : Number(p.tax_percent), sku: p.sku ?? "", barcode: p.barcode ?? "", category: p.category ?? "", brand: p.brand ?? "",
    }));
    return { products };
  });

export const updateProductDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(), sku: z.string().max(60), barcode: z.string().max(60), category: z.string().max(60), brand: z.string().max(60),
    purchasePrice: optNum, wholesalePrice: optNum, minSalePrice: optNum, minStock: optNum, taxPercent: z.number().min(0).max(100).nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const s = (n: number | null) => (n == null ? "" : String(n));
    const { error } = await (context.supabase as Sb).rpc("pos_update_product", { _id: data.id, _p: {
      sku: data.sku, barcode: data.barcode, category: data.category, brand: data.brand, purchase_price: s(data.purchasePrice),
      wholesale_price: s(data.wholesalePrice), min_sale_price: s(data.minSalePrice), min_stock: s(data.minStock), tax_percent: s(data.taxPercent),
    } });
    if (error) throw new Error("Product save nahi hua");
    return { ok: true };
  });

export const adjustStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), qty: z.number().positive().max(1e7), kind: z.enum(["adjust_in", "adjust_out", "damage", "opening"]), note: z.string().max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as Sb).rpc("pos_adjust_stock", { _id: data.id, _qty: data.qty, _kind: data.kind, _note: data.note });
    if (error) throw new Error("Stock adjust nahi hua");
    return { ok: true };
  });

export const getStockLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const [{ data: p }, { data: mv }] = await Promise.all([
      sb.from("products").select("stock").eq("id", data.id).maybeSingle(),
      sb.from("stock_movements").select("kind, qty, note, created_at").eq("product_id", data.id).order("created_at", { ascending: false }).limit(300),
    ]);
    // Maujooda stock se peeche ki taraf running balance
    let run = Number(p?.stock ?? 0);
    const rows = ((mv ?? []) as any[]).map((m) => { const row = { date: m.created_at as string, kind: m.kind as string, qty: Number(m.qty), note: (m.note ?? "") as string, balance: r2(run) }; run -= Number(m.qty); return row; });
    return { rows };
  });

/* --------------------------------- Reports --------------------------------- */

export const getReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), tzOffsetMin: z.number().min(-840).max(840) }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { data: allowed } = await sb.rpc("pos_can", { _perm: "view_reports" });
    if (!allowed) throw new Error("Reports ki ijazat nahi");
    const start = new Date(Date.parse(`${data.from}T00:00:00Z`) + data.tzOffsetMin * 60000).toISOString();
    const end = new Date(Date.parse(`${data.to}T00:00:00Z`) + data.tzOffsetMin * 60000 + 86400000).toISOString();
    const [{ data: sales }, { data: purs }, { data: pays }, { data: exps }, { data: prods }, { data: profs }] = await Promise.all([
      sb.from("pos_sales").select("id, doc_type, grand_total, paid_total, balance, discount_total, tax_total, customer_name, created_by, created_at").in("doc_type", ["sale", "return"]).neq("status", "cancelled").gte("created_at", start).lt("created_at", end).limit(20000),
      sb.from("purchases").select("doc_type, grand_total, paid_total").neq("status", "cancelled").gte("created_at", start).lt("created_at", end).limit(20000),
      sb.from("pos_payments").select("direction, method, amount, kind").eq("status", "completed").gte("created_at", start).lt("created_at", end).limit(50000),
      sb.from("expenses").select("category, amount").eq("status", "completed").gte("expense_date", data.from).lte("expense_date", data.to).limit(20000),
      sb.from("products").select("id, name, category, purchase_price, stock, min_stock, sale_price").eq("is_active", true).limit(5000),
      sb.from("profiles").select("id, full_name"),
    ]);
    const saleRows = (sales ?? []) as any[];
    const ids = saleRows.map((s) => s.id);
    const items: any[] = [];
    for (let i = 0; i < ids.length; i += 300) {
      const { data: it } = await sb.from("pos_sale_items").select("sale_id, product_id, name, qty, stock_qty, cost, line_total").in("sale_id", ids.slice(i, i + 300));
      items.push(...(it ?? []));
    }
    const prodMap = new Map<string, any>(((prods ?? []) as any[]).map((p) => [p.id, p]));
    const docType = new Map<string, string>(saleRows.map((s) => [s.id, s.doc_type]));
    const staff = new Map<string, string>(((profs ?? []) as any[]).map((p) => [p.id, p.full_name || "Staff"]));

    let grossSales = 0, returns = 0, discount = 0, tax = 0, credit = 0, cost = 0;
    const daily: Record<string, { sales: number; profit: number }> = {};
    const byCustomer: Record<string, number> = {}; const byStaff: Record<string, number> = {};
    for (const s of saleRows) {
      const v = Number(s.grand_total); const sign = s.doc_type === "sale" ? 1 : -1;
      if (sign > 0) { grossSales += v; discount += Number(s.discount_total); tax += Number(s.tax_total); credit += Number(s.balance); } else returns += v;
      const day = new Date(Date.parse(s.created_at) - data.tzOffsetMin * 60000).toISOString().slice(0, 10);
      (daily[day] ??= { sales: 0, profit: 0 }).sales += sign * v;
      const cn = s.customer_name || "Walk-in"; byCustomer[cn] = (byCustomer[cn] ?? 0) + sign * v;
      const st = staff.get(s.created_by) ?? "Staff"; byStaff[st] = (byStaff[st] ?? 0) + sign * v;
    }
    const byItem: Record<string, { qty: number; amount: number; profit: number }> = {};
    const byCategory: Record<string, number> = {};
    for (const it of items) {
      const sign = docType.get(it.sale_id) === "return" ? -1 : 1;
      const p = it.product_id ? prodMap.get(it.product_id) : null;
      const c = Number(it.cost) > 0 ? Number(it.cost) : p?.purchase_price != null ? Number(p.purchase_price) * Number(it.stock_qty ?? it.qty) : 0;
      const lt = Number(it.line_total);
      cost += sign * c;
      const b = (byItem[it.name] ??= { qty: 0, amount: 0, profit: 0 });
      b.qty += sign * Number(it.qty); b.amount += sign * lt; b.profit += sign * (lt - c);
      const cat = p?.category || "Bina category"; byCategory[cat] = (byCategory[cat] ?? 0) + sign * lt;
    }
    for (const s of saleRows) { void s; }
    const netSales = grossSales - returns;
    const grossProfit = netSales - cost;
    const expByCat: Record<string, number> = {};
    for (const e of (exps ?? []) as any[]) expByCat[e.category] = (expByCat[e.category] ?? 0) + Number(e.amount);
    const expenses = Object.values(expByCat).reduce((a, b) => a + b, 0);
    let purchases = 0, purchaseReturns = 0;
    for (const p of (purs ?? []) as any[]) (p.doc_type === "purchase" ? (purchases += Number(p.grand_total)) : (purchaseReturns += Number(p.grand_total)));
    const byMethod: Record<string, { in: number; out: number }> = {};
    for (const p of (pays ?? []) as any[]) { const m = (byMethod[p.method] ??= { in: 0, out: 0 }); p.direction === "in" ? (m.in += Number(p.amount)) : (m.out += Number(p.amount)); }
    for (const e of (exps ?? []) as any[]) void e;

    const allProds = (prods ?? []) as any[];
    const stockValue = allProds.reduce((s, p) => s + Math.max(0, Number(p.stock ?? 0)) * Number(p.purchase_price ?? 0), 0);
    const stockSaleValue = allProds.reduce((s, p) => s + Math.max(0, Number(p.stock ?? 0)) * Number(p.sale_price ?? 0), 0);
    const lowStock = allProds.filter((p) => p.min_stock != null && Number(p.stock ?? 0) <= Number(p.min_stock)).map((p) => ({ name: p.name as string, stock: Number(p.stock ?? 0), min: Number(p.min_stock) }));
    const outOfStock = allProds.filter((p) => Number(p.stock ?? 0) <= 0).length;
    const top = (o: Record<string, number>, n = 10) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ name: k, amount: r2(v) }));

    return {
      summary: {
        grossSales: r2(grossSales), returns: r2(returns), netSales: r2(netSales), discount: r2(discount), tax: r2(tax), creditSales: r2(credit),
        cost: r2(cost), grossProfit: r2(grossProfit), expenses: r2(expenses), netProfit: r2(grossProfit - expenses),
        purchases: r2(purchases), purchaseReturns: r2(purchaseReturns), bills: saleRows.filter((s) => s.doc_type === "sale").length,
        stockValue: r2(stockValue), stockSaleValue: r2(stockSaleValue), outOfStock,
      },
      daily: Object.entries(daily).sort((a, b) => a[0].localeCompare(b[0])).map(([d, v]) => ({ date: d, sales: r2(v.sales) })),
      items: Object.entries(byItem).sort((a, b) => b[1].amount - a[1].amount).slice(0, 50).map(([k, v]) => ({ name: k, qty: r2(v.qty), amount: r2(v.amount), profit: r2(v.profit) })),
      byCategory: top(byCategory), byCustomer: top(byCustomer), byStaff: top(byStaff), expenses: top(expByCat, 20),
      byMethod: Object.entries(byMethod).map(([k, v]) => ({ method: k, in: r2(v.in), out: r2(v.out) })),
      lowStock,
    };
  });
