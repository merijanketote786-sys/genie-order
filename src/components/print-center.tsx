import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { doOutput } from "@/lib/print/do";
import { usePosAccess } from "@/components/pos-access";
import { FORMAT_LABEL, TEMPLATE_LABEL, type PaperFormat, type TemplateId } from "@/lib/pos-config";
import { logPosEvent } from "@/lib/print-admin.functions";
import { downloadPdf, printBridge, printDocument, resolvePrinter } from "@/lib/print/dispatch";
import { renderPrint, type PrintDoc } from "@/lib/print/render";
import { Download, Loader2, Mail, MessageCircle, Printer, X } from "lucide-react";
import { EmailSendDialog, WhatsAppSendDialog } from "@/components/whatsapp-send";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

const PX_PER_MM = 96 / 25.4;

/**
 * Central print hook: print / preview / PDF / reprint for every document.
 * Reprint never creates a new sale — it only adds a "reprint" entry to the audit log.
 */
export function usePrintCenter() {
  const { cfg } = usePosAccess();
  const [previewDoc, setPreviewDoc] = useState<{ doc: PrintDoc; reprint: boolean; actions?: PreviewAction[] } | null>(null);

  const report = useCallback(async (doc: PrintDoc, reprint: boolean, res: { via: string; printer?: string; error?: string }) => {
    if (res.error) {
      if (cfg.notify.printErrors) toast.error(`Silent print failed on printer "${res.printer ?? ""}" — the print window has been opened. (${res.error})`);
      logPosEvent({ data: { action: "print_error", entity: doc.kind, entityId: doc.id, details: { number: doc.number, error: res.error.slice(0, 200) } } }).catch(() => null);
    }
    if (reprint) logPosEvent({ data: { action: "reprint", entity: doc.kind, entityId: doc.id, details: { number: doc.number } } }).catch(() => null);
  }, [cfg.notify.printErrors]);

  const print = useCallback(async (doc: PrintDoc, o: { reprint?: boolean; format?: PaperFormat; template?: TemplateId; copies?: number } = {}) => {
    try {
      const res = await printDocument(doc, cfg, o);
      await report(doc, !!o.reprint, res);
      if (res.via === "desktop") toast.success(`Print sent: ${res.printer}`);
    } catch (e) {
      toast.error(`Print failed: ${e instanceof Error ? e.message : "unknown"}`);
    }
  }, [cfg, report]);

  const pdf = useCallback(async (doc: PrintDoc, o: { format?: PaperFormat; template?: TemplateId } = {}) => {
    try { await downloadPdf(doc, cfg, o); } catch { toast.error("PDF could not be created. Please try again."); }
  }, [cfg]);

  const preview = useCallback((doc: PrintDoc, reprint = false, actions?: PreviewAction[]) => setPreviewDoc({ doc, reprint, actions }), []);

  /** Based on settings: auto = print directly, ask = preview, never = nothing. */
  const afterSave = useCallback((doc: PrintDoc, behaviorKey: "pos" | "sale" | "quotation" | "return" | "purchase" | "receipt") => {
    const b = cfg.printing.behavior[behaviorKey];
    if (b === "auto") void print(doc);
    else if (b === "ask") preview(doc);
  }, [cfg, print, preview]);

  const node: ReactNode = previewDoc ? (
    <PrintPreviewDialog doc={previewDoc.doc} actions={previewDoc.actions} onClose={() => setPreviewDoc(null)} onPrint={async (output, o) => { await print(output, { ...o, reprint: previewDoc.reprint }); setPreviewDoc(null); }} onPdf={(output, o) => pdf(output, o)} />
  ) : null;

  return { cfg, print, pdf, preview, afterSave, node };
}

/** Extra buttons shown in the preview footer (e.g. Edit / Cancel for a just-saved document). */
export type PreviewAction = { label: string; icon?: ReactNode; danger?: boolean; onClick: () => void };

function PrintPreviewDialog({ doc, actions, onClose, onPrint, onPdf }: { doc: PrintDoc; actions?: PreviewAction[]; onClose: () => void; onPrint: (doc: PrintDoc, o: { format: PaperFormat; template: TemplateId; copies: number }) => Promise<void>; onPdf: (doc: PrintDoc, o: { format: PaperFormat; template: TemplateId }) => Promise<void> }) {
  const { cfg } = usePosAccess();
  const [format, setFormat] = useState<PaperFormat>(cfg.printing.defaults[doc.kind]);
  const [template, setTemplate] = useState<TemplateId>(cfg.printing.templates[cfg.printing.defaults[doc.kind]]);
  const [copies, setCopies] = useState(String(cfg.printing.layout.copies || 1));
  const [html, setHtml] = useState("");
  const [spec, setSpec] = useState({ widthMm: 80, heightMm: null as number | null });
  const [busy, setBusy] = useState(false);
  const [wa, setWa] = useState(false);
  const [mail, setMail] = useState(false);
  const [includeCustomer, setIncludeCustomer] = useState(true);
  const [includeDelivery, setIncludeDelivery] = useState(true);
  const output = useMemo(() => doOutput(doc, includeCustomer, includeDelivery), [doc, includeCustomer, includeDelivery]);
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(1);
  const [frameH, setFrameH] = useState(600);

  useEffect(() => { setTemplate(cfg.printing.templates[format]); }, [format, cfg]);
  useEffect(() => {
    let live = true;
    renderPrint(output, cfg, { format, template, copies: 1 }).then((r) => { if (live) { setHtml(r.html); setSpec(r.spec); } });
    return () => { live = false; };
  }, [output, cfg, format, template]);
  useEffect(() => {
    const w = boxRef.current?.clientWidth ?? 600;
    setScale(Math.min(1, (w - 24) / (spec.widthMm * PX_PER_MM)));
  }, [spec]);

  const printer = resolvePrinter(cfg, doc.kind, format);
  const bridge = printBridge();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-2 sm:p-4" role="dialog" aria-modal="true" aria-label="Print preview">
      <div className="flex max-h-full w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <p className="mr-auto font-bold text-foreground">Preview — {doc.title} {doc.number}</p>
          <select className="h-9 rounded-md border border-border bg-background px-2 text-sm" value={format} onChange={(e) => setFormat(e.target.value as PaperFormat)} aria-label="Paper">
            {(Object.keys(FORMAT_LABEL) as PaperFormat[]).map((f) => <option key={f} value={f}>{FORMAT_LABEL[f]}</option>)}
          </select>
          <select className="h-9 rounded-md border border-border bg-background px-2 text-sm" value={template} onChange={(e) => setTemplate(e.target.value as TemplateId)} aria-label="Design">
            {(Object.keys(TEMPLATE_LABEL) as TemplateId[]).map((t) => <option key={t} value={t}>{TEMPLATE_LABEL[t]}</option>)}
          </select>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">Copies<input className="h-9 w-14 rounded-md border border-border bg-background px-2 text-sm" inputMode="numeric" value={copies} onChange={(e) => setCopies(e.target.value.replace(/\D/g, "").slice(0, 2))} aria-label="Copies" /></label>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cancel"><X /></Button>
        </div>
        {doc.title === "D-O" && <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-border px-3 py-2 text-sm text-foreground">
          <label className="flex items-center gap-2"><Switch checked={includeCustomer} onCheckedChange={setIncludeCustomer} aria-label="Print customer details" />Print customer details</label>
          <label className="flex items-center gap-2"><Switch checked={includeDelivery} onCheckedChange={setIncludeDelivery} aria-label="Print delivery method" />Print delivery method</label>
        </div>}
        <div ref={boxRef} className="min-h-0 flex-1 overflow-auto bg-muted p-3">
          <div className="mx-auto bg-background shadow-lg" style={{ width: spec.widthMm * PX_PER_MM * scale, height: (spec.heightMm ? spec.heightMm * PX_PER_MM : frameH) * scale, overflow: "hidden" }}>
            {html ? (
              <iframe
                ref={frameRef}
                title="Print preview"
                srcDoc={html}
                style={{ width: spec.widthMm * PX_PER_MM, height: spec.heightMm ? spec.heightMm * PX_PER_MM : frameH, border: 0, transform: `scale(${scale})`, transformOrigin: "0 0", background: "#fff" }}
                onLoad={() => { const h = frameRef.current?.contentDocument?.body?.scrollHeight; if (h && !spec.heightMm) setFrameH(h + 4); }}
              />
            ) : <div className="grid h-40 place-items-center"><Loader2 className="animate-spin" /></div>}
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {FORMAT_LABEL[format]} · {spec.widthMm}×{spec.heightMm ?? "auto"} mm · {spec.heightMm ? "if content overflows the page, a new page will be created" : "roll — length based on content"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border p-3">
          <p className="mr-auto text-xs text-muted-foreground">
            {bridge && printer?.deviceName ? `Desktop app: will go directly to "${printer.deviceName}"` : printer ? `Saved printer: ${printer.name} — select this same printer in the print window (the browser remembers it)` : "Select a printer in the print window · Margins: None · Scale: 100%"}
          </p>
          {actions?.map((a) => <Button key={a.label} variant={a.danger ? "destructive" : "outline"} onClick={() => { onClose(); a.onClick(); }}>{a.icon} {a.label}</Button>)}
          <Button variant="outline" onClick={() => setWa(true)}><MessageCircle /> WhatsApp</Button>
          <Button variant="outline" onClick={() => setMail(true)}><Mail /> Email PDF</Button>
          <Button variant="outline" disabled={busy} onClick={async () => { setBusy(true); await onPdf(output, { format, template }); setBusy(false); }}><Download /> Save PDF</Button>
          <Button disabled={busy} onClick={async () => { setBusy(true); await onPrint(output, { format, template, copies: Math.max(1, Number(copies) || 1) }); setBusy(false); }}><Printer /> Print</Button>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
      {wa && <WhatsAppSendDialog doc={output} business={cfg.business.name} onClose={() => setWa(false)} />}
      {mail && <EmailSendDialog doc={output} onClose={() => setMail(false)} />}
    </div>
  );
}
