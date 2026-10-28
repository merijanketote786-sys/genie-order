import type { InvoiceCustomField } from "./pos-config";
import type { PrintDoc, PrintTotal } from "./print/render";
import type { ReceiptInput } from "./pos";
import { roundPosAmount } from "./pos-tax";

type SavedUi = {
  customerAddress?: string; customerCityArea?: string; courierServiceName?: string; goodsAddaName?: string;
  customFields?: InvoiceCustomField[]; cart?: { taxIncl?: boolean }[]; currency?: string;
};
export type SavedSaleRow = {
  id: string; doc_number: string; doc_type: string; status: string; payment_status: string;
  customer_name: string | null; customer_phone: string | null;
  subtotal: number; discount_total: number; tax_total: number; delivery: number; grand_total: number;
  paid_total: number; balance: number; notes: string | null; created_at: string;
  payload: (SavedUi & { ui?: SavedUi }) | null;
  items: { name: string; sku: string | null; unit: string | null; qty: number; rate: number; discount: number; tax_percent: number; tax_amount?: number; line_total: number; note: string | null }[];
  payments: { method: string; amount: number; kind: string }[];
};

/** Subtotal is already net of item discounts; only the bill discount is subtracted below it. */
export function savedBillDiscount(s: SavedSaleRow) {
  return Math.max(0, roundPosAmount(Number(s.discount_total) - s.items.reduce((n, i) => n + Number(i.discount || 0), 0)));
}

export function savedSaleToDoc(s: SavedSaleRow): PrintDoc {
  const ui = s.payload?.ui ?? s.payload;
  const totals: PrintTotal[] = [{ label: "Subtotal", value: Number(s.subtotal) }];
  if (Number(s.tax_total)) totals.push({ label: "Tax", value: Number(s.tax_total) });
  const discount = savedBillDiscount(s);
  if (discount) totals.push({ label: "Bill discount", value: discount, neg: true });
  if (Number(s.delivery)) totals.push({ label: "Delivery", value: Number(s.delivery) });
  for (const f of ui?.customFields ?? []) {
    const amount = Number(String(f.value ?? "").replace(/,/g, "").trim());
    if (f.show !== false && f.addToTotal && Number.isFinite(amount) && amount > 0) totals.push({ label: f.label.trim() || "Custom charge", value: amount });
  }
  totals.push({ label: "Grand Total", value: Number(s.grand_total), bold: true });
  const quote = s.doc_type === "quotation";
  return {
    kind: quote ? "quotation" : "pos", id: s.id,
    title: s.doc_type === "return" ? "Sale Return" : quote ? "Estimate" : "Invoice",
    number: s.doc_number, date: s.created_at, currency: ui?.currency,
    party: { label: "Customer", name: s.customer_name ?? undefined, phone: s.customer_phone ?? undefined, address: [ui?.customerAddress, ui?.customerCityArea].filter(Boolean).join(", ") || undefined },
    meta: [["City / Area", ui?.customerCityArea], ["Courier service", ui?.courierServiceName], ["Goods adda", ui?.goodsAddaName]].filter((e): e is [string, string] => Boolean(e[1])),
    lines: s.items.map((i, index) => ({ name: i.name, sku: i.sku ?? undefined, unit: i.unit ?? undefined, qty: Number(i.qty), rate: Number(i.rate), discount: Number(i.discount), taxPct: Number(i.tax_percent), taxAmount: i.tax_amount == null ? undefined : Number(i.tax_amount), taxIncl: ui?.cart?.[index]?.taxIncl, total: Number(i.line_total), note: i.note ?? undefined })),
    totals, payments: quote ? undefined : s.payments.map(p => ({ method: p.method, amount: Number(p.amount) })),
    paid: quote ? undefined : Number(s.paid_total), balance: quote ? undefined : Number(s.balance), notes: s.notes ?? undefined, customFields: ui?.customFields,
  };
}

export function savedSaleToReceipt(s: SavedSaleRow, business: string, currency: string): ReceiptInput {
  const ui = s.payload?.ui ?? s.payload;
  return {
    business, invoiceNumber: s.doc_number, title: s.doc_type === "quotation" ? "Quotation" : s.doc_type === "return" ? "Sale Return" : "Invoice",
    date: s.created_at, customerName: s.customer_name ?? undefined, customerPhone: s.customer_phone ?? undefined,
    customerAddress: ui?.customerAddress, customerCityArea: ui?.customerCityArea, customFields: ui?.customFields,
    lines: s.items.map((i, index) => ({ key: String(index), name: i.name, unit: i.unit ?? "", rateType: "sale", price: Number(i.rate), qty: Number(i.qty), discount: Number(i.discount || 0), taxPercent: Number(i.tax_percent), taxIncl: ui?.cart?.[index]?.taxIncl, savedTaxAmount: i.tax_amount == null ? undefined : Number(i.tax_amount), savedLineTotal: Number(i.line_total) })),
    billDiscount: savedBillDiscount(s), delivery: Number(s.delivery), payMode: s.payments.map(p => p.method).join("+") || "Credit", paid: Number(s.paid_total),
    notes: s.notes ?? undefined, currency: ui?.currency || currency,
    savedTotals: { subtotal: Number(s.subtotal), taxTotal: Number(s.tax_total), total: Number(s.grand_total) },
  };
}