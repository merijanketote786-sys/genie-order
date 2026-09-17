/**
 * Payment status selector — COD ya CC (advance/card payment).
 * On/Off toggle ke saath: off hone pe sab disable rehta hai aur chat box me
 * payment ki line nahi likhi jati. COD ke case me amount bhi likhi ja sakti hai.
 */
import { Banknote, CreditCard } from "lucide-react";

export type PaymentMethod = "COD" | "CC";

type Props = {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
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

/** Composer text se purani Payment Status / COD Amount lines hata deta hai. */
export function stripPaymentLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^(payment status|cod amount)\s*:/i.test(line.trim()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

/** Purani payment lines erase kar ke sirf nayi line likhta hai. */
export function upsertPaymentLine(text: string, line: string): string {
  const base = stripPaymentLines(text);
  return `${base}${base.trim() ? "\n" : ""}${line}\n`;
}

export function PaymentModeField({
  enabled,
  onEnabledChange,
  method,
  onMethodChange,
  codAmount,
  onCodAmountChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Payment status option"
        onClick={() => onEnabledChange(!enabled)}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          enabled ? "bg-primary" : "bg-muted-foreground/30"
        }`}
      >
        <span
          className={`inline-block size-4 transform rounded-full bg-card shadow transition ${
            enabled ? "translate-x-4.5" : "translate-x-0.5"
          }`}
        />
      </button>
      <span className="text-xs font-semibold text-muted-foreground">Payment</span>
      <div
        className={`flex overflow-hidden rounded-lg border border-input ${
          enabled ? "" : "pointer-events-none opacity-40"
        }`}
      >
        {(["COD", "CC"] as const).map((m) => (
          <button
            key={m}
            type="button"
            disabled={!enabled}
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
      {enabled ? (
        method === "COD" ? (
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
        )
      ) : (
        <span className="text-xs text-muted-foreground">Off — payment status add nahi hoga</span>
      )}
    </div>
  );
}
