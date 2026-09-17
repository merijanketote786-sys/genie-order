/**
 * Payment status selector — COD ya CC (advance/card payment).
 * COD ke case me amount bhi likhi ja sakti hai.
 */
import { Banknote, CreditCard } from "lucide-react";

export type PaymentMethod = "COD" | "CC";

type Props = {
  method: PaymentMethod;
  onMethodChange: (method: PaymentMethod) => void;
  codAmount: string;
  onCodAmountChange: (value: string) => void;
};

export function paymentLine(method: PaymentMethod, codAmount: string): string {
  const amount = codAmount.replace(/[^\d.]/g, "");
  if (method === "COD") {
    return amount
      ? `Payment Status: COD\nCOD Amount: ${Number(amount).toLocaleString("en-PK")}`
      : "Payment Status: COD";
  }
  return "Payment Status: CC";
}

export function PaymentModeField({
  method,
  onMethodChange,
  codAmount,
  onCodAmountChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
      <span className="text-xs font-semibold text-muted-foreground">Payment</span>
      <div className="flex overflow-hidden rounded-lg border border-input">
        {(["COD", "CC"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onMethodChange(m)}
            aria-pressed={method === m}
            className={`inline-flex h-9 items-center gap-1.5 px-3 text-xs font-semibold transition ${
              method === m
                ? "bg-primary text-primary-foreground"
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            {m === "COD" ? <Banknote className="size-3.5" /> : <CreditCard className="size-3.5" />}
            {m}
          </button>
        ))}
      </div>
      {method === "COD" ? (
        <label className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="sr-only">COD amount</span>
          <input
            value={codAmount}
            onChange={(e) => onCodAmountChange(e.target.value.replace(/[^\d.]/g, "").slice(0, 12))}
            inputMode="decimal"
            placeholder="COD amount (Rs)"
            className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
          />
        </label>
      ) : (
        <span className="text-xs text-muted-foreground">Payment pehle ho chuki hai</span>
      )}
    </div>
  );
}
