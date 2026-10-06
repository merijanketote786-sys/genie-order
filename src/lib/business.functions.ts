import { withStore } from "@/lib/pos-store.server";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { friendlyDbError } from "./pos-errors";

const amt = z.number().min(0).max(1e9);
const r2 = (x: number) => Math.round(x * 100) / 100;
type Sb = any;

/* ------------------------------ Suppliers ------------------------------ */

export const listSuppliers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase as Sb;
    const [{ data: sups }, { data: purs }, { data: pays }] = await Promise.all([
      sb.from("suppliers").select("id, name, phone, address, opening_balance, is_active").eq("is_active", true).order("name"),
      sb.from("purchases").select("supplier_id, doc_type, grand_total, paid_total").neq("status", "cancelled"),
      sb.from("pos_payments").select("supplier_id, amount, kind, purchase_id").in("kind", ["supplier_payment", "purchase_refund"]).eq("status", "completed"),
    ]);
    const bal = new Map<string, number>();
    for (const p of purs ?? []) {
      if (!p.supplier_id) continue;
      const due = Number(p.grand_total) - Number(p.paid_total);
      bal.set(p.supplier_id, (bal.get(p.supplier_id) ?? 0) + (p.doc_type === "purchase" ? due : -due));
    }
    for (const p of (pays ?? []) as any[]) {
      if (!p.supplier_id) continue;
      if (p.kind === "supplier_payment") bal.set(p.supplier_id, (bal.get(p.supplier_id) ?? 0) - Number(p.amount));
      else if (!p.purchase_id) bal.set(p.supplier_id, (bal.get(p.supplier_id) ?? 0) + Number(p.amount));
    }
    type Sup = { id: string; name: string; phone: string; address: string; openingBalance: number; balance: number };
    return {
      suppliers: ((sups ?? []) as any[]).map((s: any): Sup => ({
        id: s.id as string,
        name: s.name as string,
        phone: (s.phone ?? "") as string,
        address: (s.address ?? "") as string,
        openingBalance: Number(s.opening_balance),
        balance: r2(Number(s.opening_balance) + (bal.get(s.id) ?? 0)),
      })),
    };
  });

export const saveSupplier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(120), phone: z.string().max(30).optional(), address: z.string().max(300).optional(), openingBalance: z.number().min(-1e9).max(1e9).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const row = { name: data.name, phone: data.phone || null, address: data.address || null, opening_balance: data.openingBalance ?? 0 };
    const q = data.id ? sb.from("suppliers").update(row).eq("id", data.id) : sb.from("suppliers").insert(row);
    const { error } = await q;
    if (error) throw new Error("Failed to save supplier");
    return { ok: true };
  });

/** Resolve a POS party to its purchase-side record without changing historical document IDs. */
export const ensurePurchaseParty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ customerId: z.string().uuid().optional(), supplierId: z.string().uuid().optional() }).refine((d) => !!d.customerId !== !!d.supplierId).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { data: allowed, error: accessError } = await sb.rpc("pos_can", { _perm: "manage_purchases" });
    if (accessError || !allowed) throw new Error("Not allowed to manage purchases");
    if (data.supplierId) {
      const { data: supplier, error } = await sb.from("suppliers").select("id, name").eq("id", data.supplierId).eq("is_active", true).maybeSingle();
      if (error || !supplier) throw new Error("Party not found");
      return { id: supplier.id as string, name: supplier.name as string };
    }
    const { data: customer, error: customerError } = await sb.from("customers").select("name, phone").eq("id", data.customerId).maybeSingle();
    if (customerError || !customer) throw new Error("Party not found");
    const digits = String(customer.phone ?? "").replace(/\D/g, "");
    if (digits.length < 7) throw new Error("Add a valid phone number to this party first");
    const { data: suppliers, error: listError } = await sb.from("suppliers").select("id, name, phone").eq("is_active", true);
    if (listError) throw new Error("Could not check parties");
    const matching = (suppliers ?? []).filter((s: any) => String(s.phone ?? "").replace(/\D/g, "").slice(-10) === digits.slice(-10));
    if (matching.length > 1) throw new Error("Multiple purchase records share this phone. Please select the exact party record in Purchases.");
    if (matching.length) return { id: matching[0].id as string, name: matching[0].name as string };
    const { data: created, error } = await sb.from("suppliers").insert({ name: customer.name || customer.phone, phone: customer.phone }).select("id, name").single();
    if (error || !created) throw new Error("Could not use this party for purchase");
    return { id: created.id as string, name: created.name as string };
  });

export const partyPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ kind: z.enum(["supplier_payment", "receipt", "customer_payment_out", "supplier_receipt"]), partyId: z.string().uuid(), amount: z.number().positive().max(1e9), method: z.string().max(30), note: z.string().max(300).optional(), clientRef: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as Sb).rpc("pos_party_payment", { _kind: data.kind, _party: data.partyId, _amount: data.amount, _method: data.method, _note: data.note ?? "", _ref: data.clientRef ?? null });
    if (error) throw new Error(friendlyDbError(error, "Failed to save payment."));
    return { ok: true };
  });

export const getSupplierLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const [{ data: s }, { data: purs }, { data: pays }] = await Promise.all([
      sb.from("suppliers").select("name, opening_balance").eq("id", data.id).maybeSingle(),
      sb.from("purchases").select("id, doc_number, doc_type, status, grand_total, paid_total, created_at").eq("supplier_id", data.id).order("created_at"),
      sb.from("pos_payments").select("id, amount, method, kind, note, created_at, status, purchase_id").eq("supplier_id", data.id).order("created_at"),
    ]);
    type E = { date: string; ref: string; kind: string; debit: number; credit: number; id: string; entity: "purchase" | "payment"; standalone: boolean };
    const rows: E[] = [];
    for (const p of purs ?? []) {
      if (p.status === "cancelled") continue;
      if (p.doc_type === "purchase") rows.push({ date: p.created_at, ref: p.doc_number, kind: "Purchase", debit: 0, credit: Number(p.grand_total), id: p.id, entity: "purchase", standalone: true });
      else rows.push({ date: p.created_at, ref: p.doc_number, kind: "Purchase return", debit: Number(p.grand_total), credit: 0, id: p.id, entity: "purchase", standalone: true });
    }
    for (const p of pays ?? []) {
      if (p.status !== "completed") continue;
      const standalone = !p.purchase_id;
      if (p.kind === "purchase" || p.kind === "supplier_payment") rows.push({ date: p.created_at, ref: p.note || p.method, kind: p.kind === "purchase" ? `Paid (${p.method})` : `Payment (${p.method})`, debit: Number(p.amount), credit: 0, id: p.id, entity: "payment", standalone });
      if (p.kind === "purchase_refund") rows.push({ date: p.created_at, ref: p.method, kind: "Refund received", debit: 0, credit: Number(p.amount), id: p.id, entity: "payment", standalone });
    }
    rows.sort((a, b) => a.date.localeCompare(b.date));
    let run = Number(s?.opening_balance ?? 0);
    return {
      name: (s?.name ?? "") as string,
      opening: run,
      rows: rows.map((r) => { run = r2(run + r.credit - r.debit); return { ...r, balance: run }; }),
    };
  });

/* ------------------------------ Purchases ------------------------------ */

export const listProductsLite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await (context.supabase as Sb).from("products").select("id, name, unit, sku, barcode, category, purchase_price, sale_price, stock").eq("is_active", true).eq("scope", "pos").order("name").limit(5000);
    type P = { id: string; name: string; unit: string; sku: string | null; barcode: string | null; category: string | null; purchasePrice: number | null; salePrice: number; stock: number };
    return { products: ((data ?? []) as any[]).map((p: any): P => ({ id: p.id as string, name: p.name as string, unit: p.unit as string, sku: p.sku as string | null, barcode: p.barcode as string | null, category: p.category as string | null, purchasePrice: p.purchase_price == null ? null : Number(p.purchase_price), salePrice: Number(p.sale_price), stock: Number(p.stock ?? 0) })) };
  });

export const savePurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      docType: z.enum(["purchase", "return"]),
      supplierId: z.string().uuid().optional(),
      supplierName: z.string().max(120).optional(),
      paid: amt,
      method: z.string().max(30),
      discount: amt,
      notes: z.string().max(1000).optional(),
      refPurchaseId: z.string().uuid().optional(),
      clientRef: z.string().uuid().optional(),
      items: z.array(z.object({ productId: z.string().uuid().optional(), name: z.string().min(1).max(300), unit: z.string().max(40).optional(), qty: z.number().positive().max(1e7), rate: amt, discount: amt, taxPercent: z.number().min(0).max(100), batch: z.string().max(60).optional(), expiry: z.string().max(10).optional() })).min(1).max(300),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const items = data.items.map((i) => {
      const base = Math.max(0, i.qty * i.rate - i.discount);
      const tax = r2((base * i.taxPercent) / 100);
      return { product_id: i.productId ?? "", name: i.name, unit: i.unit ?? "", qty: i.qty, rate: i.rate, discount: i.discount, tax_percent: i.taxPercent, tax_amount: tax, line_total: r2(base + tax), batch: i.batch ?? "", expiry: i.expiry ?? "" };
    });
    const subtotal = r2(items.reduce((s, i) => s + i.line_total - i.tax_amount, 0));
    const tax = r2(items.reduce((s, i) => s + i.tax_amount, 0));
    const total = Math.max(0, r2(subtotal + tax - data.discount));
    const { data: res, error } = await withStore((context.supabase as Sb).rpc("pos_save_purchase", {
      _p: { client_ref: data.clientRef ?? "", doc_type: data.docType, supplier_id: data.supplierId ?? "", supplier_name: data.supplierName ?? "", subtotal, discount_total: data.discount, tax_total: tax, grand_total: total, paid: data.paid, method: data.method, notes: data.notes ?? "", ref_purchase_id: data.refPurchaseId ?? "", items },
    }));
    if (error || !res) { console.error(error); throw new Error(friendlyDbError(error, "Failed to save purchase.")); }
    return { ...(res as { id: string; number: string }), total };
  });

export const listPurchases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await (context.supabase as Sb).from("purchases").select("id, doc_number, doc_type, status, payment_status, supplier_id, supplier_name, ref_purchase_id, discount_total, notes, grand_total, paid_total, balance, created_at").neq("status", "cancelled").order("created_at", { ascending: false }).limit(100);
    return { purchases: (data ?? []).map((p: any) => ({ ...p, discount_total: Number(p.discount_total), grand_total: Number(p.grand_total), paid_total: Number(p.paid_total), balance: Number(p.balance) })) as Array<{ id: string; doc_number: string; doc_type: string; status: string; payment_status: string; supplier_id: string | null; ref_purchase_id: string | null; discount_total: number; notes: string | null; supplier_name: string | null; grand_total: number; paid_total: number; balance: number; created_at: string }> };
  });

export const getPurchaseItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const [{ data: p }, { data: items }] = await Promise.all([
      sb.from("purchases").select("id, doc_number, supplier_id, supplier_name").eq("id", data.id).maybeSingle(),
      sb.from("purchase_items").select("product_id, name, unit, qty, rate, discount, tax_percent, line_total").eq("purchase_id", data.id),
    ]);
    return { purchase: p as { id: string; doc_number: string; supplier_id: string | null; supplier_name: string | null } | null, items: ((items ?? []) as any[]).map((i: any): { productId: string | null; name: string; unit: string; qty: number; rate: number; discount: number; taxPercent: number; lineTotal: number } => ({ productId: i.product_id as string | null, name: i.name as string, unit: (i.unit ?? "") as string, qty: Number(i.qty), rate: Number(i.rate), discount: Number(i.discount), taxPercent: Number(i.tax_percent), lineTotal: Number(i.line_total) })) };
  });

/* ---------------------------- Sales returns ---------------------------- */

export const searchSales = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    let q = (context.supabase as Sb).from("pos_sales").select("id, doc_number, customer_name, customer_phone, grand_total, payment_status, created_at").eq("doc_type", "sale").neq("status", "cancelled").order("created_at", { ascending: false }).limit(30);
    const t = data.q.trim().replace(/[,()%]/g, "");
    if (t) q = q.or(`doc_number.ilike.%${t}%,customer_name.ilike.%${t}%,customer_phone.ilike.%${t}%`);
    const { data: rows } = await q;
    return { sales: (rows ?? []).map((r: any) => ({ ...r, grand_total: Number(r.grand_total) })) as Array<{ id: string; doc_number: string; customer_name: string | null; customer_phone: string | null; grand_total: number; payment_status: string; created_at: string }> };
  });

type RetItem = { id: string; productId: string | null; name: string; unit: string; rateType: string | null; qty: number; stockPerUnit: number; unitRefund: number; returned: number };
async function returnable(sb: Sb, saleId: string) {
  const [{ data: sale }, { data: items }, { data: rets }] = await Promise.all([
    sb.from("pos_sales").select("id, doc_number, customer_id, customer_name, customer_phone, grand_total, delivery, paid_total").eq("id", saleId).eq("doc_type", "sale").maybeSingle(),
    sb.from("pos_sale_items").select("id, product_id, name, unit, rate_type, qty, stock_qty, rate, line_total").eq("sale_id", saleId),
    sb.from("pos_sales").select("id, payload").eq("ref_sale_id", saleId).eq("doc_type", "return").neq("status", "cancelled"),
  ]);
  const done = new Map<string, number>();
  for (const r of rets ?? []) for (const x of ((r.payload as any)?.lines ?? []) as Array<{ itemId: string; qty: number }>) done.set(x.itemId, (done.get(x.itemId) ?? 0) + Number(x.qty));
  const lineSum = (items ?? []).reduce((s: number, i: any) => s + Number(i.line_total), 0);
  const factor = lineSum > 0 ? Math.max(0, (Number(sale?.grand_total ?? 0) - Number(sale?.delivery ?? 0)) / lineSum) : 1;
  return {
    sale,
    items: ((items ?? []) as any[]).map((i: any): RetItem => {
      const qty = Number(i.qty);
      return { id: i.id as string, productId: i.product_id as string | null, name: i.name as string, unit: (i.unit ?? "") as string, rateType: i.rate_type as string | null, qty, stockPerUnit: qty ? Number(i.stock_qty) / qty : 0, unitRefund: qty ? r2((Number(i.line_total) / qty) * factor) : 0, returned: done.get(i.id) ?? 0 };
    }),
  };
}

export const getSaleForReturn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const r = await returnable(context.supabase as Sb, data.id);
    if (!r.sale) throw new Error("Bill not found");
    return { sale: { id: r.sale.id as string, number: r.sale.doc_number as string, customerName: (r.sale.customer_name ?? "") as string, customerPhone: (r.sale.customer_phone ?? "") as string, hasCustomer: !!r.sale.customer_id, total: Number(r.sale.grand_total) }, items: r.items };
  });

export const saveSalesReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ saleId: z.string().uuid(), mode: z.enum(["refund", "credit"]), method: z.string().max(30), reason: z.string().max(300).optional(), lines: z.array(z.object({ itemId: z.string().uuid(), qty: z.number().positive().max(1e7) })).min(1).max(300), clientRef: z.string().uuid().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const r = await returnable(sb, data.saleId);
    if (!r.sale) throw new Error("Bill not found");
    if (data.mode === "credit" && !r.sale.customer_id) throw new Error("A walk-in bill cannot be credit — choose refund instead");
    const items = data.lines.map((l) => {
      const it = r.items.find((x: { id: string }) => x.id === l.itemId);
      if (!it) throw new Error("Item not in the bill");
      if (l.qty > it.qty - it.returned + 1e-9) throw new Error(`${it.name}: zyada se zyada ${r2(it.qty - it.returned)} wapas ho sakta hai`);
      return { product_id: it.productId ?? "", name: it.name, unit: it.unit, rate_type: it.rateType, qty: l.qty, stock_qty: r2(it.stockPerUnit * l.qty * 1000) / 1000, rate: it.unitRefund, line_total: r2(it.unitRefund * l.qty) };
    });
    const total = r2(items.reduce((s, i) => s + i.line_total, 0));
    const { data: res, error } = await withStore(sb.rpc("pos_save_sale", {
      _p: {
        doc_type: "return",
        client_ref: data.clientRef ?? "",
        customer_id: r.sale.customer_id ?? "",
        customer_name: r.sale.customer_name ?? "",
        customer_phone: "",
        subtotal: total,
        grand_total: total,
        notes: `Return of ${r.sale.doc_number}${data.reason ? ` — ${data.reason}` : ""}`,
        ref_sale_id: data.saleId,
        payments: data.mode === "refund" ? [{ method: data.method, amount: total }] : [{ method: "Credit", amount: total }],
        ui: { lines: data.lines },
        items,
      },
    }));
    if (error || !res) { console.error(error); throw new Error(friendlyDbError(error, "Failed to save return.")); }
    return { ...(res as { id: string; number: string }), total };
  });

export const saveUnlinkedSalesReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    customerId: z.string().uuid().optional(), customerName: z.string().max(120).optional(),
    mode: z.enum(["refund", "credit"]), method: z.string().max(30), reason: z.string().max(300).optional(),
    clientRef: z.string().uuid(),
    items: z.array(z.object({ productId: z.string().uuid(), name: z.string().min(1).max(300), unit: z.string().max(40), qty: z.number().positive().max(1e7), rate: amt })).min(1).max(300),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await withStore((context.supabase as Sb).rpc("pos_save_unlinked_return", { _p: {
      client_ref: data.clientRef, customer_id: data.customerId ?? "", customer_name: data.customerName ?? "",
      mode: data.mode, method: data.method, reason: data.reason ?? "", items: data.items.map((i) => ({ product_id: i.productId, name: i.name, unit: i.unit, qty: i.qty, rate: i.rate })),
    } }));
    if (error || !res) throw new Error(friendlyDbError(error, "Failed to save return."));
    return res as { id: string; number: string; total: number };
  });

export const listReturns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await (context.supabase as Sb).from("pos_sales").select("id, doc_number, customer_name, grand_total, paid_total, notes, status, created_at").eq("doc_type", "return").order("created_at", { ascending: false }).limit(100);
    return { returns: (data ?? []).map((r: any) => ({ ...r, grand_total: Number(r.grand_total), paid_total: Number(r.paid_total) })) as Array<{ id: string; doc_number: string; customer_name: string | null; grand_total: number; paid_total: number; notes: string | null; status: string; created_at: string }> };
  });

export const cancelDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), reason: z.string().max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await withStore((context.supabase as Sb).rpc("pos_cancel_sale", { _id: data.id, _reason: data.reason }));
    if (error) throw new Error(friendlyDbError(error, "Failed to cancel."));
    return { ok: true };
  });

/** Standalone party payment (receipt / payment out) delete — sirf admin. Bill se juri payments nahi. */
export const deletePartyPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as Sb;
    const { data: isAdmin } = await sb.rpc("pos_is_admin");
    if (!isAdmin) throw new Error("Sirf admin payment delete kar sakta hai");
    const { data: pay } = await sb.from("pos_payments").select("id, kind, sale_id, purchase_id").eq("id", data.id).maybeSingle();
    if (!pay) throw new Error("Payment not found");
    if (pay.sale_id || pay.purchase_id) throw new Error("Bill se juri payment delete nahi ho sakti — bill cancel karein");
    if (!["receipt", "customer_payment_out", "supplier_payment", "supplier_receipt"].includes(pay.kind)) throw new Error("Ye payment delete nahi ho sakti");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("pos_payments").delete().eq("id", data.id);
    if (error) throw new Error(friendlyDbError(error, "Failed to delete payment."));
    await supabaseAdmin.from("audit_log").insert({ action: "delete", entity: "pos_payment", entity_id: data.id, details: { kind: pay.kind } }).then(() => null, () => null);
    return { ok: true };
  });

export const cancelPurchase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), reason: z.string().max(300).default("") }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await withStore((context.supabase as Sb).rpc("pos_cancel_purchase" as never, { _id: data.id, _reason: data.reason } as never));
    if (error) throw new Error(friendlyDbError(error, "Failed to cancel purchase."));
    return { ok: true };
  });
