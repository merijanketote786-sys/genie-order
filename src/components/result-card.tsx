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
  exportInvoiceExcel,
  exportInvoicePdf,
} from "@/lib/invoice-export";
import { Check, Copy, FileSpreadsheet, FileText, MessageCircle } from "lucide-react";
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
}: {
  text: string;
  label: string;
  phone?: string | null;
  exportable?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [exportFormat, setExportFormat] = useState<"pdf" | "xlsx" | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copy ho gaya");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Copy nahi ho saka");
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
            {toWhatsAppNumber(phone) ? "Customer ko bhejo" : "WhatsApp par bhejo"}
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
      </div>
    </article>
  );
}
