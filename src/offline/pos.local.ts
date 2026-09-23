import { commit, db, nextInvoiceNumberOffline, now, uid } from "./store";

type Doc = {
  docType: "sale" | "quotation" | "held" | "return";
  customerName?: string;
  phone?: string;
  total: number;
  notes?: string;
  convertFromId?: string;
  methodLabel?: string;
  invoiceText?: string;
  payments: { method: string; amount: number }[];
  items: { name: string; stockQty: number }[];
  ui?: unknown;
};

type LocalDoc = { id: string; doc_type: string; doc_number: string; customer_name: string | null; customer_phone: string | null; grand_total: number; created_at: string; payload: unknown; status: string };
const KEY = "hbchem-offline-posdocs:v1";
const load = (): LocalDoc[] => {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
};
const store = (d: LocalDoc[]) => { try { localStorage.setItem(KEY, JSON.stringify(d.slice(0, 500))); } catch { /* ignore */ } };

export async function savePosDoc(arg: { data: Doc }) {
  const data = arg.data;
  const d = db();
  const phone = (data.phone ?? "").replace(/\D/g, "");
  const docs = load();
  if (data.convertFromId) docs.forEach((x) => { if (x.id === data.convertFromId) x.status = "converted"; });
  const id = uid();
  let number = data.docType === "quotation" ? `QT-${Date.now().toString().slice(-6)}` : data.docType === "held" ? `HOLD-${Date.now().toString().slice(-6)}` : data.docType === "return" ? `SR-${Date.now().toString().slice(-6)}` : "";
  const paid = data.payments.filter((p) => p.method !== "Credit").reduce((s, p) => s + p.amount, 0);
  const status = paid >= data.total ? "paid" : paid > 0 ? "partial" : "unpaid";
  if (data.docType === "sale") {
    number = nextInvoiceNumberOffline();
    let customerId: string | null = null;
    if (phone.length >= 10) {
      let c = d.customers.find((x) => x.phone === phone);
      if (!c) { c = { id: uid(), phone, name: data.customerName || null, city: null, address: null, created_at: now() }; d.customers.unshift(c); }
      customerId = c.id;
    }
    d.invoices.unshift({
      id, invoice_number: number, customer_name: data.customerName || "Walk-in", phone: phone || null, total: data.total,
      payment_status: status, paid_at: status === "paid" ? now() : null, payment_method: `POS-${data.methodLabel ?? "Cash"}`,
      cod_amount: status === "paid" ? null : Math.max(0, data.total - paid), invoice_text: (data.invoiceText ?? "").replaceAll("{{INVOICE}}", number),
      customer_id: customerId, created_at: now(),
    });
  }
  const sign = data.docType === "sale" ? -1 : data.docType === "return" ? 1 : 0;
  if (sign) for (const s of data.items) { const p = d.products.find((x) => x.name === s.name); if (p) p.stock = Number(p.stock ?? 0) + sign * s.stockQty; }
  commit();
  docs.unshift({ id, doc_type: data.docType, doc_number: number, customer_name: data.customerName || "Walk-in", customer_phone: phone || null, grand_total: data.total, created_at: now(), payload: data.ui ?? null, status: data.docType === "held" ? "draft" : "completed" });
  store(docs);
  return { ok: true, id, invoiceNumber: number, paymentStatus: status };
}
export const savePosSale = savePosDoc;

export async function listPosDocs(arg: { data: { docType: string } }) {
  return { docs: load().filter((x) => x.doc_type === arg.data.docType && (arg.data.docType === "sale" || x.status !== "converted")).slice(0, 50) };
}
export async function closePosDoc(arg: { data: { id: string } }) {
  const docs = load();
  docs.forEach((x) => { if (x.id === arg.data.id) x.status = "converted"; });
  store(docs);
  return { ok: true };
}
export async function getCustomerBalance(_arg: { data: { phone: string } }) {
  return { found: false, balance: 0, creditLimit: null as number | null, customerId: null as string | null };
}
