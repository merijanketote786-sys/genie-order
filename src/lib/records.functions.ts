import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { normalizePhone, parseInvoiceSummary, parseOrderText } from "@/lib/record-parse";

async function blocked(context: { supabase: unknown; userId: string }) {
  const { isActiveProfile } = await import("@/lib/access.server");
  return !(await isActiveProfile(context.supabase as never, context.userId));
}

async function isAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  return data === true;
}

/** Customer upsert by phone; returns customer id (null when no usable phone) */
async function upsertCustomer(
  supabase: any,
  userId: string,
  input: { phone: string; name?: string; city?: string; address?: string },
) {
  const phone = normalizePhone(input.phone);
  if (!phone) return null;

  const { data: existing } = await supabase
    .from("customers")
    .select("id, name, city, address")
    .eq("phone", phone)
    .maybeSingle();

  if (!existing) {
    const { data } = await supabase
      .from("customers")
      .insert({
        phone,
        name: input.name || null,
        city: input.city || null,
        address: input.address || null,
        created_by: userId,
      })
      .select("id")
      .maybeSingle();
    return data?.id ?? null;
  }

  const patch: Record<string, string> = {};
  if (input.name && input.name !== existing.name) patch.name = input.name;
  if (input.city && input.city !== existing.city) patch.city = input.city;
  if (input.address && input.address !== existing.address) patch.address = input.address;
  if (Object.keys(patch).length > 0) {
    await supabase.from("customers").update(patch).eq("id", existing.id);
  }
  return existing.id as string;
}

/* ------------------------------- orders -------------------------------- */

export const saveOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        orderText: z.string().trim().min(5).max(8000),
        paymentMethod: z.enum(["COD", "CC"]).optional(),
        codAmount: z.number().nonnegative().max(100000000).optional(),
      })
      .parse(data),
  )

  .handler(async ({ data, context }) => {
    if (await blocked(context)) throw new Error("Access is blocked");
    const supabase = context.supabase as any;
    const p = parseOrderText(data.orderText);

    const { data: dup } = await supabase
      .from("orders")
      .select("id")
      .eq("order_text", data.orderText)
      .limit(1)
      .maybeSingle();
    if (dup) return { ok: true, id: dup.id as string, duplicate: true };

    const customerId = await upsertCustomer(supabase, context.userId, {
      phone: p.phone,
      name: p.customerName,
      city: p.city,
      address: p.address,
    });

    const { data: row, error } = await supabase
      .from("orders")
      .insert({
        order_number: p.orderNumber || null,
        customer_name: p.customerName || null,
        phone: normalizePhone(p.phone) ?? (p.phone || null),
        city: p.city || null,
        address: p.address || null,
        product: p.product || null,
        qty: p.qty || null,
        product_total: p.productTotal,
        delivery: p.delivery || null,
        advance: p.advance || null,
        status: p.status || null,
        payment_method: data.paymentMethod ?? null,
        cod_amount: data.paymentMethod === "COD" ? (data.codAmount ?? null) : null,
        order_text: data.orderText,
        customer_id: customerId,
        created_by: context.userId,
      })
      .select("id")
      .maybeSingle();

    if (error) throw new Error("Could not save order");
    return { ok: true, id: row?.id as string, duplicate: false };
  });

export type OrderRow = {
  id: string;
  orderNumber: string | null;
  customerName: string | null;
  phone: string | null;
  city: string | null;
  product: string | null;
  qty: string | null;
  total: number | null;
  status: string | null;
  orderText: string;
  createdBy: string | null;
  createdAt: string;
};

export const listOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ search: z.string().trim().max(120).optional(), limit: z.number().max(500).optional() })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    if (await blocked(context)) return { orders: [] as OrderRow[], names: {} as Record<string, string>, isAdmin: false };
    const supabase = context.supabase as any;

    let query = supabase
      .from("orders")
      .select(
        "id, order_number, customer_name, phone, city, product, qty, product_total, status, order_text, created_by, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 200);

    const s = data.search?.trim();
    if (s) {
      const like = `%${s.replace(/[%,]/g, "")}%`;
      query = query.or(
        `customer_name.ilike.${like},phone.ilike.${like},product.ilike.${like},order_number.ilike.${like},city.ilike.${like}`,
      );
    }

    const { data: rows, error } = await query;
    if (error) throw new Error("Could not load orders");

    const names = await profileNames(supabase, (rows ?? []).map((r: any) => r.created_by));

    return {
      orders: (rows ?? []).map((r: any): OrderRow => ({
        id: r.id,
        orderNumber: r.order_number,
        customerName: r.customer_name,
        phone: r.phone,
        city: r.city,
        product: r.product,
        qty: r.qty,
        total: r.product_total == null ? null : Number(r.product_total),
        status: r.status,
        orderText: r.order_text,
        createdBy: r.created_by,
        createdAt: r.created_at,
      })),
      names,
      isAdmin: await isAdmin(context),
    };
  });

async function profileNames(supabase: any, ids: (string | null)[]) {
  const unique = [...new Set(ids.filter(Boolean))] as string[];
  if (unique.length === 0) return {};
  const { data } = await supabase.from("profiles").select("id, full_name").in("id", unique);
  const out: Record<string, string> = {};
  for (const p of data ?? []) out[p.id] = p.full_name || "";
  return out;
}

export const deleteOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { error } = await supabase.from("orders").delete().eq("id", data.id);
    if (error) throw new Error("Could not delete (admin only)");
    return { ok: true };
  });

/* ------------------------------ customers ------------------------------ */

export type CustomerRow = {
  id: string;
  phone: string;
  name: string | null;
  city: string | null;
  address: string | null;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
};

export const listCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ search: z.string().trim().max(120).optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    if (await blocked(context)) return { customers: [] as CustomerRow[], isAdmin: false };
    const supabase = context.supabase as any;

    let query = supabase
      .from("customers")
      .select("id, phone, name, city, address")
      .order("updated_at", { ascending: false })
      .limit(1000);

    const s = data.search?.trim();
    if (s) {
      const like = `%${s.replace(/[%,]/g, "")}%`;
      query = query.or(`name.ilike.${like},phone.ilike.${like},city.ilike.${like}`);
    }

    const { data: rows, error } = await query;
    if (error) throw new Error("Could not load customers");

    const ids = (rows ?? []).map((r: any) => r.id);
    const stats: Record<string, { count: number; total: number; last: string | null }> = {};
    if (ids.length > 0) {
      const { data: orderRows } = await supabase
        .from("orders")
        .select("customer_id, product_total, created_at")
        .in("customer_id", ids)
        .limit(5000);
      for (const o of orderRows ?? []) {
        const s2 = (stats[o.customer_id] ??= { count: 0, total: 0, last: null });
        s2.count += 1;
        s2.total += Number(o.product_total ?? 0);
        if (!s2.last || o.created_at > s2.last) s2.last = o.created_at;
      }
    }

    return {
      customers: (rows ?? []).map((r: any): CustomerRow => ({
        id: r.id,
        phone: r.phone,
        name: r.name,
        city: r.city,
        address: r.address,
        orderCount: stats[r.id]?.count ?? 0,
        totalSpent: stats[r.id]?.total ?? 0,
        lastOrderAt: stats[r.id]?.last ?? null,
      })),
      isAdmin: await isAdmin(context),
    };
  });

export const getCustomerDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    if (await blocked(context)) return { orders: [], invoices: [] };
    const supabase = context.supabase as any;
    const [{ data: orders }, { data: invoices }] = await Promise.all([
      supabase
        .from("orders")
        .select("id, order_number, product, product_total, created_at, order_text")
        .eq("customer_id", data.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("invoices")
        .select("id, invoice_number, total, payment_status, created_at")
        .eq("customer_id", data.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    return { orders: orders ?? [], invoices: invoices ?? [] };
  });

/* ------------------------------- invoices ------------------------------ */

export type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  customerName: string | null;
  phone: string | null;
  total: number | null;
  paymentStatus: string;
  paidAt: string | null;
  invoiceText: string;
  createdBy: string | null;
  createdAt: string;
};

export const saveInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        invoiceText: z.string().trim().min(5).max(20000),
        phone: z.string().trim().max(30).optional(),
        paymentMethod: z.enum(["COD", "CC"]).optional(),
        codAmount: z.number().nonnegative().max(100000000).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (await blocked(context)) throw new Error("Access is blocked");
    const supabase = context.supabase as any;

    const { data: dup } = await supabase
      .from("invoices")
      .select("id, invoice_number")
      .eq("invoice_text", data.invoiceText)
      .limit(1)
      .maybeSingle();
    if (dup) return { ok: true, id: dup.id as string, invoiceNumber: dup.invoice_number as string, duplicate: true };

    const p = parseInvoiceSummary(data.invoiceText);
    const phone = data.phone || p.phone;
    const customerId = await upsertCustomer(supabase, context.userId, {
      phone,
      name: p.customerName,
    });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: numberData, error: numberError } = await supabaseAdmin.rpc("next_invoice_number");
    if (numberError || !numberData) throw new Error("Could not generate invoice number");

    const { data: row, error } = await supabase
      .from("invoices")
      .insert({
        invoice_number: numberData as unknown as string,
        customer_name: p.customerName || null,
        phone: normalizePhone(phone) ?? (phone || null),
        total: p.total,
        payment_method: data.paymentMethod ?? null,
        cod_amount: data.paymentMethod === "COD" ? (data.codAmount ?? null) : null,
        invoice_text: data.invoiceText,
        customer_id: customerId,
        created_by: context.userId,
      })
      .select("id, invoice_number")
      .maybeSingle();

    if (error) throw new Error("Could not save invoice");
    return {
      ok: true,
      id: row?.id as string,
      invoiceNumber: row?.invoice_number as string,
      duplicate: false,
    };
  });

export const listInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ search: z.string().trim().max(120).optional() }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    if (await blocked(context))
      return { invoices: [] as InvoiceRow[], names: {} as Record<string, string>, isAdmin: false };
    const supabase = context.supabase as any;

    let query = supabase
      .from("invoices")
      .select(
        "id, invoice_number, customer_name, phone, total, payment_status, paid_at, invoice_text, created_by, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(200);

    const s = data.search?.trim();
    if (s) {
      const like = `%${s.replace(/[%,]/g, "")}%`;
      query = query.or(
        `invoice_number.ilike.${like},customer_name.ilike.${like},phone.ilike.${like}`,
      );
    }

    const { data: rows, error } = await query;
    if (error) {
      console.error("listInvoices failed", error);
      throw new Error(`Could not load invoices: ${error.message ?? "unknown"}`);
    }

    const names = await profileNames(supabase, (rows ?? []).map((r: any) => r.created_by));

    return {
      invoices: (rows ?? []).map((r: any): InvoiceRow => ({
        id: r.id,
        invoiceNumber: r.invoice_number,
        customerName: r.customer_name,
        phone: r.phone,
        total: r.total == null ? null : Number(r.total),
        paymentStatus: r.payment_status,
        paidAt: r.paid_at,
        invoiceText: r.invoice_text,
        createdBy: r.created_by,
        createdAt: r.created_at,
      })),
      names,
      isAdmin: await isAdmin(context),
    };
  });

export const setInvoiceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({ id: z.string().uuid(), status: z.enum(["unpaid", "partial", "paid"]) })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (await blocked(context)) throw new Error("Access is blocked");
    const supabase = context.supabase as any;
    const { error } = await supabase
      .from("invoices")
      .update({
        payment_status: data.status,
        paid_at: data.status === "paid" ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) throw new Error("Could not update status");
    return { ok: true };
  });

export const deleteInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as any;
    const { error } = await supabase.from("invoices").delete().eq("id", data.id);
    if (error) throw new Error("Could not delete (admin only)");
    return { ok: true };
  });
