import { Button } from "@/components/ui/button";
import { waNumber } from "@/components/whatsapp-send";
import { FileDown, Mail, MessageCircle, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/** Share popup for a saved invoice: WhatsApp, Email, or PDF. */
export function ShareDialog({
  title,
  text,
  phone,
  onClose,
}: {
  title: string;
  text: string;
  phone?: string | null;
  onClose: () => void;
}) {
  const [to, setTo] = useState(phone ?? "");
  const [email, setEmail] = useState("");
  const num = waNumber(to);
  const waValid = num.length >= 10;

  const openWhatsApp = () => {
    if (!waValid) return toast.error("Enter a valid WhatsApp number");
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };

  const openEmail = () => {
    const toQ = email.trim() ? `mailto:${encodeURIComponent(email.trim())}` : "mailto:";
    window.open(`${toQ}?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`, "_blank", "noopener");
  };

  const savePdf = () => {
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return toast.error("Popup blocked — allow popups for this site");
    const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    w.document.write(`<!doctype html><html><head><title>${esc(title)}</title><style>
      @page { margin: 12mm; }
      body { font-family: Arial, sans-serif; color: #111; padding: 16px; }
      h1 { font-size: 18px; margin: 0 0 12px; }
      pre { white-space: pre-wrap; font-family: inherit; font-size: 13px; line-height: 1.6; }
    </style></head><body><h1>${esc(title)}</h1><pre>${esc(text)}</pre>
    <script>window.onload = () => { window.print(); };</script></body></html>`);
    w.document.close();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/50 p-3" role="dialog" aria-modal="true" aria-label="Share invoice">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-2xl">
        <div className="mb-3 flex items-center gap-2">
          <p className="mr-auto truncate font-bold text-foreground">Share {title}</p>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X /></Button>
        </div>

        <div className="space-y-3">
          <div className="rounded-xl border border-border p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <MessageCircle className="size-4 text-success" /> WhatsApp
            </div>
            <div className="flex gap-2">
              <input
                className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm text-foreground"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="03xx xxxxxxx"
                inputMode="tel"
              />
              <Button onClick={openWhatsApp} disabled={!waValid} className="gap-1.5">
                <MessageCircle className="size-4" /> Send
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Mail className="size-4 text-primary" /> Email
            </div>
            <div className="flex gap-2">
              <input
                className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm text-foreground"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="party@email.com (optional)"
                inputMode="email"
              />
              <Button variant="outline" onClick={openEmail} className="gap-1.5">
                <Mail className="size-4" /> Send
              </Button>
            </div>
          </div>

          <div className="rounded-xl border border-border p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileDown className="size-4 text-warning-foreground" /> PDF
            </div>
            <Button variant="outline" onClick={savePdf} className="w-full gap-1.5">
              <FileDown className="size-4" /> Open PDF / Save as PDF
            </Button>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              A print window opens — choose "Save as PDF" or send it to any printer.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
