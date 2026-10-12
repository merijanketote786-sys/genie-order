import { useRef, useState } from "react";
import { toast } from "sonner";
import { receiveSalePayment } from "@/lib/business.functions";
import { PAY_METHODS } from "@/lib/pos";
import { posInput, rs } from "@/components/pos-subnav";

const newRef = () => crypto.randomUUID();

export function ReceivePaymentDialog({ sale, onClose, onDone }: { sale: { id: string; doc_number: string; customer_name: string | null; balance: number }; onClose: () => void; onDone: (amount: number, method: string) => void }) {
  const [amount, setAmount] = useState(String(Number(sale.balance)));
  const [method, setMethod] = useState("Cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef(newRef());
  const bal = Number(sale.balance);

  const save = async () => {
    const a = Math.round(Number(amount) * 100) / 100;
    if (!(a > 0)) { toast.error("Enter a valid amount"); return; }
    if (a > bal + 0.005) { toast.error(`Amount cannot be more than balance ${rs(bal)}`); return; }
    if (busy) return;
    setBusy(true);
    try {
      await receiveSalePayment({ data: { saleId: sale.id, amount: a, method, note: note.trim() || undefined, clientRef: ref.current } });
      toast.success(`${rs(a)} received on ${sale.doc_number}`);
      onDone(a, method);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payment could not be saved.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4" onClick={() => !busy && onClose()}>
      <div className="w-full max-w-sm space-y-3 rounded-xl border border-border bg-card p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div>
          <p className="font-bold">Receive Payment — {sale.doc_number}</p>
          <p className="text-sm text-muted-foreground">{sale.customer_name || "Walk-in"} · Balance <b className="text-destructive">{rs(bal)}</b></p>
        </div>
        <label className="block text-sm">Amount
          <input autoFocus aria-label="Amount" inputMode="decimal" className={posInput} value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void save()} />
        </label>
        <label className="block text-sm">Method
          <select aria-label="Method" className={posInput} value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAY_METHODS.filter((m) => m !== "Credit").map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
        <label className="block text-sm">Note (optional)
          <input aria-label="Note" className={posInput} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-sm">Cancel</button>
          <button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50">{busy ? "Saving…" : "Receive"}</button>
        </div>
      </div>
    </div>
  );
}
