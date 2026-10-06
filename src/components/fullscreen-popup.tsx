import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Poori screen ka popup, upar title aur X (close) button ke saath. Esc se bhi band. */
export function FullScreenPopup({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-background" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-3">
        <h2 className="font-display text-base font-bold text-foreground">{title}</h2>
        <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close"><X /></Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>,
    document.body,
  );
}
