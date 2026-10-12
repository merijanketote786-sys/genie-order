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

/** PDF file ka naam (download/share dono ke liye). */
export function pdfFileName(doc: PrintDoc) {
  return `${(doc.number || doc.title).replace(/[^\w.-]+/g, "_")}.pdf`;
}

/**
 * Page ko image banata hai. Pehle browser ki apni text rendering (html-to-image / SVG) use hoti hai —
 * is se text bilkul print jaisa apni jagah rehta hai (html2canvas iPhone/Safari par text neeche khiska deta tha).
 * Fail ho to html2canvas fallback.
 */
async function snapshot(body: HTMLElement, widthPx: number): Promise<HTMLCanvasElement> {
  const height = Math.max(1, body.scrollHeight);
  try {
    const { toCanvas } = await import("html-to-image");
    const opts = { pixelRatio: 2, backgroundColor: "#ffffff", width: widthPx, height, canvasWidth: widthPx, canvasHeight: height, skipFonts: true, cacheBust: false };
    // Safari pehli dafa images/fonts kabhi kabhi miss karta hai — ek warm-up pass.
    await toCanvas(body, opts).catch(() => null);
    const c = await toCanvas(body, opts);
    if (c.width > 0 && c.height > 0) return c;
    throw new Error("empty canvas");
  } catch (e) {
    console.warn("Native PDF snapshot failed, using fallback:", e);
    const { default: html2canvas } = await import("html2canvas");
    return html2canvas(body, { scale: 2, backgroundColor: "#ffffff", width: widthPx, windowWidth: widthPx });
  }
}

/** PDF ko Blob banata hai (share/download dono ke liye). */
export async function buildPdfBlob(doc: PrintDoc, cfg: ResolvedCfg, o: { format?: PaperFormat; template?: import("@/lib/pos-config").TemplateId } = {}): Promise<Blob> {
  const format = o.format ?? cfg.printing.defaults[doc.kind];
  const { html, spec } = await renderPrint(doc, cfg, { format, template: o.template, copies: 1 });
  const { jsPDF } = await import("jspdf");
  const pxPerMm = 96 / 25.4;
  const frame = document.createElement("iframe");
  frame.style.cssText = `position:fixed;left:-10000px;top:0;width:${Math.ceil(spec.widthMm * pxPerMm)}px;height:2000px;border:0`;
  document.body.appendChild(frame);
  try {
    const d = frame.contentWindow!.document;
    d.open(); d.write(html); d.close();
    await new Promise((r) => setTimeout(r, 250));
    await Promise.all(Array.from(d.images).map((i) => (i.complete ? null : new Promise((r) => { i.onload = r; i.onerror = r; }))));
    const widthPx = Math.ceil(spec.widthMm * pxPerMm);
    frame.style.height = `${Math.max(400, d.body.scrollHeight + 20)}px`;
    const canvas = await snapshot(d.body, widthPx);
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const isBlankRows = (y0: number, y1: number) => {
      const step = 4;
      for (let yy = y0; yy < y1; yy += step) {
        const row = ctx.getImageData(0, yy, canvas.width, 1).data;
        for (let i = 0; i < row.length; i += 16) if (row[i] < 245 || row[i + 1] < 245 || row[i + 2] < 245) return false;
      }
      return true;
    };
    // Last row with ink -> neeche ka khaali safed hissa kaat do
    let lastInk = canvas.height;
    for (let yy = canvas.height - 1; yy >= 0; yy -= 4) {
      if (!isBlankRows(yy, yy + 1)) { lastInk = Math.min(canvas.height, yy + 24); break; }
      if (yy < 4) lastInk = 1;
    }
    const usedH = Math.max(1, lastInk);
    const contentMm = usedH / 2 / pxPerMm;
    const pageH = spec.heightMm ?? Math.max(40, contentMm);
    const pdf = new jsPDF({ unit: "mm", format: [spec.widthMm, pageH], orientation: spec.widthMm > pageH ? "landscape" : "portrait" });
    const pageCanvasPx = Math.floor(pageH * pxPerMm * 2);
    let y = 0; let first = true;
    while (y < usedH) {
      const h = Math.min(pageCanvasPx, usedH - y);
      if (!first && isBlankRows(y, y + h)) { y += h; continue; }
      const slice = document.createElement("canvas");
      slice.width = canvas.width; slice.height = h;
      slice.getContext("2d")!.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      if (!first) pdf.addPage([spec.widthMm, pageH], spec.widthMm > pageH ? "landscape" : "portrait");
      pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, spec.widthMm, h / 2 / pxPerMm);
      first = false; y += h;
    }
    return pdf.output("blob");
  } finally {
    frame.remove();
  }
}

/** PDF: rendered HTML ko exact paper size par snapshot karke pages banata hai aur download karta hai. */
export async function downloadPdf(doc: PrintDoc, cfg: ResolvedCfg, o: { format?: PaperFormat; template?: import("@/lib/pos-config").TemplateId } = {}) {
  const blob = await buildPdfBlob(doc, cfg, o);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = pdfFileName(doc);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
