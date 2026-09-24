/**
 * Print dispatch: printer resolve -> (desktop app silent print) ya (browser print window).
 * Browser JavaScript OS printers ko na dekh sakta hai na chun sakta hai — is liye web par
 * browser ka print dialog khulta hai (sahi paper size ke saath). Desktop app (Electron) me
 * `window.hbPrint` bridge asli Windows printers list aur silent print karta hai.
 */
import type { DocKind, PaperFormat, PrinterCfg, PrinterRole, ResolvedCfg } from "@/lib/pos-config";
import { renderPrint, type PrintDoc } from "./render";

export type BridgePrinter = { name: string; displayName: string; description?: string; isDefault: boolean; status: number };
type Bridge = {
  getPrinters: () => Promise<BridgePrinter[]>;
  print: (o: { html: string; deviceName?: string; widthMm: number; heightMm: number | null; copies: number; silent: boolean }) => Promise<{ ok: boolean; error?: string }>;
};

export function printBridge(): Bridge | null {
  if (typeof window === "undefined") return null;
  return ((window as unknown as { hbPrint?: Bridge }).hbPrint) ?? null;
}

const ROLE_FOR_KIND: Record<DocKind, PrinterRole> = {
  pos: "pos", sale: "sales", quotation: "sales", return: "sales", purchase: "sales", purchase_return: "sales",
  statement: "report", receipt: "pos", expense: "pos", report: "report",
};
const ROLE_FOR_FORMAT: Record<PaperFormat, PrinterRole | null> = { a4: "a4", a5: "a5", t58: "thermal", t80: "thermal", custom: null };

/** Document + format ke liye saved printer: pehle format-role (A4/A5/thermal), phir document-role. */
export function resolvePrinter(cfg: ResolvedCfg, kind: DocKind, format: PaperFormat): PrinterCfg | null {
  const d = cfg.printerDefaults;
  const byId = (id?: string) => (id ? cfg.printers.find((p) => p.id === id) ?? null : null);
  const fr = ROLE_FOR_FORMAT[format];
  const docP = byId(d[ROLE_FOR_KIND[kind]]);
  if (docP && docP.paper === format) return docP;
  return (fr ? byId(d[fr]) : null) ?? docP ?? cfg.printers.find((p) => p.paper === format) ?? null;
}

function browserPrint(html: string) {
  return new Promise<void>((resolve) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
    document.body.appendChild(frame);
    const d = frame.contentWindow!.document;
    d.open(); d.write(html); d.close();
    const go = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      setTimeout(() => frame.remove(), 60000);
      resolve();
    };
    const imgs = Array.from(d.images);
    if (!imgs.length) setTimeout(go, 200);
    else Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; })))).then(() => setTimeout(go, 100));
  });
}

export type PrintResult = { via: "desktop" | "browser"; printer?: string; error?: string };

export async function printDocument(doc: PrintDoc, cfg: ResolvedCfg, o: { format?: PaperFormat; copies?: number; template?: import("@/lib/pos-config").TemplateId } = {}): Promise<PrintResult> {
  const format = o.format ?? cfg.printing.defaults[doc.kind];
  const printer = resolvePrinter(cfg, doc.kind, format);
  const copies = Math.max(1, Math.round(o.copies ?? printer?.copies ?? cfg.printing.layout.copies ?? 1));
  const bridge = printBridge();
  if (bridge && printer?.deviceName) {
    const { html, spec } = await renderPrint(doc, cfg, { format, template: o.template, copies: 1 });
    const r = await bridge.print({ html, deviceName: printer.deviceName, widthMm: spec.widthMm, heightMm: spec.heightMm, copies, silent: true }).catch((e: unknown) => ({ ok: false, error: String(e) }));
    if (r.ok) return { via: "desktop", printer: printer.name };
    // silent print fail -> browser dialog fallback, error report
    const fb = await renderPrint(doc, cfg, { format, template: o.template, copies });
    await browserPrint(fb.html);
    return { via: "browser", printer: printer.name, error: r.error || "The printer did not respond" };
  }
  const { html } = await renderPrint(doc, cfg, { format, template: o.template, copies });
  await browserPrint(html);
  return { via: "browser", printer: printer?.name };
}

/** PDF: rendered HTML ko exact paper size par snapshot karke pages banata hai. */
export async function downloadPdf(doc: PrintDoc, cfg: ResolvedCfg, o: { format?: PaperFormat; template?: import("@/lib/pos-config").TemplateId } = {}) {
  const format = o.format ?? cfg.printing.defaults[doc.kind];
  const { html, spec } = await renderPrint(doc, cfg, { format, template: o.template, copies: 1 });
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  const pxPerMm = 96 / 25.4;
  const frame = document.createElement("iframe");
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${Math.ceil(spec.widthMm * pxPerMm)}px;height:2000px;border:0`;
  document.body.appendChild(frame);
  try {
    const d = frame.contentWindow!.document;
    d.open(); d.write(html); d.close();
    await new Promise((r) => setTimeout(r, 250));
    await Promise.all(Array.from(d.images).map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; }))));
    const canvas = await html2canvas(d.body, { scale: 2, backgroundColor: "#ffffff", width: Math.ceil(spec.widthMm * pxPerMm), windowWidth: Math.ceil(spec.widthMm * pxPerMm) });
    const contentMm = canvas.height / 2 / pxPerMm;
    const pageH = spec.heightMm ?? Math.max(40, contentMm);
    const pdf = new jsPDF({ unit: "mm", format: [spec.widthMm, pageH], orientation: spec.widthMm > pageH ? "landscape" : "portrait" });
    const pageCanvasPx = Math.floor(pageH * pxPerMm * 2);
    let y = 0; let first = true;
    while (y < canvas.height) {
      const h = Math.min(pageCanvasPx, canvas.height - y);
      const slice = document.createElement("canvas");
      slice.width = canvas.width; slice.height = h;
      slice.getContext("2d")!.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      if (!first) pdf.addPage([spec.widthMm, pageH], spec.widthMm > pageH ? "landscape" : "portrait");
      pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, spec.widthMm, h / 2 / pxPerMm);
      first = false; y += h;
    }
    pdf.save(`${(doc.number || doc.title).replace(/[^\w.-]+/g, "_")}.pdf`);
  } finally {
    frame.remove();
  }
}
