/**
 * Central print renderer. Har paper format ka apna layout (A4, A5, 58mm, 80mm, custom) —
 * ek layout ko scale nahi kiya jata. Output: mukammal HTML document (@page ke saath).
 */
import type { ColKey, DocKind, InvoiceTextField, PaperFormat, ResolvedCfg, TemplateId } from "@/lib/pos-config";
import { formatDate, INVOICE_TEXT_FIELDS } from "@/lib/pos-config";

export type PrintLine = { name: string; sku?: string; barcode?: string; unit?: string; qty: number; rate: number; discount?: number; taxPct?: number; total: number; note?: string };
export type PrintTotal = { label: string; value: number; bold?: boolean; neg?: boolean };
export type PrintDoc = {
  kind: DocKind;
  id?: string;
  title: string;
  number: string;
  date: Date | string;
  party?: { label: string; name?: string; phone?: string; address?: string };
  lines?: PrintLine[];
  totals?: PrintTotal[];
  payments?: { method: string; amount: number }[];
  paid?: number;
  balance?: number;
  notes?: string;
  meta?: [string, string][];
  /** Statements / reports ke liye free table */
  table?: { head: string[]; rows: (string | number)[][]; align?: ("l" | "r")[] };
  currency?: string;
};

export type PageSpec = { widthMm: number; heightMm: number | null; roll: boolean };

export function pageSpec(format: PaperFormat, cfg: ResolvedCfg): PageSpec {
  switch (format) {
    case "a4": return { widthMm: 210, heightMm: 297, roll: false };
    case "a5": return cfg.printing.a5.orientation === "landscape" ? { widthMm: 210, heightMm: 148, roll: false } : { widthMm: 148, heightMm: 210, roll: false };
    case "t58": return { widthMm: 58, heightMm: null, roll: true };
    case "t80": return { widthMm: 80, heightMm: null, roll: true };
    default: {
      const w = Math.min(330, Math.max(40, Number(cfg.printing.custom.widthMm) || 100));
      const h = cfg.printing.custom.heightMm ? Math.min(600, Math.max(30, Number(cfg.printing.custom.heightMm))) : null;
      return { widthMm: w, heightMm: h, roll: h == null };
    }
  }
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function makeMoney(cfg: ResolvedCfg) {
  const d = Math.min(3, Math.max(0, cfg.decimals));
  return (n: number) => (Math.round((Number(n) || 0) * 10 ** d) / 10 ** d).toLocaleString("en-PK", { minimumFractionDigits: d > 0 ? Math.min(d, 2) : 0, maximumFractionDigits: d });
}
const qtyFmt = (n: number) => String(Math.round(n * 1000) / 1000);

type Extras = { barcodeSvg?: string; qrDataUrl?: string };

/* ------------------------------ Page layouts ------------------------------ */

const TEMPLATE_CSS: Record<TemplateId, string> = {
  modern: `.hd{border-bottom:3px solid #14305a;padding-bottom:3mm}.doc-title{color:#14305a}.items thead th{background:#14305a;color:#fff}.items tbody tr:nth-child(even) td{background:#f3f6fa}.grand td{background:#14305a;color:#fff}`,
  classic: `body{font-family:Georgia,'Times New Roman',serif}.hd{border-bottom:1.5px double #000;padding-bottom:3mm}.items,.items th,.items td{border:1px solid #444}.items thead th{background:#eee}.box{border:1px solid #444}.grand td{border-top:2px solid #000}`,
  compact: `.items td,.items th{padding:0.8mm 1.2mm}.hd{border-bottom:1px solid #000;padding-bottom:2mm}.items thead th{border-bottom:1px solid #000}.items tbody td{border-bottom:0.5px solid #bbb}.grand td{border-top:1px solid #000}`,
  minimal: `.items thead th{border-bottom:1px solid #999;font-weight:600;color:#333}.items tbody td{border-bottom:0.5px solid #e5e5e5}.box{border:0;padding:0}.grand td{border-top:1px solid #000}`,
  retail: `.hd{background:#111;color:#fff;padding:3mm;border-radius:2mm}.hd .muted{color:#ddd}.items thead th{background:#111;color:#fff}.items tbody tr:nth-child(odd) td{background:#f5f5f5}.grand td{font-size:1.35em;background:#ffe9a8}`,
  thermal: `body{font-family:'Courier New',monospace}.items thead th{border-bottom:1px dashed #000}.items tbody td{border-bottom:1px dotted #999}.grand td{border-top:1px dashed #000}`,
};

const FONT_CSS = {
  arial: "Arial,Helvetica,sans-serif", georgia: "Georgia,'Times New Roman',serif",
  times: "'Times New Roman',Times,serif", courier: "'Courier New',Courier,monospace",
  verdana: "Verdana,Geneva,sans-serif", tahoma: "Tahoma,Verdana,sans-serif",
  trebuchet: "'Trebuchet MS',Arial,sans-serif",
} as const;

function typographyCss(cfg: ResolvedCfg) {
  const family = cfg.printing.fontFamily;
  const sizes = cfg.printing.fontSizes;
  const font = family in FONT_CSS ? FONT_CSS[family as keyof typeof FONT_CSS] : null;
  return `${font ? `body,body *{font-family:${font}!important}` : ""}${(Object.keys(INVOICE_TEXT_FIELDS) as InvoiceTextField[])
    .map((key) => {
      const pt = Number(sizes[key]);
      return sizes[key] != null && Number.isFinite(pt) && pt >= 5 && pt <= 36
        ? `.fs-${key},.fs-${key} *{font-size:${pt}pt!important}` : "";
    }).join("")}`;
}

function colsFor(format: PaperFormat, cfg: ResolvedCfg): Record<ColKey, boolean> {
  return format === "a5" ? cfg.printing.a5.columns : cfg.printing.columns;
}

function pageHtml(doc: PrintDoc, format: PaperFormat, cfg: ResolvedCfg, tpl: TemplateId, ex: Extras) {
  const p = cfg.printing;
  const L = p.layout;
  const a5 = format === "a5";
  const f = p.fields;
  const m = makeMoney(cfg);
  const cur = esc(cfg.business.currencySymbol || doc.currency || "Rs");
  const font = a5 ? p.a5.fontPt : L.fontPt;
  const tableFont = a5 ? Math.max(6.5, p.a5.fontPt - 0.5) : L.tableFontPt;
  const headPt = a5 ? Math.max(11, Math.round(p.a5.fontPt * 1.6)) : L.headerPt;
  const logoMm = a5 ? p.a5.logoMm : L.logoMm;
  const mg = a5 ? { t: p.a5.marginMm, b: p.a5.marginMm, l: p.a5.marginMm, r: p.a5.marginMm } : { t: L.marginTop, b: L.marginBottom, l: L.marginLeft, r: L.marginRight };
  const cols = colsFor(format, cfg);
  const b = cfg.business;
  const date = typeof doc.date === "string" ? doc.date : formatDate(doc.date, cfg, f.dateTime);

  const logo = f.logo && b.logo ? `<img class=logo src="${esc(b.logo)}" alt="">` : "";
  const bizLines = ([ ["address", f.address && b.address], ["phone", f.phone && b.phone && `Ph: ${b.phone}`], ["email", f.email && b.email], ["website", f.website && b.website], ["taxId", f.taxId && b.taxId && `NTN/GST: ${b.taxId}`] ] as const).filter((x) => x[1]);
  const header = `<div class="hd ${L.logoAlign === "center" ? "hd-c" : L.logoAlign === "right" ? "hd-r" : ""}">
    ${logo}<div class=biz>${f.businessName ? `<div class="bizname fs-businessName">${esc(b.name || "HB Chemicals Pakistan")}</div>` : ""}${bizLines.map(([key, value]) => `<div class="muted fs-${key}">${esc(value)}</div>`).join("")}</div>
    <div class=docbox>${f.title ? `<div class="doc-title fs-title">${esc(doc.title)}</div>` : ""}${f.number ? `<div class=fs-number><b>${esc(doc.number)}</b></div>` : ""}<div class="muted fs-dateTime">${esc(date)}</div></div>
  </div>`;

  const party = doc.party && (f.customer || f.customerPhone || f.customerAddress) && (doc.party.name || doc.party.phone || doc.party.address)
    ? `<div class="box party"><div class="lbl fs-customer">${esc(doc.party.label)}</div>${f.customer && doc.party.name ? `<div class="pname fs-customer">${esc(doc.party.name)}</div>` : ""}${f.customerPhone && doc.party.phone ? `<div class=fs-customerPhone>${esc(doc.party.phone)}</div>` : ""}${f.customerAddress && doc.party.address ? `<div class=fs-customerAddress>${esc(doc.party.address)}</div>` : ""}</div>`
    : "";
  const meta = doc.meta?.length ? `<div class="box meta">${doc.meta.map(([k, v]) => `<div class=fs-meta><span class=lbl>${esc(k)}:</span> ${esc(v)}</div>`).join("")}</div>` : "";

  let body = "";
  if (doc.lines?.length) {
    const w = p.colWidths;
    const colDefs: { key: string; label: string; r?: boolean; show: boolean }[] = [
      { key: "item", label: "Item", show: true },
      { key: "sku", label: "SKU", show: cols.sku },
      { key: "barcode", label: "Barcode", show: cols.barcode },
      { key: "unit", label: "Unit", show: cols.unit },
      { key: "qty", label: "Qty", r: true, show: cols.qty },
      { key: "rate", label: "Rate", r: true, show: cols.rate },
      { key: "discount", label: "Disc", r: true, show: cols.discount && doc.lines.some((l) => l.discount) },
      { key: "tax", label: "Tax", r: true, show: cols.tax && doc.lines.some((l) => l.taxPct) },
      { key: "total", label: "Amount", r: true, show: true },
    ].filter((c) => c.show);
    const colgroup = `<colgroup><col style="width:6%">${colDefs.map((c) => `<col${(w as Record<string, number | undefined>)[c.key] ? ` style="width:${(w as Record<string, number>)[c.key]}%"` : ""}>`).join("")}</colgroup>`;
    const cell = (l: PrintLine, k: string) => {
      switch (k) {
        case "item": return `${esc(l.name)}${l.note ? `<div class=note>${esc(l.note)}</div>` : ""}`;
        case "sku": return esc(l.sku ?? "");
        case "barcode": return esc(l.barcode ?? "");
        case "unit": return esc(l.unit ?? "");
        case "qty": return qtyFmt(l.qty);
        case "rate": return m(l.rate);
        case "discount": return l.discount ? m(l.discount) : "-";
        case "tax": return l.taxPct ? `${l.taxPct}%` : "-";
        default: return m(l.total);
      }
    };
    body = `<table class=items>${colgroup}<thead><tr><th class=fs-tableHeader>#</th>${colDefs.map((c) => `<th class="fs-tableHeader${c.r ? " r" : ""}">${c.label}</th>`).join("")}</tr></thead><tbody>${doc.lines
      .map((l, i) => `<tr><td>${i + 1}</td>${colDefs.map((c) => `<td class="fs-${c.key === "total" ? "amount" : c.key}${c.r ? " r" : ""}">${cell(l, c.key)}</td>`).join("")}</tr>`)
      .join("")}</tbody></table>`;
  }
  if (doc.table) {
    const al = doc.table.align ?? [];
    body += `<table class=items><thead><tr>${doc.table.head.map((h, i) => `<th class="fs-tableHeader${al[i] === "r" ? " r" : ""}">${esc(h)}</th>`).join("")}</tr></thead><tbody>${doc.table.rows
      .map((r) => `<tr>${r.map((v, i) => `<td class="fs-${i === 0 ? "item" : "amount"}${al[i] === "r" ? " r" : ""}">${esc(typeof v === "number" ? m(v) : v)}</td>`).join("")}</tr>`)
      .join("")}</tbody></table>`;
  }

  const totalsRows = (doc.totals ?? [])
    .filter((t) => f.subtotal || !/^sub/i.test(t.label))
    .map((t) => `<tr class="${t.bold ? "grand" : ""}"><td class="fs-${t.bold ? "grandTotal" : /^sub/i.test(t.label) ? "subtotal" : "totals"}">${esc(t.label)}</td><td class="r fs-${t.bold ? "grandTotal" : /^sub/i.test(t.label) ? "subtotal" : "totals"}">${t.neg ? "- " : ""}${cur} ${m(t.value)}</td></tr>`)
    .join("");
  const payRows = [
    f.paymentMethod && doc.payments?.length ? `<tr><td class=fs-paymentMethod>Payment</td><td class="r fs-paymentMethod">${esc(doc.payments.filter((x) => x.amount > 0).map((x) => `${x.method} ${m(x.amount)}`).join(", "))}</td></tr>` : "",
    f.paid && doc.paid != null ? `<tr><td class=fs-paid>Paid</td><td class="r fs-paid">${cur} ${m(doc.paid)}</td></tr>` : "",
    f.balance && doc.balance ? `<tr class=bal><td class=fs-balance>Balance</td><td class="r fs-balance">${cur} ${m(doc.balance)}</td></tr>` : "",
  ].join("");
  const totals = totalsRows || payRows ? `<table class=totals>${totalsRows}${payRows}</table>` : "";
  const qr = ex.qrDataUrl ? `<img class=qr src="${ex.qrDataUrl}" alt="">` : "";

  const footerText = a5 ? p.a5.footer || cfg.footer : cfg.footer;
  const showSig = a5 ? p.a5.signature && f.signature : f.signature;
  const custom = customRows(cfg, false);
  const end = `<div class=end>
    <div class=endl>${custom}${f.notes && doc.notes ? `<div class=fs-notes><b>Note:</b> ${esc(doc.notes)}</div>` : ""}${f.terms && cfg.terms ? `<div class="terms fs-terms">${esc(cfg.terms)}</div>` : ""}</div>
    <div class=endr>${qr}${showSig ? `<div class="sig fs-signature">${esc(p.signatureLabel)}</div>` : ""}</div>
  </div>${f.footer && footerText ? `<div class="foot fs-footer">${esc(footerText)}</div>` : ""}`;

  const css = `
  *{box-sizing:border-box}html,body{margin:0;padding:0}
  body{font:${font}pt/${L.lineHeight} Arial,Helvetica,sans-serif;color:#111;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .sheet{padding:${mg.t}mm ${mg.r}mm ${mg.b}mm ${mg.l}mm}
  .hd{display:flex;gap:4mm;align-items:flex-start;justify-content:space-between;margin-bottom:${a5 ? 2.5 : 4}mm}
  .hd-c{flex-direction:column;align-items:center;text-align:center}.hd-r{flex-direction:row-reverse}
  .logo{height:${logoMm}mm;max-width:${logoMm * 2.5}mm;object-fit:contain}
  .biz{flex:1;min-width:0}.bizname{font-size:${headPt}pt;font-weight:800;line-height:1.1;overflow-wrap:anywhere}
  .docbox{text-align:right;min-width:${a5 ? 30 : 45}mm}.hd-c .docbox{text-align:center}
  .doc-title{font-size:${Math.round(headPt * 0.75)}pt;font-weight:800;text-transform:uppercase;letter-spacing:.5px}
  .muted{color:#555;font-size:${Math.max(6.5, font - 1)}pt;overflow-wrap:anywhere}
  .row2{display:flex;gap:${a5 ? 2 : 4}mm;margin-bottom:${a5 ? 2 : 3.5}mm}.row2>.box{flex:1}
  .box{border:0.6px solid #bbb;border-radius:1.5mm;padding:${a5 ? 1.5 : 2.5}mm}.lbl{font-size:${Math.max(6, font - 1.5)}pt;color:#666;text-transform:uppercase}.pname{font-weight:700}
  table{width:100%;border-collapse:collapse}
  .items{font-size:${tableFont}pt;table-layout:auto;margin-bottom:${a5 ? 2 : 3}mm}
  .items th,.items td{padding:${a5 ? "0.9mm 1mm" : "1.5mm 2mm"};text-align:left;vertical-align:top;overflow-wrap:anywhere}
  .items thead{display:table-header-group}.items tr{page-break-inside:avoid;break-inside:avoid}
  .r{text-align:right!important;white-space:nowrap}.note{color:#666;font-size:.9em}
  .totals{width:${a5 ? "60%" : "45%"};margin-left:auto;page-break-inside:avoid}.totals td{padding:${a5 ? 0.6 : 1.1}mm 2mm}
  .grand td{font-weight:800;font-size:1.15em}.bal td{font-weight:700;color:#a40000}
  .end{display:flex;gap:4mm;margin-top:${a5 ? 2.5 : 5}mm;page-break-inside:avoid}.endl{flex:1;font-size:${Math.max(6.5, font - 0.5)}pt}.terms{white-space:pre-wrap;color:#444;margin-top:1mm}
  .endr{text-align:center}.qr{width:${a5 ? 16 : 22}mm;height:${a5 ? 16 : 22}mm}
  .sig{margin-top:${a5 ? 8 : 14}mm;border-top:0.8px solid #000;padding-top:1mm;min-width:${a5 ? 32 : 50}mm;font-size:${Math.max(6.5, font - 1)}pt}
  .foot{text-align:center;margin-top:${a5 ? 2 : 4}mm;font-size:${a5 ? Math.max(6.5, font - 1) : L.footerPt}pt;color:#444;border-top:0.5px solid #ccc;padding-top:1.5mm}
  .copy{page-break-after:always;break-after:page}.copy:last-child{page-break-after:auto;break-after:auto}
   ${TEMPLATE_CSS[tpl]}${typographyCss(cfg)}`;
  const inner = `${header}${party || meta ? `<div class=row2>${party}${meta}</div>` : ""}${body}${totals}${end}`;
  return { css, inner };
}

/* ----------------------------- Thermal layout ----------------------------- */

function thermalHtml(doc: PrintDoc, format: PaperFormat, cfg: ResolvedCfg, ex: Extras, widthMm: number) {
  const t = cfg.printing.thermal;
  const f = cfg.printing.fields;
  const m = makeMoney(cfg);
  const cur = esc(cfg.business.currencySymbol || doc.currency || "Rs");
  const narrow = widthMm < 70;
  const font = narrow ? Math.min(t.fontPt, 8) : t.fontPt;
  const b = cfg.business;
  const date = typeof doc.date === "string" ? doc.date : formatDate(doc.date, cfg, f.dateTime);
  const kv = (a: string, v: string, cls = "", field?: InvoiceTextField) => `<div class="kv ${cls} ${field ? `fs-${field}` : ""}"><span>${a}</span><span>${v}</span></div>`;
  const lines = (doc.lines ?? [])
    .map((l, i) => `<div class=it><div class="nm fs-item">${i + 1}. ${esc(l.name)}${l.unit && !narrow ? ` <small class=fs-unit>${esc(l.unit)}</small>` : ""}</div><div class=kv><span><span class=fs-qty>${t.showQtyRate ? qtyFmt(l.qty) : `x${qtyFmt(l.qty)}`}</span>${t.showQtyRate ? ` × <span class=fs-rate>${m(l.rate)}</span>${l.discount ? ` <span class=fs-discount>-${m(l.discount)}</span>` : ""}${l.taxPct ? ` <span class=fs-tax>+${l.taxPct}%</span>` : ""}` : ""}</span><span class=fs-amount>${m(l.total)}</span></div>${l.note ? `<div class="note fs-notes">${esc(l.note)}</div>` : ""}</div>`)
    .join("");
  const table = doc.table ? doc.table.rows.map((r) => `<div class=it>${r.map((v, i) => (i === 0 ? `<div class="nm fs-item">${esc(v)}</div>` : "")).join("")}${kv(doc.table!.head.slice(1).map((h, i) => `${h}: ${typeof r[i + 1] === "number" ? m(r[i + 1] as number) : esc(r[i + 1])}`).join(" · "), "", "", "amount")}</div>`).join("") : "";
  const totals = (doc.totals ?? []).map((x) => kv(esc(x.label), `${x.neg ? "-" : ""}${cur} ${m(x.value)}`, x.bold && t.boldTotal ? "grand" : "", x.bold ? "grandTotal" : /^sub/i.test(x.label) ? "subtotal" : "totals")).join("");
  const pays = [
    f.paymentMethod && doc.payments?.length ? kv("Payment", esc(doc.payments.filter((x) => x.amount > 0).map((x) => `${x.method} ${m(x.amount)}`).join(", ")), "", "paymentMethod") : "",
    f.paid && doc.paid != null ? kv("Paid", `${cur} ${m(doc.paid)}`, "", "paid") : "",
    f.balance && doc.balance ? kv("Balance", `${cur} ${m(doc.balance)}`, "grand", "balance") : "",
  ].join("");
  const footer = t.footer || cfg.footer;
  const css = `
  *{box-sizing:border-box}html,body{margin:0;padding:0}
  body{width:${widthMm}mm;font:${font}pt/1.3 Arial,Helvetica,sans-serif;color:#000}
  .sheet{padding:${t.marginMm}mm}
  .c{text-align:center}.bn{font-size:${font + (narrow ? 3 : 4)}pt;font-weight:800;line-height:1.1;overflow-wrap:anywhere}
  .logo{max-height:${narrow ? 12 : 16}mm;max-width:80%;display:block;margin:0 auto 1mm}
  hr{border:0;border-top:1px dashed #000;margin:1.5mm 0}
  .kv{display:flex;justify-content:space-between;gap:2mm}.kv span:first-child{overflow-wrap:anywhere}.kv span:last-child{white-space:nowrap;text-align:right}
  .it{padding:0.6mm 0;border-bottom:1px dotted #aaa}.nm{font-weight:600;overflow-wrap:anywhere;word-break:break-word}.note{font-size:${font - 1}pt}
  small{font-size:${font - 1}pt}.grand{font-weight:800;font-size:${font + 2}pt}
  .code{text-align:center;margin-top:1.5mm}.code svg{max-width:100%;height:${narrow ? 10 : 12}mm}.code img{width:${narrow ? 22 : 28}mm}
  .feed{height:${Math.max(0, t.feedLines) * font * 0.5}mm}
   .copy{page-break-after:always;break-after:page}.copy:last-child{page-break-after:auto}
   ${typographyCss(cfg)}`;
   const inner = `<div class=c>${f.logo && b.logo ? `<img class=logo src="${esc(b.logo)}" alt="">` : ""}${f.businessName ? `<div class="bn fs-businessName">${esc(b.name || "HB Chemicals Pakistan")}</div>` : ""}
    ${f.address && b.address ? `<div class=fs-address>${esc(b.address)}</div>` : ""}${f.phone && b.phone ? `<div class=fs-phone>${esc(b.phone)}</div>` : ""}${f.email && b.email ? `<div class=fs-email>${esc(b.email)}</div>` : ""}${f.website && b.website ? `<div class=fs-website>${esc(b.website)}</div>` : ""}${f.taxId && b.taxId ? `<div class=fs-taxId>NTN/GST: ${esc(b.taxId)}</div>` : ""}
    ${f.title ? `<div class=fs-title><b>${esc(doc.title)}</b></div>` : ""}</div><hr>
    ${f.number ? kv("No.", esc(doc.number), "", "number") : ""}${kv("Date", esc(date), "", "dateTime")}
    ${t.showCustomer && doc.party?.name && f.customer ? kv(esc(doc.party.label), esc(doc.party.name), "", "customer") : ""}${t.showCustomer && doc.party?.phone && f.customerPhone ? kv("Phone", esc(doc.party.phone), "", "customerPhone") : ""}${t.showCustomer && doc.party?.address && f.customerAddress ? kv("Address", esc(doc.party.address), "", "customerAddress") : ""}
    ${(doc.meta ?? []).map(([k, v]) => kv(esc(k), esc(v), "", "meta")).join("")}${customRows(cfg, true)}<hr>
    ${lines}${table}${totals || pays ? `<hr>${totals}${pays}` : ""}
    ${f.notes && doc.notes ? `<hr><div class=fs-notes>Note: ${esc(doc.notes)}</div>` : ""}${f.terms && cfg.terms ? `<div class=fs-terms><small>${esc(cfg.terms)}</small></div>` : ""}
    ${ex.barcodeSvg ? `<div class=code>${ex.barcodeSvg}</div>` : ""}${ex.qrDataUrl ? `<div class=code><img src="${ex.qrDataUrl}" alt=""></div>` : ""}
    ${f.footer && footer ? `<hr><div class="c fs-footer">${esc(footer)}</div>` : ""}<div class=feed></div>`;
  return { css, inner };
}

/* -------------------------------- Builder -------------------------------- */

async function extrasFor(doc: PrintDoc, format: PaperFormat, cfg: ResolvedCfg): Promise<Extras> {
  const ex: Extras = {};
  const thermal = format === "t58" || format === "t80";
  const t = cfg.printing.thermal;
  if (typeof document === "undefined") return ex;
  if (thermal && t.showBarcode && doc.number) {
    try {
      const { default: JsBarcode } = await import("jsbarcode");
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      JsBarcode(svg, doc.number, { format: "CODE128", displayValue: true, margin: 0, height: 40, fontSize: 12 });
      ex.barcodeSvg = svg.outerHTML;
    } catch { /* invalid barcode chars — skip */ }
  }
  if (thermal && t.showQr) {
    try {
      const QR = await import("qrcode");
      ex.qrDataUrl = await QR.toDataURL(`${cfg.business.name || "Invoice"} | ${doc.title} ${doc.number} | Total ${doc.totals?.find((x) => x.bold)?.value ?? ""}`, { margin: 0, width: 180 });
    } catch { /* ignore */ }
  }
  return ex;
}

export type RenderOpts = { format: PaperFormat; template?: TemplateId; copies?: number };

export async function renderPrint(doc: PrintDoc, cfg: ResolvedCfg, o: RenderOpts) {
  const spec = pageSpec(o.format, cfg);
  const tpl = o.template ?? cfg.printing.templates[o.format];
  const thermalLike = o.format === "t58" || o.format === "t80" || (o.format === "custom" && spec.widthMm < 100);
  const ex = await extrasFor(doc, o.format, cfg);
  const { css, inner } = thermalLike ? thermalHtml(doc, o.format, cfg, ex, spec.widthMm) : pageHtml(doc, o.format, cfg, tpl, ex);
  const copies = Math.min(10, Math.max(1, Math.round(o.copies ?? 1)));
  const sheets = Array.from({ length: copies }, (_, i) => `<div class="copy sheet">${copies > 1 && i > 0 ? `<div style="text-align:right;font-size:7pt;color:#666">Copy ${i + 1}</div>` : ""}${inner}</div>`).join("");
  const pageCss = `@page{size:${spec.widthMm}mm ${spec.heightMm ? `${spec.heightMm}mm` : "auto"};margin:0}body{width:${spec.widthMm}mm}`;
  const html = `<!doctype html><html><head><meta charset=utf-8><title>${esc(doc.title)} ${esc(doc.number)}</title><style>${css}${pageCss}</style></head><body>${sheets}</body></html>`;
  return { html, spec };
}

function customRows(cfg: { printing: { customFields?: { label: string; value: string; show?: boolean; sizePt?: number }[] } }, thermal: boolean): string {
  return (cfg.printing.customFields ?? [])
    .filter((c) => c.show !== false && (c.label?.trim() || c.value?.trim()))
    .map((c) => {
      const sz = c.sizePt && c.sizePt >= 5 && c.sizePt <= 36 ? ` style="font-size:${c.sizePt}pt!important"` : "";
      const lab = c.label?.trim() ? `<b>${esc(c.label.trim())}:</b> ` : "";
      return thermal
        ? `<div class="fs-custom"${sz}>${lab}${esc(c.value ?? "")}</div>`
        : `<div class="fs-custom"${sz} style="margin-bottom:1mm">${lab}${esc(c.value ?? "")}</div>`;
    }).join("");
}
