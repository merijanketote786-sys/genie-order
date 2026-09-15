import { Button } from "@/components/ui/button";
import { Check, Copy, Share2 } from "lucide-react";
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

export function whatsappUrl(text: string, phone?: string | null) {
  const to = toWhatsAppNumber(phone);
  return to
    ? `https://wa.me/${to}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function shareOnWhatsApp(text: string, phone?: string | null) {
  const url = whatsappUrl(text, phone);
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) {
    try {
      window.top?.location.assign(url);
    } catch {
      void navigator.clipboard?.writeText(url);
      toast.error("Browser ne WhatsApp block kiya — link copy ho gaya, paste karein");
    }
  }
}

export function ResultCard({
  text,
  label,
  phone,
}: {
  text: string;
  label: string;
  phone?: string | null;
}) {
  const [copied, setCopied] = useState(false);

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
    <div className="bubble-in w-full overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
          {label}
        </span>
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
      </div>
      <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-[13px] leading-relaxed text-foreground">
        {text}
      </pre>
      <div className="flex flex-wrap gap-2 border-t border-border/50 bg-black/15 px-3 py-2.5">
        <Button
          size="sm"
          onClick={() => shareOnWhatsApp(text, phone)}
          className="gap-1.5 rounded-full"
        >
          <Share2 className="h-4 w-4" />
          {toWhatsAppNumber(phone) ? "Customer ko bhejo" : "WhatsApp par bhejo"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={copy}
          className="gap-1.5 rounded-full border-border/70 bg-transparent"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
