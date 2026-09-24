import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  applyDeliveryChoice,
  buildInvoiceExcelFile,
  buildInvoicePdfFile,
  exportInvoiceExcel,
  exportInvoicePdf,
  shareInvoiceFile,
} from "@/lib/invoice-export";
import { ArrowLeftRight, Check, Copy, FileSpreadsheet, FileText, MessageCircle, Save, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/** 03001234567 / +92 300 1234567 / 3001234567 -> 923001234567 */
export function toWhatsAppNumber(input?: string | null): string | null {
  const digits = (input ?? "").replace(/\D/g, "");
  if (!digits) return null;
  let n = digits;
  if (n.startsWith("0092")) n = n.slice(4);
  else if (n.startsWith("92")) n = n;
  else if (n.startsWith("0")) n = `92${n.slice(1)}`;
  else if (n.length === 10 && n.startsWith("3")) n = `92${n}`;
  return n.length >= 11 ? n : null;
}

/** wa.me: mobile par installed WhatsApp app, desktop par WhatsApp app/web khud khul jata hai */
export function whatsappUrl(text: string, phone?: string | null) {
  const to = toWhatsAppNumber(phone);
  const t = encodeURIComponent(text);
  return to ? `https://wa.me/${to}?text=${t}` : `https://wa.me/?text=${t}`;
}

export function ResultCard({
  text,
  label,
  phone,
  exportable = false,
  onSave,
  forward,
  forward2,
}: {
  text: string;
  label: string;
  phone?: string | null;
  exportable?: boolean;
  onSave?: (text: string) => Promise<void>;
  /** Button to forward to another section (Order/Invoice). */
  forward?: { label: string; onClick: (text: string) => void };
  /** Button to forward to a third section (e.g. Order Confirmation). */
  forward2?: { label: string; onClick: (text: string) => void };
}) {

  const [copied, setCopied] = useState(false);
  const [exportFormat, setExportFormat] = useState<"pdf" | "xlsx" | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    if (!onSave || saving) return;
    setSaving(true);
    try {
      await onSave(text);
      setSaved(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <article className="bubble-in w-full overflow-hidden rounded-3xl border border-border bg-card">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-4 py-3 sm:px-5">
        <span className="truncate text-[11px] font-bold uppercase text-primary">
          {label}
        </span>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-success">
          <span className="size-1.5 rounded-full bg-success" /> Ready
        </span>
      </div>
      <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words px-4 py-5 font-mono text-[13px] leading-7 text-foreground sm:px-5">
        {text}
      </pre>
      <div className="flex flex-wrap gap-2 border-t border-border bg-surface-2/60 px-3 py-3 sm:px-5">
        <Button asChild size="sm" className="h-11 flex-1 gap-1.5 rounded-xl bg-success sm:h-9 sm:flex-none text-primary-foreground hover:bg-success/90">
          <a
            href={whatsappUrl(text, phone)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle className="h-4 w-4" />
            {toWhatsAppNumber(phone) ? "Send to customer" : "Send via WhatsApp"}
          </a>
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={copy}
          className="h-11 flex-1 gap-1.5 rounded-xl border-border bg-card sm:h-9 sm:flex-none"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
        {onSave ? (
          <Button
            size="sm"
            variant="outline"
            onClick={save}
            disabled={saving || saved}
            className="h-11 flex-1 gap-1.5 rounded-xl border-border bg-card sm:h-9 sm:flex-none"
          >
            {saved ? <Check className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            {saved ? "Saved" : saving ? "Saving…" : "Save"}
          </Button>
        ) : null}
        {forward ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => forward.onClick(text)}
            className="h-11 flex-1 gap-1.5 rounded-xl border-border bg-card sm:h-9 sm:flex-none"
          >
            <ArrowLeftRight className="h-4 w-4" /> {forward.label}
          </Button>
        ) : null}
        {forward2 ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => forward2.onClick(text)}
            className="h-11 flex-1 gap-1.5 rounded-xl border-border bg-card sm:h-9 sm:flex-none"
          >
            <ArrowLeftRight className="h-4 w-4" /> {forward2.label}
          </Button>
        ) : null}

        {exportable ? (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setExportFormat("pdf")}
              className="h-11 flex-1 gap-1.5 rounded-xl border-border bg-card sm:h-9 sm:flex-none"
            >
              <FileText className="h-4 w-4" /> PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setExportFormat("xlsx")}
              className="h-11 flex-1 gap-1.5 rounded-xl border-border bg-card sm:h-9 sm:flex-none"
            >
              <FileSpreadsheet className="h-4 w-4" /> Excel
            </Button>
          </>
        ) : null}
      </div>
      {exportable ? (
        <ExportDialog
          text={text}
          format={exportFormat}
          phone={phone}
          onClose={() => setExportFormat(null)}
        />
      ) : null}
    </article>
  );
}

function ExportDialog({
  text,
  format,
  phone,
  onClose,
}: {
  text: string;
  format: "pdf" | "xlsx" | null;
  phone?: string | null;
  onClose: () => void;
}) {
  const [delivery, setDelivery] = useState("");
  const [showDelivery, setShowDelivery] = useState(true);
  const [busy, setBusy] = useState(false);

  const finalText = () => applyDeliveryChoice(text, { delivery, showDelivery });
  const label = format === "xlsx" ? "Excel" : "PDF";

  const run = async () => {
    if (!format) return;
    setBusy(true);
    try {
      if (format === "pdf") await exportInvoicePdf(finalText());
      else await exportInvoiceExcel(finalText());
      toast.success(`${label} downloaded`);
      onClose();
    } catch {
      toast.error("Export failed");
    } finally {
      setBusy(false);
    }
  };

  const runWhatsApp = async () => {
    if (!format) return;
    setBusy(true);
    try {
      const built = finalText();
      const file =
        format === "pdf"
          ? await buildInvoicePdfFile(built)
          : await buildInvoiceExcelFile(built);
      const outcome = await shareInvoiceFile(file, () => {
        window.open(
          whatsappUrl("The invoice file has been downloaded — please attach it here and send.", phone),
          "_blank",
          "noopener,noreferrer",
        );
      });
      toast.success(
        outcome === "shared"
          ? `${label} shared via WhatsApp`
          : `${label} downloaded — attach it in the WhatsApp chat`,
      );
      onClose();
    } catch {
      toast.error("Export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={format !== null} onOpenChange={(open) => (!open ? onClose() : null)}>
      <DialogContent className="rounded-3xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {format === "xlsx" ? "Excel export" : "PDF export"}
          </DialogTitle>
          <DialogDescription>
            Confirm the delivery charges details, then the file will download.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="export-delivery">Delivery charges</Label>
            <Input
              id="export-delivery"
              value={delivery}
              onChange={(e) => setDelivery(e.target.value)}
              inputMode="numeric"
              placeholder="Leave blank or enter amount (e.g. 250)"
              disabled={!showDelivery}
            />
            <p className="text-xs text-muted-foreground">
              Entering an amount will update the Grand Total accordingly.
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface-2/60 px-3 py-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Show delivery charges in invoice?
              </p>
              <p className="text-xs text-muted-foreground">
                Turning this off will remove the line from the invoice.
              </p>
            </div>
            <Switch checked={showDelivery} onCheckedChange={setShowDelivery} />
          </div>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={runWhatsApp}
            disabled={busy}
            className="w-full gap-1.5 rounded-xl bg-success text-primary-foreground hover:bg-success/90"
          >
            <Send className="h-4 w-4" />
            {busy ? "Preparing…" : `Send ${format === "xlsx" ? "Excel" : "PDF"} via WhatsApp`}
          </Button>
          <div className="flex w-full gap-2">
            <Button variant="outline" onClick={onClose} className="flex-1 rounded-xl">
              Cancel
            </Button>
            <Button onClick={run} disabled={busy} variant="secondary" className="flex-1 rounded-xl">
              {busy ? "Preparing…" : "Download only"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
