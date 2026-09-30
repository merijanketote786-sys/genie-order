import { normalizePhone, parseInvoiceSummary, parseOrderText } from "@/lib/record-parse";
import type { CustomerRow, InvoiceRow, OrderRow } from "@/lib/records.functions";
import { commit, db, matches, nextInvoiceNumberOffline, now, uid } from "./store";

type Arg<T> = { data: T } | undefined;

function upsertCustomer(input: { phone: string; name?: string; city?: string; address?: string }) {
  const phone = normalizePhone(input.phone);
  if (!phone) return null;
  const d = db();
  const existing = d.customers.find((c) => c.phone === phone);
  if (existing) {
    if (input.name && !existing.name) existing.name = input.name;
    if (input.city && !existing.city) existing.city = input.city;
    if (input.address && !existing.address) existing.address = input.address;
    commit();
    return existing.id;
  }
  const row = {
    id: uid(),
    phone,
    name: input.name || null,
    city: input.city || null,
    address: input.address || null,
    created_at: now(),
  };
  d.customers.push(row);
  commit();
  return row.id;
}

export async function saveOrder(arg: Arg<{ orderText: string; paymentMethod?: "COD" | "CC"; codAmount?: number }>) {
  const data = arg!.data;
  const d = db();
  const dup = d.orders.find((o) => o.order_text === data.orderText);
  if (dup) return { ok: true, id: dup.id, duplicate: true };

  const p = parseOrderText(data.orderText);
  const customerId = upsertCustomer({
    phone: p.phone,
    name: p.customerName,
    city: p.city,
    address: p.address,
  });
  const row = {
    id: uid(),
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
    created_at: now(),
  };
  d.orders.unshift(row);
  commit();
  return { ok: true, id: row.id, duplicate: false };
}

export async function listOrders(arg?: Arg<{ search?: string; limit?: number }>) {
  const data = arg?.data ?? {};
  const rows = db()
    .orders.filter((o) => matches([o.customer_name, o.phone, o.product, o.order_number, o.city], data.search))
    .slice(0, data.limit ?? 200);
  return {
    orders: rows.map(
      (r): OrderRow => ({
        id: r.id,
        orderNumber: r.order_number,
        customerName: r.customer_name,
        phone: r.phone,
        city: r.city,
        product: r.product,
        qty: r.qty,
        total: r.product_total == null ? null : Number(r.product_total),
        status: r.status,
        paymentMethod: r.payment_method ?? null,
        codAmount: r.cod_amount == null ? null : Number(r.cod_amount),
        orderText: r.order_text,
        createdBy: null,
        createdAt: r.created_at,
      }),
    ),
    names: {} as Record<string, string>,
    isAdmin: true,
  };
}

export async function deleteOrder(arg: Arg<{ id: string }>) {
  const d = db();
  d.orders = d.orders.filter((o) => o.id !== arg!.data.id);
  commit();
  return { ok: true };
}

export async function listCustomers(arg?: Arg<{ search?: string }>) {
  const d = db();
  const rows = d.customers.filter((c) => matches([c.name, c.phone, c.city, c.address], arg?.data?.search));
  return {
    customers: rows.map((r): CustomerRow => {
      const orders = d.orders.filter((o) => o.customer_id === r.id);
      return {
        id: r.id,
        phone: r.phone,
        name: r.name,
        city: r.city,
        address: r.address,
        courierServiceName: r.courier_service_name ?? null,
        goodsAddaName: r.goods_adda_name ?? null,
        orderCount: orders.length,
        totalSpent: orders.reduce((sum, o) => sum + Number(o.product_total ?? 0), 0),
        lastOrderAt: orders.map((o) => o.created_at).sort().at(-1) ?? null,
      };
    }),
    isAdmin: true,
  };
}

export async function saveParty(arg: Arg<{ name: string; phone: string; city?: string; address?: string; courierServiceName?: string; goodsAddaName?: string }>) {
  const data = arg?.data;
  if (!data?.name.trim() || !data.phone.trim()) throw new Error("Name and phone are required");
  const id = upsertCustomer(data);
  if (!id) throw new Error("Invalid phone number");
  const customer = db().customers.find((c) => c.id === id);
  if (!customer) throw new Error("Could not save party");
  customer.name = data.name.trim();
  customer.city = data.city?.trim() || null;
  customer.address = data.address?.trim() || null;
  customer.courier_service_name = data.courierServiceName?.trim() || null;
  customer.goods_adda_name = data.goodsAddaName?.trim() || null;
  commit();
  return { ok: true, customer: { id, name: customer.name, phone: customer.phone, city: customer.city, address: customer.address, courierServiceName: customer.courier_service_name, goodsAddaName: customer.goods_adda_name } };
}

export async function getCustomerDetail(arg: Arg<{ id: string }>) {
  const d = db();
  const id = arg!.data.id;
  return {
    orders: d.orders
      .filter((o) => o.customer_id === id)
      .map((o) => ({
        id: o.id,
        order_number: o.order_number,
        product: o.product,
        product_total: o.product_total,
        created_at: o.created_at,
        order_text: o.order_text,
      })),
    invoices: d.invoices
      .filter((i) => i.customer_id === id)
      .map((i) => ({
        id: i.id,
        invoice_number: i.invoice_number,
        total: i.total,
        payment_status: i.payment_status,
        created_at: i.created_at,
      })),
  };
}

export async function saveInvoice(
  arg: Arg<{ invoiceText: string; phone?: string; paymentMethod?: "COD" | "CC"; codAmount?: number }>,
) {
  const data = arg!.data;
  const d = db();
  const dup = d.invoices.find((i) => i.invoice_text === data.invoiceText);
  if (dup) return { ok: true, id: dup.id, invoiceNumber: dup.invoice_number, duplicate: true };

  const p = parseInvoiceSummary(data.invoiceText);
  const phone = data.phone || p.phone;
  const customerId = upsertCustomer({ phone, name: p.customerName });
  const row = {
    id: uid(),
    invoice_number: nextInvoiceNumberOffline(),
    customer_name: p.customerName || null,
    phone: normalizePhone(phone) ?? (phone || null),
    total: p.total,
    payment_status: "unpaid",
    paid_at: null,
    payment_method: data.paymentMethod ?? null,
    cod_amount: data.paymentMethod === "COD" ? (data.codAmount ?? null) : null,
    invoice_text: data.invoiceText,
    customer_id: customerId,
    created_at: now(),
  };
  d.invoices.unshift(row);
  commit();
  return { ok: true, id: row.id, invoiceNumber: row.invoice_number, duplicate: false };
}

export async function listInvoices(arg?: Arg<{ search?: string }>) {
  const rows = db().invoices.filter((i) =>
    matches([i.invoice_number, i.customer_name, i.phone], arg?.data?.search),
  );
  return {
    invoices: rows.map(
      (r): InvoiceRow => ({
        id: r.id,
        invoiceNumber: r.invoice_number,
        customerName: r.customer_name,
        phone: r.phone,
        total: r.total == null ? null : Number(r.total),
        paymentStatus: r.payment_status,
        paidAt: r.paid_at,
        invoiceText: r.invoice_text,
        createdBy: null,
        createdAt: r.created_at,
      }),
    ),
    names: {} as Record<string, string>,
    isAdmin: true,
  };
}

export async function setInvoiceStatus(arg: Arg<{ id: string; status: "unpaid" | "partial" | "paid" }>) {
  const row = db().invoices.find((i) => i.id === arg!.data.id);
  if (row) {
    row.payment_status = arg!.data.status;
    row.paid_at = arg!.data.status === "paid" ? now() : null;
    commit();
  }
  return { ok: true };
}

export async function deleteInvoice(arg: Arg<{ id: string }>) {
  const d = db();
  d.invoices = d.invoices.filter((i) => i.id !== arg!.data.id);
  commit();
  return { ok: true };
}

export type { CustomerRow, InvoiceRow, OrderRow };
