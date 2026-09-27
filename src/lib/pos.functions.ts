import { withStore } from "@/lib/pos-store.server";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { friendlyDbError } from "./pos-errors";

const money = z.number().min(0).max(1e9);
const docInput = z.object({
  docType: z.enum(["sale", "quotation", "held", "return"]),
  customerId: z.string().uuid().optional(),
  customerName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(30).optional(),
  subtotal: money,
  discountTotal: money,
  taxTotal: money,
  delivery: money,
  total: money,
  notes: z.string().max(2000).optional(),
  refSaleId: z.string().uuid().optional(),
  convertFromId: z.string().uuid().optional(),
  methodLabel: z.string().max(120).optional(),
  invoiceText: z.string().max(20000).optional(),
  payments: z.array(z.object({ method: z.string().max(30), amount: money })).max(10),
  items: z
    .array(
      z.object({
        name: z.string().max(300),
        unit: z.string().max(60).optional(),
        rateType: z.string().max(20).optional(),
        qty: z.number().min(0).max(1e7),
        stockQty: z.number().min(0).max(1e7),
        rate: money,
        discount: money,
        taxPercent: z.number().min(0).max(100),
        taxAmount: money,
        lineTotal: money,
        note: z.string().max(300).optional(),
      }),
    )
    .max(300),
  /** cart/UI state — held bill aur quotation wapas kholne ke liye */
  ui: z.unknown().optional(),
  /** Idempotency key — double click / retry par duplicate bill nahi banta */
  clientRef: z.string().uuid().optional(),
});
export type PosDocInput = z.infer<typeof docInput>;

/** Bill / quotation / hold / return — ek database transaction me (stock + payment + invoice record + conversion). */
export const savePosDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => docInput.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const names = [...new Set(data.items.map((s) => s.name))];
    const { data: prods } = names.length ? await supabase.from("products").select("id, name").eq("scope", "pos").in("name", names) : { data: [] };
    const idOf = new Map<string, string>((prods ?? []).map((p: { id: string; name: string }) => [p.name, p.id]));

    const { data: res, error } = await withStore(supabase.rpc("pos_save_sale", {
      _p: {
        doc_type: data.docType,
        client_ref: data.clientRef ?? "",
        convert_from_id: data.convertFromId ?? "",
        customer_id: data.customerId ?? "",
        customer_name: data.customerName ?? "",
        customer_phone: data.phone ?? "",
        subtotal: data.subtotal,
        discount_total: data.discountTotal,
        tax_total: data.taxTotal,
        delivery: data.delivery,
        grand_total: data.total,
        notes: data.notes ?? "",
        ref_sale_id: data.refSaleId ?? "",
        method_label: data.methodLabel ?? "Cash",
        invoice_text: data.invoiceText ?? "",
        payments: data.payments,
        ui: data.ui ?? null,
        items: data.items.map((i) => ({
          product_id: idOf.get(i.name) ?? null,
          name: i.name,
          unit: i.unit ?? null,
          rate_type: i.rateType ?? null,
          qty: i.qty,
          stock_qty: i.stockQty,
          rate: i.rate,
          discount: i.discount,
          tax_percent: i.taxPercent,
          tax_amount: i.taxAmount,
          line_total: i.lineTotal,
          note: i.note ?? null,
        })),
      },
    }));
    if (error || !res) {
      console.error("pos_save_sale", error);
      throw new Error(friendlyDbError(error, "Unable to save invoice."));
    }
    const r = res as { id: string; number: string; payment_status: string; duplicate?: boolean; change?: number };
    return { ok: true, id: r.id, invoiceNumber: r.number, paymentStatus: r.payment_status, duplicate: !!r.duplicate, change: Number(r.change ?? 0) };
  });

/** Held bills / quotations ki list (sirf open wale). */
export const listPosDocs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ docType: z.enum(["quotation", "held", "sale"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const q = supabase
      .from("pos_sales")
      .select("id, doc_number, customer_name, customer_phone, grand_total, created_at, payload, status")
      .eq("doc_type", data.docType)
      .order("created_at", { ascending: false })
      .limit(50);
    const { data: rows, error } = data.docType === "sale" ? await q : await q.in("status", ["draft", "completed"]);
    if (error) throw new Error("Failed to load the list");
    type Row = { id: string; doc_number: string; customer_name: string | null; customer_phone: string | null; grand_total: number; created_at: string; payload: unknown; status: string };
    return { docs: ((rows ?? []) as Row[]).map((r) => ({ ...r, grand_total: Number(r.grand_total), payload: r.payload == null ? null : JSON.stringify(r.payload) })) };
  });

/** POS invoice record — sirf POS sales (items + payments ke saath), print/share ke liye. */
export const listPosSales = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ search: z.string().trim().max(80).optional(), estimates: z.boolean().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    let q = supabase
      .from("pos_sales")
      .select("id, doc_number, doc_type, status, payment_status, customer_name, customer_phone, subtotal, discount_total, tax_total, delivery, grand_total, paid_total, balance, notes, created_at, payload")
      .in("doc_type", data.estimates ? ["quotation"] : ["sale", "return"])
      .order("created_at", { ascending: false })
      .limit(200);
    const s = (data.search ?? "").trim();
    if (s) q = q.or(`doc_number.ilike.%${s}%,customer_name.ilike.%${s}%,customer_phone.ilike.%${s}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error("Failed to load invoices");
    const ids = (rows ?? []).map((r: { id: string }) => r.id);
    const [{ data: items }, { data: pays }] = ids.length
      ? await Promise.all([
          supabase.from("pos_sale_items").select("sale_id, name, sku, unit, qty, rate, discount, tax_percent, line_total, note").in("sale_id", ids),
          supabase.from("pos_payments").select("sale_id, method, amount, kind, status").in("sale_id", ids).eq("status", "completed"),
        ])
      : [{ data: [] }, { data: [] }];
    type Item = { sale_id: string; name: string; sku: string | null; unit: string | null; qty: number; rate: number; discount: number; tax_percent: number; line_total: number; note: string | null };
    type Pay = { sale_id: string; method: string; amount: number; kind: string; status: string };
    const itemsOf = new Map<string, Item[]>();
    for (const it of (items ?? []) as Item[]) itemsOf.set(it.sale_id, [...(itemsOf.get(it.sale_id) ?? []), it]);
    const paysOf = new Map<string, Pay[]>();
    for (const p of (pays ?? []) as Pay[]) paysOf.set(p.sale_id, [...(paysOf.get(p.sale_id) ?? []), p]);
    return {
      sales: (rows ?? []).map((r: Record<string, unknown>) => ({
        ...r,
        items: itemsOf.get(r.id as string) ?? [],
        payments: paysOf.get(r.id as string) ?? [],
      })),
    };
  });

/** Held bill wapas kholne par band (converted) mark karein. */
export const closePosDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("pos_close_doc", { _id: data.id });
    if (error) throw new Error(friendlyDbError(error, "Failed to update."));
    return { ok: true };
  });

/** Estimate / held bill ko record se hamesha ke liye delete karein (invoices sirf cancel hoti hain). */
export const deletePosDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await withStore((context.supabase as any).rpc("pos_delete_doc", { _id: data.id }));
    if (error) throw new Error(friendlyDbError(error, "Failed to delete."));
    return { ok: true };
  });

/** Customer ka purana baqaya: opening + POS udhaar − returns/receipts. */
export const getCustomerBalance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ phone: z.string().max(30) }).parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const phone = data.phone.replace(/\D/g, "");
    if (phone.length < 10) return { found: false, balance: 0, creditLimit: null as number | null, customerId: null as string | null };
    const { data: c } = await supabase.from("customers").select("id, opening_balance, credit_limit").eq("phone", phone).maybeSingle();
    if (!c) return { found: false, balance: 0, creditLimit: null, customerId: null };
    const [{ data: sales }, { data: pays }] = await Promise.all([
      supabase.from("pos_sales").select("doc_type, balance, grand_total, paid_total").eq("customer_id", c.id).in("doc_type", ["sale", "return"]).neq("status", "cancelled"),
      supabase.from("pos_payments").select("amount").eq("customer_id", c.id).eq("kind", "receipt").eq("status", "completed"),
    ]);
    let bal = Number(c.opening_balance ?? 0);
    for (const s of sales ?? []) bal += s.doc_type === "sale" ? Number(s.balance) : -(Number(s.grand_total) - Number(s.paid_total));
    for (const p of pays ?? []) bal -= Number(p.amount);
    return { found: true, balance: Math.round(bal * 100) / 100, creditLimit: c.credit_limit == null ? null : Number(c.credit_limit), customerId: c.id as string };
  });

/** Purana API (backward compat) — naya code savePosDoc use kare. */
export const savePosSale = savePosDoc;
