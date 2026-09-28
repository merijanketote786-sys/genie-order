/** POS helpers — client-safe (online + offline dono me). */
import type { DbProduct } from "@/lib/products.functions";
import type { InvoiceCustomField } from "@/lib/pos-config";

export type RateType = "sale" | "p100" | "p250" | "p500";
export const RATE_TYPES: { id: RateType; label: string; packGrams: number | null }[] = [
  { id: "sale", label: "Sale price", packGrams: null },
  { id: "p100", label: "Staff 100g", packGrams: 100 },
  { id: "p250", label: "Staff 250g", packGrams: 250 },
  { id: "p500", label: "Staff 500g", packGrams: 500 },
];

/** Purana 3-mode type (backward compat). */
export type PayMode = "Cash" | "Card" | "Udhaar";

export const PAY_METHODS = ["Cash", "Bank", "JazzCash", "Easypaisa", "Card", "Other", "Credit"] as const;
export type PayMethod = (typeof PAY_METHODS)[number];
export type PaymentPart = { method: PayMethod; amount: number };
export const TAX_RATES = [0, 5, 13, 16, 17, 18];

export type CartLine = {
  key: string;
  name: string;
  unit: string;
  unitOverride?: string; // manually likha gaya unit — receipt/invoice me yehi chhapta hai
  rateType: RateType;
  price: number;
  qty: number;
  discount: number; // per line, amount
  taxPercent?: number;
  /** Rate me tax shamil hai (tax-inclusive pricing) */
  taxIncl?: boolean;
  sku?: string;
  barcode?: string;
  note?: string;
  weight?: string; // sirf maloomat ke liye — Vyapar jaisi table ka WEIGHT column
  size?: string; // sirf maloomat ke liye — Vyapar jaisi table ka SIZE column
  /** Product ki normal sale rate (wholesale se wapas aane ke liye) */
  basePrice?: number;
  /** Wholesale rate aur us par lagne wali kam az kam quantity */
  wholesalePrice?: number | null;
  wholesaleMinQty?: number | null;
  /** Is se kam rate par bechna mana hai */
  minSalePrice?: number | null;
  /** Rate haath se badli gayi ho to auto wholesale band */
  priceManual?: boolean;
};

/** Quantity ke hisaab se rate: min wholesale qty par pohnchte hi wholesale rate khud lag jati hai. */
export function autoRate(line: Pick<CartLine, "qty" | "price" | "basePrice" | "wholesalePrice" | "wholesaleMinQty" | "priceManual">): number {
  if (line.priceManual) return line.price;
  const wp = line.wholesalePrice, mq = line.wholesaleMinQty;
  if (wp != null && wp > 0 && mq != null && mq > 0 && (line.qty || 0) >= mq) return wp;
  return line.basePrice ?? line.price;
}

/** Is line par wholesale rate lagi hui hai? */
export function isWholesale(line: Pick<CartLine, "qty" | "price" | "basePrice" | "wholesalePrice" | "wholesaleMinQty" | "priceManual">): boolean {
  const wp = line.wholesalePrice, mq = line.wholesaleMinQty;
  return !line.priceManual && wp != null && wp > 0 && mq != null && mq > 0 && (line.qty || 0) >= mq;
}

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

const r2 = (x: number) => Math.round(x * 100) / 100;
const grossOf = (l: CartLine) => Math.max(0, l.price * l.qty - (l.discount || 0));
/** Tax-inclusive: rate me tax shamil — tax = gross × t/(100+t). Exclusive: tax = base × t/100. */
export const lineTax = (l: CartLine) => {
  const t = l.taxPercent || 0;
  return l.taxIncl ? r2((grossOf(l) * t) / (100 + t)) : r2((grossOf(l) * t) / 100);
};
export const lineBase = (l: CartLine) => (l.taxIncl ? r2(grossOf(l) - lineTax(l)) : grossOf(l));
export const lineTotal = (l: CartLine) => (l.taxIncl ? r2(grossOf(l)) : r2(grossOf(l) + lineTax(l)));

/** billDiscount = amount (percent pehle hi amount me convert karein). */
export function customChargesTotal(fields?: InvoiceCustomField[]) {
  return r2((fields ?? []).filter((field) => field.show !== false && field.addToTotal).reduce((sum, field) => {
    const amount = Number(String(field.value ?? "").replace(/,/g, "").trim());
    return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0));
}

export function totals(lines: CartLine[], billDiscount: number, delivery: number, customCharges = 0) {
  const subtotal = r2(lines.reduce((s, l) => s + lineBase(l), 0));
  const taxTotal = r2(lines.reduce((s, l) => s + lineTax(l), 0));
  const itemDiscount = r2(lines.reduce((s, l) => s + (l.discount || 0), 0));
  const total = Math.max(0, r2(subtotal + taxTotal - (billDiscount || 0) + (delivery || 0) + (customCharges || 0)));
  return { subtotal, taxTotal, itemDiscount, total };
}

let MONEY_DP = 2;
/** Business setting "decimal places" (0–3). */
export function setMoneyDecimals(d: number) { MONEY_DP = Math.min(3, Math.max(0, Math.round(Number(d) || 0))); }
export const money = (n: number) => (Math.round(n * 10 ** MONEY_DP) / 10 ** MONEY_DP).toLocaleString("en-PK", { maximumFractionDigits: MONEY_DP });

export type ReceiptInput = {
  business: string;
  phone?: string;
  address?: string;
  invoiceNumber: string;
  title?: string; // "Invoice" | "Quotation" | "Sale Return"
  date: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerCityArea?: string;
  courierServiceName?: string;
  goodsAddaName?: string;
  lines: CartLine[];
  billDiscount: number;
  delivery: number;
  payMode: PayMode | string;
  payments?: PaymentPart[];
  paid: number;
  previousBalance?: number;
  notes?: string;
  terms?: string;
  footer?: string;
  customFields?: InvoiceCustomField[];
  currency: string;
};

const payLabel = (r: ReceiptInput) =>
  r.payments?.length ? r.payments.filter((p) => p.amount > 0).map((p) => `${p.method} ${money(p.amount)}`).join(", ") : String(r.payMode);

/** Plain text invoice — record + WhatsApp ke liye. */
export function receiptText(r: ReceiptInput) {
  const { subtotal, taxTotal, total } = totals(r.lines, r.billDiscount, r.delivery, customChargesTotal(r.customFields));
  const out: string[] = [];
  out.push(`*${r.business || "Invoice"}*`, `${r.title || "Invoice"}: ${r.invoiceNumber}`, `Date: ${r.date}`);
  if (r.customerName) out.push(`Customer: ${r.customerName}`);
  if (r.customerPhone) out.push(`Phone: ${r.customerPhone}`);
  if (r.customerAddress) out.push(`Address: ${r.customerAddress}`);
  if (r.customerCityArea) out.push(`City/Area: ${r.customerCityArea}`);
  if (r.courierServiceName) out.push(`Courier service: ${r.courierServiceName}`);
  if (r.goodsAddaName) out.push(`Goods adda: ${r.goodsAddaName}`);
  out.push("");
  r.lines.forEach((l, i) => {
    out.push(
      `${i + 1}. ${l.name} ${packLabel(l)} x${l.qty} @ ${money(l.price)} = ${money(lineTotal(l))}${l.discount ? ` (disc ${money(l.discount)})` : ""}${l.taxPercent ? ` (tax ${l.taxPercent}%)` : ""}`,
    );
    if (l.note) out.push(`   - ${l.note}`);
  });
  out.push("", `Subtotal: ${r.currency} ${money(subtotal)}`);
  if (taxTotal) out.push(`Tax: ${r.currency} ${money(taxTotal)}`);
  if (r.billDiscount) out.push(`Discount: ${r.currency} ${money(r.billDiscount)}`);
  if (r.delivery) out.push(`Delivery Charges: ${r.currency} ${money(r.delivery)}`);
  for (const field of r.customFields ?? []) {
    if (field.show !== false && field.addToTotal) {
      const amount = Number(String(field.value ?? "").replace(/,/g, "").trim());
      if (Number.isFinite(amount) && amount > 0) out.push(`${field.label.trim() || "Custom charge"}: ${r.currency} ${money(amount)}`);
    }
  }
  out.push(`Grand Total: ${r.currency} ${money(total)}`);
  if (r.title !== "Quotation") {
    out.push(`Payment: ${payLabel(r)}`, `Paid: ${r.currency} ${money(Math.min(r.paid, total))}`);
    if (r.paid > total) out.push(`Change: ${r.currency} ${money(r.paid - total)}`);
    if (r.paid < total) out.push(`Balance: ${r.currency} ${money(total - r.paid)}`);
    if (r.previousBalance) out.push(`Previous balance: ${r.currency} ${money(r.previousBalance)}`);
  }
  if (r.notes) out.push("", `Note: ${r.notes}`);
  for (const field of r.customFields ?? []) {
    if (field.show !== false && !field.addToTotal && (field.label.trim() || field.value.trim())) out.push(`${field.label.trim()}${field.label.trim() ? ": " : ""}${field.value.trim()}`);
  }
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
  { id: "t58", name: "Compact 58mm roll", widthMm: 58, heightMm: null, marginMm: 2, fontPt: 8 },
  { id: "t76", name: "Dot-matrix 76mm", widthMm: 76, heightMm: null, marginMm: 3, fontPt: 9 },
  { id: "a4", name: "A4 (210x297)", widthMm: 210, heightMm: 297, marginMm: 12, fontPt: 11 },
  { id: "a5", name: "A5 (148x210)", widthMm: 148, heightMm: 210, marginMm: 8, fontPt: 10 },
  { id: "letter", name: "Letter (216x279)", widthMm: 216, heightMm: 279, marginMm: 12, fontPt: 11 },
  { id: "l100", name: "Label 100x150", widthMm: 100, heightMm: 150, marginMm: 3, fontPt: 9 },
];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function receiptHtml(r: ReceiptInput, p: ReceiptPrinter) {
  const { subtotal, taxTotal, total } = totals(r.lines, r.billDiscount, r.delivery, customChargesTotal(r.customFields));
  const wide = p.widthMm >= 120;
  const rows = r.lines
    .map(
      (l, i) =>
        `<tr><td>${i + 1}. ${esc(l.name)} <small>${esc(packLabel(l))}</small>${l.discount ? `<br><small>disc -${money(l.discount)}</small>` : ""}${l.taxPercent ? `<br><small>tax ${l.taxPercent}%</small>` : ""}${l.note ? `<br><small>${esc(l.note)}</small>` : ""}</td><td class=r>${l.qty}</td>${wide ? `<td class=r>${money(l.price)}</td>` : ""}<td class=r>${money(lineTotal(l))}</td></tr>`,
    )
    .join("");
  const line = (a: string, b: string, bold = false) => `<tr${bold ? " class=b" : ""}><td>${a}</td><td class=r>${b}</td></tr>`;
  const c = r.currency;
  const quote = r.title === "Quotation";
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
<div class=c><b>${esc(r.title || "Invoice")}</b></div>
 <hr><table>${line("No.", esc(r.invoiceNumber))}${line("Date", esc(r.date))}${r.customerName ? line("Customer", esc(r.customerName)) : ""}${r.customerPhone ? line("Phone", esc(r.customerPhone)) : ""}${r.customerAddress ? line("Address", esc(r.customerAddress)) : ""}${r.customerCityArea ? line("City/Area", esc(r.customerCityArea)) : ""}${r.courierServiceName ? line("Courier service", esc(r.courierServiceName)) : ""}${r.goodsAddaName ? line("Goods adda", esc(r.goodsAddaName)) : ""}</table><hr>
<table class=items><tr><th>Item</th><th class=r>Qty</th>${wide ? "<th class=r>Rate</th>" : ""}<th class=r>Amount</th></tr>${rows}</table><hr>
  <table>${line("Subtotal", `${c} ${money(subtotal)}`)}${taxTotal ? line("Tax", `${c} ${money(taxTotal)}`) : ""}${r.billDiscount ? line("Discount", `- ${c} ${money(r.billDiscount)}`) : ""}${r.delivery ? line("Delivery", `${c} ${money(r.delivery)}`) : ""}${(r.customFields ?? []).filter((field) => field.show !== false && field.addToTotal).map((field) => { const amount = Number(String(field.value ?? "").replace(/,/g, "").trim()); return Number.isFinite(amount) && amount > 0 ? line(esc(field.label.trim() || "Custom charge"), `${c} ${money(amount)}`) : ""; }).join("")}${line("Grand Total", `${c} ${money(total)}`, true)}${
    quote
      ? ""
      : `${line("Payment", esc(payLabel(r)))}${line("Paid", `${c} ${money(Math.min(r.paid, total))}`)}${r.paid > total ? line("Change", `${c} ${money(r.paid - total)}`) : ""}${r.paid < total ? line("Balance", `${c} ${money(total - r.paid)}`, true) : ""}${r.previousBalance ? line("Previous balance", `${c} ${money(r.previousBalance)}`) : ""}`
  }</table>
${r.notes ? `<hr><div><small>Note: ${esc(r.notes)}</small></div>` : ""}${r.terms ? `<div><small>${esc(r.terms)}</small></div>` : ""}
<hr><div class=c>${esc(r.footer || "Thank you! Please visit again.")}</div></body></html>`;
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

/** A4 PDF download (browser-only, dynamic import). */
export async function downloadReceiptPdf(r: ReceiptInput) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const { subtotal, taxTotal, total } = totals(r.lines, r.billDiscount, r.delivery, customChargesTotal(r.customFields));
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const c = r.currency;
  doc.setFont("helvetica", "bold").setFontSize(16).text(r.business || "Invoice", 14, 18);
  doc.setFont("helvetica", "normal").setFontSize(9);
  let y = 23;
  for (const t of [r.address, r.phone].filter(Boolean) as string[]) { doc.text(t, 14, y); y += 4.5; }
  doc.setFont("helvetica", "bold").setFontSize(12).text(`${r.title || "Invoice"} ${r.invoiceNumber}`, 196, 18, { align: "right" });
  doc.setFont("helvetica", "normal").setFontSize(9).text(r.date, 196, 23, { align: "right" });
  y = Math.max(y, 30);
   if (r.customerName || r.customerPhone) { doc.text(`Customer: ${[r.customerName, r.customerPhone].filter(Boolean).join(" · ")}`, 14, y); y += 5; }
   for (const [label, value] of [["Address", r.customerAddress], ["City/Area", r.customerCityArea], ["Courier service", r.courierServiceName], ["Goods adda", r.goodsAddaName]] as const) {
     if (value) { doc.text(`${label}: ${value}`, 14, y, { maxWidth: 180 }); y += 5; }
   }
  autoTable(doc, {
    startY: y + 2,
    head: [["#", "Item", "Unit", "Qty", "Rate", "Disc", "Tax", "Total"]],
    body: r.lines.map((l, i) => [i + 1, l.name + (l.note ? `\n${l.note}` : ""), packLabel(l), l.qty, money(l.price), money(l.discount || 0), l.taxPercent ? `${l.taxPercent}%` : "-", money(lineTotal(l))]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [20, 40, 80] },
  });
  const rows: [string, string][] = [["Subtotal", `${c} ${money(subtotal)}`]];
  if (taxTotal) rows.push(["Tax", `${c} ${money(taxTotal)}`]);
  if (r.billDiscount) rows.push(["Discount", `- ${c} ${money(r.billDiscount)}`]);
  if (r.delivery) rows.push(["Delivery", `${c} ${money(r.delivery)}`]);
  for (const field of r.customFields ?? []) {
    if (field.show === false || !field.addToTotal) continue;
    const amount = Number(String(field.value ?? "").replace(/,/g, "").trim());
    if (Number.isFinite(amount) && amount > 0) rows.push([field.label.trim() || "Custom charge", `${c} ${money(amount)}`]);
  }
  rows.push(["Grand Total", `${c} ${money(total)}`]);
  if (r.title !== "Quotation") {
    rows.push(["Payment", payLabel(r)], ["Paid", `${c} ${money(Math.min(r.paid, total))}`]);
    if (r.paid < total) rows.push(["Balance", `${c} ${money(total - r.paid)}`]);
  }
  autoTable(doc, { body: rows, theme: "plain", margin: { left: 120 }, styles: { fontSize: 10 }, columnStyles: { 1: { halign: "right", fontStyle: "bold" } } });
  const endY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  if (r.notes) doc.setFontSize(9).text(`Note: ${r.notes}`, 14, endY, { maxWidth: 180 });
  if (r.terms) doc.setFontSize(8).text(r.terms, 14, endY + 8, { maxWidth: 180 });
  doc.save(`${r.invoiceNumber}.pdf`);
}

/** POS receipt -> central PrintDoc. */
export function receiptToDoc(r: ReceiptInput, o: { kind?: import("@/lib/pos-config").DocKind; id?: string; date?: Date } = {}): import("@/lib/print/render").PrintDoc {
  const { subtotal, taxTotal, total } = totals(r.lines, r.billDiscount, r.delivery, customChargesTotal(r.customFields));
  const quote = r.title === "Quotation";
  const t: import("@/lib/print/render").PrintTotal[] = [{ label: "Subtotal", value: subtotal }];
  if (taxTotal) t.push({ label: "Tax", value: taxTotal });
  if (r.billDiscount) t.push({ label: "Discount", value: r.billDiscount, neg: true });
  if (r.delivery) t.push({ label: "Delivery", value: r.delivery });
  for (const field of r.customFields ?? []) {
    if (field.show === false || !field.addToTotal) continue;
    const amount = Number(String(field.value ?? "").replace(/,/g, "").trim());
    if (Number.isFinite(amount) && amount > 0) t.push({ label: field.label.trim() || "Custom charge", value: amount });
  }
  t.push({ label: "Grand Total", value: total, bold: true });
  if (!quote && r.previousBalance) t.push({ label: "Previous balance", value: r.previousBalance });
  return {
    kind: o.kind ?? (quote ? "quotation" : "pos"),
    id: o.id,
    title: r.title || "Invoice",
    number: r.invoiceNumber,
    date: o.date ?? r.date,
    currency: r.currency,
     party: { label: "Customer", name: r.customerName, phone: r.customerPhone, address: [r.customerAddress, r.customerCityArea].filter(Boolean).join(", ") || undefined },
     meta: [["Courier service", r.courierServiceName], ["Goods adda", r.goodsAddaName]].filter((entry): entry is [string, string] => Boolean(entry[1])),
    lines: r.lines.map((l) => ({ name: l.name, sku: l.sku, barcode: l.barcode, unit: packLabel(l), qty: l.qty, rate: l.price, discount: l.discount || 0, taxPct: l.taxPercent || 0, total: lineTotal(l), note: l.note })),
    totals: t,
    payments: quote ? undefined : r.payments,
    paid: quote ? undefined : Math.min(r.paid, total),
    balance: quote ? undefined : Math.max(0, r2(total - r.paid)),
    notes: [r.notes, !quote && r.paid > total ? `Change: ${money(r.paid - total)}` : ""].filter(Boolean).join(" · ") || undefined,
    customFields: r.customFields,
  };
}
