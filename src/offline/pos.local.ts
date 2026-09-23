import { commit, db, nextInvoiceNumberOffline, now, uid } from "./store";

type Input = {
  customerName?: string;
  phone?: string;
  total: number;
  paid: number;
  payMode: "Cash" | "Card" | "Udhaar";
  status: "paid" | "partial" | "unpaid";
  invoiceText: string;
  stock: { name: string; qty: number }[];
};

export async function savePosSale(arg: { data: Input }) {
  const data = arg.data;
  const d = db();
  const invoiceNumber = nextInvoiceNumberOffline();
  const phone = (data.phone ?? "").replace(/\D/g, "");
  let customerId: string | null = null;
  if (phone.length >= 10) {
    let c = d.customers.find((x) => x.phone === phone);
    if (!c) {
      c = { id: uid(), phone, name: data.customerName || null, city: null, address: null, created_at: now() };
      d.customers.unshift(c);
    }
    customerId = c.id;
  }
  const id = uid();
  d.invoices.unshift({
    id,
    invoice_number: invoiceNumber,
    customer_name: data.customerName || "Walk-in",
    phone: phone || null,
    total: data.total,
    payment_status: data.status,
    paid_at: data.status === "paid" ? now() : null,
    payment_method: `POS-${data.payMode}`,
    cod_amount: data.status === "paid" ? null : Math.max(0, data.total - data.paid),
    invoice_text: data.invoiceText.replaceAll("{{INVOICE}}", invoiceNumber),
    customer_id: customerId,
    created_at: now(),
  });
  for (const s of data.stock) {
    const p = d.products.find((x) => x.name === s.name);
    if (p) p.stock = Number(p.stock ?? 0) - s.qty;
  }
  commit();
  return { ok: true, id, invoiceNumber };
}
