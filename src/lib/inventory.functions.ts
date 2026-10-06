import { withStore } from "@/lib/pos-store.server";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Sb = any;
const r2 = (x: number) => Math.round(x * 100) / 100;
const optNum = z.number().min(0).max(1e9).nullable();

export type InvProduct = {
  id: string; name: string; unit: string; stock: number; salePrice: number; purchasePrice: number | null;
  wholesalePrice: number | null; wholesaleMinQty: number | null; minSalePrice: number | null; minStock: number | null; taxPercent: number | null;
  sku: string; barcode: string; category: string; brand: string; isActive?: boolean;
};

export const listInventory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await (context.supabase as Sb).from("products")
      .select("id, name, unit, stock, is_active, sale_price, custom_sale_price, purchase_price, wholesale_price, wholesale_min_qty, min_sale_price, min_stock, tax_percent, sku, barcode, category, brand")
      .eq("scope", "pos").order("name").limit(5000);
    const toInv = (p: any): InvProduct => ({
      id: p.id, name: p.name, unit: p.unit, stock: Number(p.stock ?? 0), salePrice: Number(p.custom_sale_price ?? p.sale_price ?? 0),
      purchasePrice: p.purchase_price == null ? null : Number(p.purchase_price), wholesalePrice: p.wholesale_price == null ? null : Number(p.wholesale_price),
      wholesaleMinQty: p.wholesale_min_qty == null ? null : Number(p.wholesale_min_qty),
      minSalePrice: p.min_sale_price == null ? null : Number(p.min_sale_price), minStock: p.min_stock == null ? null : Number(p.min_stock),
      taxPercent: p.tax_percent == null ? null : Number(p.tax_percent), sku: p.sku ?? "", barcode: p.barcode ?? "", category: p.category ?? "", brand: p.brand ?? "",
      isActive: p.is_active !== false,
    });
    const rows = ((data ?? []) as any[]).map(toInv);
    // products = active only (existing behaviour), inactive = soft-deleted items for bulk edit
    return { products: rows.filter((p) => p.isActive), inactive: rows.filter((p) => !p.isActive) };
  });

export const updateProductDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(), sku: z.string().max(60), barcode: z.string().max(60), category: z.string().max(60), brand: z.string().max(60),
    salePrice: optNum.optional(), purchasePrice: optNum, wholesalePrice: optNum, wholesaleMinQty: optNum.optional(), minSalePrice: optNum, minStock: optNum, taxPercent: z.number().min(0).max(100).nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const s = (n: number | null) => (n == null ? "" : String(n));
    const { error } = await (context.supabase as Sb).rpc("pos_update_product", { _id: data.id, _p: {
      sku: data.sku, barcode: data.barcode, category: data.category, brand: data.brand, purchase_price: s(data.purchasePrice),
      wholesale_price: s(data.wholesalePrice), ...(data.wholesaleMinQty !== undefined ? { wholesale_min_qty: s(data.wholesaleMinQty) } : {}),
      min_sale_price: s(data.minSalePrice), min_stock: s(data.minStock), tax_percent: s(data.taxPercent), ...(data.salePrice != null ? { sale_price: String(data.salePrice) } : {}),
    } });
    if (error) throw new Error("Failed to save product");
    return { ok: true };
  });

export const bulkUpdateProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ rows: z.array(z.record(z.string(), z.union([z.string().max(200), z.boolean()])).refine((r) => typeof r.id === "string")).min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await withStore((context.supabase as Sb).rpc("pos_bulk_update_products", { _rows: data.rows }));
    if (error) throw new Error(enMsg(error.message) || "Bulk update failed");
    return res as { updated: number };
  });

export const adjustStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), qty: z.number().positive().max(1e7), kind: z.enum(["adjust_in", "adjust_out", "damage", "opening"]), note: z.string().max(300), storeId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const rpc = (context.supabase as Sb).rpc("pos_adjust_stock", { _id: data.id, _qty: data.qty, _kind: data.kind, _note: data.note });
    const b = rpc as unknown as { setHeader?: (k: string, v: string) => typeof rpc };
    const { error } = await (data.storeId && typeof b.setHeader === "function" ? b.setHeader("x-pos-store", data.storeId) : withStore(rpc));
    if (error) throw new Error("Failed to adjust stock");
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
    if (!allowed) throw new Error("Not permitted to view reports");
    const start = new Date(Date.parse(`${data.from}T00:00:00Z`) + data.tzOffsetMin * 60000).toISOString();
    const end = new Date(Date.parse(`${data.to}T00:00:00Z`) + data.tzOffsetMin * 60000 + 86400000).toISOString();
    const [{ data: sales }, { data: purs }, { data: pays }, { data: exps }, { data: prods }, { data: profs }] = await Promise.all([
      sb.from("pos_sales").select("id, doc_type, grand_total, paid_total, balance, discount_total, tax_total, customer_name, created_by, created_at").in("doc_type", ["sale", "return"]).neq("status", "cancelled").gte("created_at", start).lt("created_at", end).limit(20000),
      sb.from("purchases").select("doc_type, grand_total, paid_total").neq("status", "cancelled").gte("created_at", start).lt("created_at", end).limit(20000),
      sb.from("pos_payments").select("direction, method, amount, kind").eq("status", "completed").gte("created_at", start).lt("created_at", end).limit(50000),
      sb.from("expenses").select("category, amount").eq("status", "completed").gte("expense_date", data.from).lte("expense_date", data.to).limit(20000),
      sb.from("products").select("id, name, category, purchase_price, stock, min_stock, sale_price").eq("is_active", true).eq("scope", "pos").limit(5000),
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

const txt = z.string().max(200).optional();
export const createPosProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string().trim().min(1).max(200), unit: txt, sku: txt, barcode: txt, category: txt, brand: txt, sale_price: txt, purchase_price: txt, wholesale_price: txt, wholesale_min_qty: txt, stock: txt, min_stock: txt, tax_percent: txt }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await withStore((context.supabase as Sb).rpc("pos_create_product", { _p: data }));
    if (error) throw new Error(enMsg(error.message) || "Failed to add product");
    return { id: id as string };
  });

export const deletePosProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids: z.array(z.string().uuid()).min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: n, error } = await (context.supabase as Sb).rpc("pos_delete_products", { _ids: data.ids });
    if (error) throw new Error(enMsg(error.message) || "Failed to delete");
    return { deleted: Number(n) };
  });

export type ItemHistoryRow = {
  date: string; kind: string; label: string; qty: number; rate: number | null; party: string; doc: string; store: string;
};

/** Date-wise history of one item: sales, estimates, returns, purchases, manufacturing and stock moves. */
export const getItemHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ productId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const [sales, purch, moves, stores] = await Promise.all([
      sb.from("pos_sale_items").select("qty, rate, pos_sales!inner(doc_type, doc_number, status, customer_name, created_at)").eq("product_id", data.productId).limit(2000),
      sb.from("purchase_items").select("qty, rate, purchases!inner(doc_type, doc_number, status, supplier_name, created_at)").eq("product_id", data.productId).limit(2000),
      sb.from("stock_movements").select("kind, qty, note, created_at, store_id").eq("product_id", data.productId).not("kind", "in", "(sale,purchase,sale_return,purchase_return,return,cancel,sale_cancel,purchase_cancel)").limit(2000),
      sb.from("pos_stores").select("id, name").limit(500),
    ]);
    const storeName = new Map<string, string>(((stores.data ?? []) as any[]).map((s) => [s.id, s.name]));
    const rows: ItemHistoryRow[] = [];
    const saleLabel: Record<string, string> = { sale: "Sale invoice", quotation: "Estimate", return: "Sale return" };
    for (const r of (sales.data ?? []) as any[]) {
      const s = r.pos_sales;
      rows.push({ date: s.created_at, kind: s.doc_type, label: (saleLabel[s.doc_type] ?? s.doc_type) + (s.status === "cancelled" ? " (cancelled)" : ""),
        qty: Number(r.qty), rate: Number(r.rate), party: s.customer_name ?? "Walk-in", doc: s.doc_number, store: "" });
    }
    for (const r of (purch.data ?? []) as any[]) {
      const p = r.purchases;
      rows.push({ date: p.created_at, kind: p.doc_type === "return" ? "purchase_return" : "purchase",
        label: (p.doc_type === "return" ? "Purchase return" : "Purchase") + (p.status === "cancelled" ? " (cancelled)" : ""),
        qty: Number(r.qty), rate: Number(r.rate), party: p.supplier_name ?? "", doc: p.doc_number, store: "" });
    }
    const moveLabel: Record<string, string> = { manufacture_in: "Manufactured", manufacture_out: "Used in manufacturing", transfer_in: "Transfer in", transfer_out: "Transfer out", adjust: "Stock adjustment", adjust_in: "Stock added", adjust_out: "Stock removed", opening: "Opening stock" };
    for (const m of (moves.data ?? []) as any[]) {
      rows.push({ date: m.created_at, kind: m.kind, label: moveLabel[m.kind] ?? m.kind.replace(/_/g, " "), qty: Number(m.qty), rate: null,
        party: m.note ?? "", doc: "", store: m.store_id ? storeName.get(m.store_id) ?? "" : "" });
    }
    rows.sort((a, b) => b.date.localeCompare(a.date));
    return { rows };
  });

const EN_MSG: Array<[RegExp, string]> = [
  [/product name khali nahi ho sakta/i, "Product name cannot be empty"],
  [/product name likhein/i, "Enter a product name"],
  [/is naam ka product pehle se maujood hai/i, "A product with this name already exists"],
  [/product add karne ki ijazat nahi/i, "You do not have permission to add products"],
  [/zyada products/i, "Too many products"],
  [/product delete karne ki ijazat nahi/i, "You do not have permission to delete products"],
  [/product edit ki ijazat nahi/i, "You do not have permission to edit products"],
];
function enMsg(msg?: string) {
  if (!msg) return msg;
  for (const [re, en] of EN_MSG) if (re.test(msg)) return en;
  return msg;
}
