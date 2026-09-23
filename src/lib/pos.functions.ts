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
});

export const savePosSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    const { isActiveProfile } = await import("@/lib/access.server");
    if (!(await isActiveProfile(context.supabase as never, context.userId))) throw new Error("Access band hai");
    const supabase = context.supabase as any;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: num, error: numErr } = await supabaseAdmin.rpc("next_invoice_number");
    if (numErr || !num) throw new Error("Invoice number nahi ban saka");
    const invoiceNumber = String(num);

    const phoneDigits = (data.phone ?? "").replace(/\D/g, "");
    let customerId: string | null = null;
    if (phoneDigits.length >= 10) {
      const { data: ex } = await supabase.from("customers").select("id").eq("phone", phoneDigits).maybeSingle();
      if (ex) customerId = ex.id;
      else {
        const { data: c } = await supabase
          .from("customers")
          .insert({ phone: phoneDigits, name: data.customerName || null, created_by: context.userId })
          .select("id")
          .maybeSingle();
        customerId = c?.id ?? null;
      }
    }

    const { data: row, error } = await supabase
      .from("invoices")
      .insert({
        invoice_number: invoiceNumber,
        customer_name: data.customerName || "Walk-in",
        phone: phoneDigits || null,
        total: data.total,
        payment_status: data.status,
        paid_at: data.status === "paid" ? new Date().toISOString() : null,
        payment_method: `POS-${data.payMode}`,
        cod_amount: data.status === "paid" ? null : Math.max(0, data.total - data.paid),
        invoice_text: data.invoiceText.replaceAll("{{INVOICE}}", invoiceNumber),
        customer_id: customerId,
        created_by: context.userId,
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error("Sale save nahi ho saki");

    // Stock kam karein (sirf user ke workspace ke products)
    const { data: prof } = await supabaseAdmin.from("profiles").select("workspace_id").eq("id", context.userId).maybeSingle();
    const ws = prof?.workspace_id ?? context.userId;
    for (const s of data.stock) {
      if (!s.qty) continue;
      const { data: p } = await supabaseAdmin
        .from("products")
        .select("id, stock")
        .eq("workspace_id", ws)
        .eq("name", s.name)
        .maybeSingle();
      if (p) await supabaseAdmin.from("products").update({ stock: Number(p.stock ?? 0) - s.qty }).eq("id", p.id);
    }
    return { ok: true, id: row?.id as string, invoiceNumber };
  });
