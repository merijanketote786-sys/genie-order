import { Button } from "@/components/ui/button";
import { Check, Copy, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function shareOnWhatsApp(text: string) {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

export function ResultCard({ text, label }: { text: string; label: string }) {
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
    <div className="glass-panel w-full overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
        <span className="font-display text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </span>
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
      </div>
      <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-[13px] leading-relaxed text-foreground">
        {text}
      </pre>
      <div className="flex flex-wrap gap-2 border-t border-border/60 bg-surface-2/40 px-3 py-2.5">
        <Button size="sm" onClick={() => shareOnWhatsApp(text)} className="gap-1.5 rounded-full">
          <Share2 className="h-4 w-4" />
          WhatsApp par bhejo
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
