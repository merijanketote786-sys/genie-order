/** POS helpers — client-safe (online + offline dono me). */
import type { DbProduct } from "@/lib/products.functions";

export type RateType = "sale" | "p100" | "p250" | "p500";
export const RATE_TYPES: { id: RateType; label: string; packGrams: number | null }[] = [
  { id: "sale", label: "Sale price", packGrams: null },
  { id: "p100", label: "Staff 100g", packGrams: 100 },
  { id: "p250", label: "Staff 250g", packGrams: 250 },
  { id: "p500", label: "Staff 500g", packGrams: 500 },
];

export type PayMode = "Cash" | "Card" | "Udhaar";

export type CartLine = {
  key: string;
  name: string;
  unit: string;
  unitOverride?: string; // manually likha gaya unit — receipt/invoice me yehi chhapta hai
  rateType: RateType;
  price: number;
  qty: number;
  discount: number; // per line, amount
};

export function priceFor(p: DbProduct, rate: RateType): number | null {
  return rate === "sale" ? p.sale : rate === "p100" ? p.p100 : rate === "p250" ? p.p250 : p.p500;
}

export function packLabel(line: Pick<CartLine, "rateType" | "unit" | "unitOverride">) {
  const manual = line.unitOverride?.trim();
  if (manual) return manual;
  const r = RATE_TYPES.find((x) => x.id === line.rateType);
  return r?.packGrams ? `${r.packGrams}gram` : line.unit || "unit";
}

/** Stock units me kitna kam ho (kg/litre unit me gram packs ko 1000 se divide). */
export function stockDeduction(line: Pick<CartLine, "rateType" | "unit" | "qty">) {
  const r = RATE_TYPES.find((x) => x.id === line.rateType);
  if (!r?.packGrams) return line.qty;
  const u = line.unit.toLowerCase();
  if (/kg|kilo|ltr|litre|liter|^l$/.test(u)) return (line.qty * r.packGrams) / 1000;
  return line.qty;
}

export const lineTotal = (l: CartLine) => Math.max(0, l.price * l.qty - (l.discount || 0));

export function totals(lines: CartLine[], billDiscount: number, delivery: number) {
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const total = Math.max(0, subtotal - (billDiscount || 0) + (delivery || 0));
  return { subtotal, total };
}

export const money = (n: number) => Math.round(n).toLocaleString("en-PK");

export type ReceiptInput = {
  business: string;
  phone?: string;
  address?: string;
  invoiceNumber: string;
  date: string;
  customerName?: string;
  customerPhone?: string;
  lines: CartLine[];
  billDiscount: number;
  delivery: number;
  payMode: PayMode;
  paid: number;
  currency: string;
};

/** Plain text invoice — record + WhatsApp ke liye. */
export function receiptText(r: ReceiptInput) {
  const { subtotal, total } = totals(r.lines, r.billDiscount, r.delivery);
  const out: string[] = [];
  out.push(`*${r.business || "Invoice"}*`, `Invoice: ${r.invoiceNumber}`, `Date: ${r.date}`);
  if (r.customerName) out.push(`Customer: ${r.customerName}`);
  if (r.customerPhone) out.push(`Phone: ${r.customerPhone}`);
  out.push("");
  r.lines.forEach((l, i) => {
    out.push(`${i + 1}. ${l.name} ${packLabel(l)} x${l.qty} @ ${money(l.price)} = ${money(lineTotal(l))}${l.discount ? ` (disc ${money(l.discount)})` : ""}`);
  });
  out.push("", `Subtotal: ${r.currency} ${money(subtotal)}`);
  if (r.billDiscount) out.push(`Discount: ${r.currency} ${money(r.billDiscount)}`);
  if (r.delivery) out.push(`Delivery Charges: ${r.currency} ${money(r.delivery)}`);
  out.push(`Grand Total: ${r.currency} ${money(total)}`, `Payment: ${r.payMode}`);
  if (r.payMode !== "Udhaar") {
    out.push(`Paid: ${r.currency} ${money(r.paid)}`);
    if (r.paid > total) out.push(`Change: ${r.currency} ${money(r.paid - total)}`);
  }
  if (r.paid < total) out.push(`Balance: ${r.currency} ${money(total - r.paid)}`);
  return out.join("\n");
}

export function paymentStatus(total: number, paid: number, mode: PayMode): "paid" | "partial" | "unpaid" {
  if (mode === "Udhaar" && paid <= 0) return "unpaid";
  if (paid >= total) return "paid";
  return paid > 0 ? "partial" : "unpaid";
}

/* ---------------------------- Receipt printer ---------------------------- */

export type ReceiptPrinter = {
  id: string;
  name: string;
  widthMm: number; // paper width
  heightMm: number | null; // null = continuous roll (auto height)
  marginMm: number;
  fontPt: number;
};

export const PRINTER_PRESETS: ReceiptPrinter[] = [
  { id: "t80", name: "Thermal 80mm roll", widthMm: 80, heightMm: null, marginMm: 3, fontPt: 9 },
  { id: "t58", name: "Thermal 58mm roll", widthMm: 58, heightMm: null, marginMm: 2, fontPt: 8 },
  { id: "t76", name: "Dot-matrix 76mm", widthMm: 76, heightMm: null, marginMm: 3, fontPt: 9 },
  { id: "a4", name: "A4 (210x297)", widthMm: 210, heightMm: 297, marginMm: 12, fontPt: 11 },
  { id: "a5", name: "A5 (148x210)", widthMm: 148, heightMm: 210, marginMm: 8, fontPt: 10 },
  { id: "letter", name: "Letter (216x279)", widthMm: 216, heightMm: 279, marginMm: 12, fontPt: 11 },
  { id: "l100", name: "Label 100x150", widthMm: 100, heightMm: 150, marginMm: 3, fontPt: 9 },
];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function receiptHtml(r: ReceiptInput, p: ReceiptPrinter) {
  const { subtotal, total } = totals(r.lines, r.billDiscount, r.delivery);
  const wide = p.widthMm >= 120;
  const rows = r.lines
    .map(
      (l, i) =>
        `<tr><td>${i + 1}. ${esc(l.name)} <small>${esc(packLabel(l))}</small>${l.discount ? `<br><small>disc -${money(l.discount)}</small>` : ""}</td><td class=r>${l.qty}</td>${wide ? `<td class=r>${money(l.price)}</td>` : ""}<td class=r>${money(lineTotal(l))}</td></tr>`,
    )
    .join("");
  const line = (a: string, b: string, bold = false) => `<tr${bold ? " class=b" : ""}><td>${a}</td><td class=r>${b}</td></tr>`;
  const c = r.currency;
  return `<!doctype html><html><head><meta charset=utf-8><style>
@page{size:${p.widthMm}mm ${p.heightMm ? `${p.heightMm}mm` : "auto"};margin:0}
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{width:${p.widthMm}mm;padding:${p.marginMm}mm;font:${p.fontPt}pt/1.35 Arial,Helvetica,sans-serif;color:#000}
h1{font-size:${p.fontPt + 4}pt;margin:0;text-align:center}.c{text-align:center}.r{text-align:right;white-space:nowrap}
table{width:100%;border-collapse:collapse}td,th{padding:1mm 0;vertical-align:top}th{text-align:left;border-bottom:1px dashed #000}
.items td{border-bottom:1px dotted #999}.b td{font-weight:bold;font-size:${p.fontPt + 1}pt}hr{border:0;border-top:1px dashed #000;margin:2mm 0}small{font-size:${p.fontPt - 1}pt}
</style></head><body>
<h1>${esc(r.business || "Invoice")}</h1>
${r.address ? `<div class=c>${esc(r.address)}</div>` : ""}${r.phone ? `<div class=c>${esc(r.phone)}</div>` : ""}
<hr><table>${line("Invoice", esc(r.invoiceNumber))}${line("Date", esc(r.date))}${r.customerName ? line("Customer", esc(r.customerName)) : ""}${r.customerPhone ? line("Phone", esc(r.customerPhone)) : ""}</table><hr>
<table class=items><tr><th>Item</th><th class=r>Qty</th>${wide ? "<th class=r>Rate</th>" : ""}<th class=r>Amount</th></tr>${rows}</table><hr>
<table>${line("Subtotal", `${c} ${money(subtotal)}`)}${r.billDiscount ? line("Discount", `- ${c} ${money(r.billDiscount)}`) : ""}${r.delivery ? line("Delivery", `${c} ${money(r.delivery)}`) : ""}${line("Grand Total", `${c} ${money(total)}`, true)}${line("Payment", r.payMode)}${r.payMode !== "Udhaar" ? line("Paid", `${c} ${money(r.paid)}`) : ""}${r.paid > total ? line("Change", `${c} ${money(r.paid - total)}`) : ""}${r.paid < total ? line("Balance", `${c} ${money(total - r.paid)}`, true) : ""}</table>
<hr><div class=c>Shukriya! Dobara tashreef layein.</div></body></html>`;
}

export function printReceipt(html: string) {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentWindow!.document;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60000);
  }, 250);
}
