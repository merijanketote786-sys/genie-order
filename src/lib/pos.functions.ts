import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const input = z.object({
  customerName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(30).optional(),
  total: z.number().nonnegative().max(1e9),
  paid: z.number().nonnegative().max(1e9),
  payMode: z.enum(["Cash", "Card", "Udhaar"]),
  status: z.enum(["paid", "partial", "unpaid"]),
  /** text builder receives the invoice number via {{INVOICE}} placeholder */
  invoiceText: z.string().trim().min(5).max(20000),
  stock: z.array(z.object({ name: z.string().max(300), qty: z.number().min(0).max(1e7) })).max(300),
  items: z
    .array(
      z.object({
        name: z.string().max(300),
        unit: z.string().max(60).optional(),
        rateType: z.string().max(20).optional(),
        qty: z.number().min(0).max(1e7),
        stockQty: z.number().min(0).max(1e7),
        rate: z.number().min(0).max(1e9),
        discount: z.number().min(0).max(1e9),
        lineTotal: z.number().min(0).max(1e9),
      }),
    )
    .max(300)
    .optional(),
  subtotal: z.number().min(0).max(1e9).optional(),
  discountTotal: z.number().min(0).max(1e9).optional(),
  delivery: z.number().min(0).max(1e9).optional(),
});

/** Sale ek hi database transaction me save hoti hai: bill + items + payment + stock + invoice record. */
export const savePosSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const names = [...new Set((data.items ?? data.stock).map((s) => s.name))];
    const { data: prods } = names.length
      ? await supabase.from("products").select("id, name").in("name", names)
      : { data: [] };
    const idOf = new Map<string, string>((prods ?? []).map((p: { id: string; name: string }) => [p.name, p.id]));

    const items =
      data.items?.map((i) => ({
        product_id: idOf.get(i.name) ?? null,
        name: i.name,
        unit: i.unit ?? null,
        rate_type: i.rateType ?? null,
        qty: i.qty,
        stock_qty: i.stockQty,
        rate: i.rate,
        discount: i.discount,
        line_total: i.lineTotal,
      })) ??
      data.stock.map((s) => ({ product_id: idOf.get(s.name) ?? null, name: s.name, qty: s.qty, stock_qty: s.qty, rate: 0, line_total: 0 }));

    const paidAmt = Math.min(data.paid, data.total);
    const payments = [
      ...(paidAmt > 0 ? [{ method: data.payMode === "Udhaar" ? "Cash" : data.payMode, amount: paidAmt }] : []),
      ...(data.total - paidAmt > 0 ? [{ method: "Credit", amount: data.total - paidAmt }] : []),
    ];

    const { data: res, error } = await supabase.rpc("pos_save_sale", {
      _p: {
        doc_type: "sale",
        customer_name: data.customerName ?? "",
        customer_phone: data.phone ?? "",
        subtotal: data.subtotal ?? data.total,
        discount_total: data.discountTotal ?? 0,
        delivery: data.delivery ?? 0,
        grand_total: data.total,
        items,
        payments,
        method_label: data.payMode,
        invoice_text: data.invoiceText,
      },
    });
    if (error || !res) throw new Error(error?.message?.includes("Access") ? "Access band hai" : "Sale save nahi ho saki");
    const r = res as { id: string; number: string };
    return { ok: true, id: r.id, invoiceNumber: r.number };
  });
