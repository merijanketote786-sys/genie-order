import { money, receiptTotals, type ReceiptInput } from "./pos";

export function renderWaTemplate(body: string, r: ReceiptInput) {
  const { subtotal, taxTotal, total } = receiptTotals(r);
  const amount = (n: number) => `${r.currency} ${money(n)}`;
  const map: Record<string, string> = {
    business: r.business, invoice_number: r.invoiceNumber, date: r.date,
    customer_name: r.customerName ?? "", customer_phone: r.customerPhone ?? "",
    customer_address: r.customerAddress ?? "", city: r.customerCityArea ?? "",
    items: r.lines.map(l => `${l.name} ${l.qty}${l.unitOverride || l.unit || ""}`.trim()).join(","),
    subtotal: amount(subtotal), tax: amount(taxTotal), discount: amount(r.billDiscount || 0), delivery: amount(r.delivery || 0),
    grand_total: amount(total), paid: amount(Math.min(r.paid || 0, total)), balance: amount(Math.max(0, total - (r.paid || 0))),
    payment: String(r.payMode ?? ""), notes: r.notes ?? "",
  };
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => k in map ? map[k] : m);
}