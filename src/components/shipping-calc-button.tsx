import { useState } from "react";
import { createPortal } from "react-dom";
import { Calculator, X } from "lucide-react";
import { RateMiniCalculatorBody } from "@/components/rate-mini-calculator";

export function ShippingCalcButton({ onUse }: { onUse: (amount: number) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="Courier rate calculator" aria-label="Courier rate calculator" className="inline-flex size-6 items-center justify-center rounded-md text-primary hover:bg-muted">
        <Calculator className="size-4" />
      </button>
      {open ? createPortal(
        <div className="fixed inset-0 z-[100] grid place-items-center bg-foreground/40 p-3" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border bg-card shadow-xl">
            <div className="flex items-center justify-between px-4 py-3">
              <h3 className="font-semibold">Courier rate calculator</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-md p-1 hover:bg-muted"><X className="size-4" /></button>
            </div>
            <RateMiniCalculatorBody useLabel="Add to delivery" onUse={(a) => { onUse(a); setOpen(false); }} />
          </div>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
