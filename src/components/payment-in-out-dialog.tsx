import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { listCustomerBalances } from "@/lib/ledger.functions";
import { listSuppliers, partyPayment } from "@/lib/business.functions";
import { rs } from "@/components/pos-subnav";
import { usePosAccess } from "@/components/pos-access";
import { usePrintCenter } from "@/components/print-center";
import { newRef } from "@/lib/pos-errors";

type Party = { key: string; name: string; phone: string; kind: string; balance: number; customerId?: string; supplierId?: string };
const tail = (p: string) => p.replace(/\D/g, "").slice(-10);
const inputCls = "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary";

export function PaymentInOutDialog({ open, onOpenChange, dir, onDirChange }: { open: boolean; onOpenChange: (v: boolean) => void; dir: "in" | "out"; onDirChange: (d: "in" | "out") => void }) {
  const qc = useQueryClient();
  const pc = usePrintCenter();
  const { cfg } = usePosAccess();
  const methods = cfg.payMethods.filter((m) => m !== "Credit");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Party | null>(null);
  const [hi, setHi] = useState(0);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const opRef = useRef(newRef());
  const listRef = useRef<HTMLUListElement>(null);

  const c = useQuery({ queryKey: ["customer-balances", "pos"], queryFn: () => listCustomerBalances({ data: { posOnly: true } }), enabled: open });
  const s = useQuery({ queryKey: ["suppliers"], queryFn: () => listSuppliers(), enabled: open });

  useEffect(() => { if (!open) { setQ(""); setSel(null); setAmount(""); setNote(""); setHi(0); } }, [open]);

  const map = new Map<string, Party>();
  for (const x of c.data?.customers ?? []) {
    const digits = x.phone.replace(/\D/g, "");
    const k = digits.length >= 7 ? `p${tail(x.phone)}` : `c${x.id}`;
    map.set(k, { key: k, name: x.name || x.phone || "No name", phone: x.phone, kind: "Customer", balance: x.balance, customerId: x.id });
  }
  const supplierCounts = new Map<string, number>();
  for (const x of s.data?.suppliers ?? []) { const digits = x.phone.replace(/\D/g, ""); if (digits.length >= 7) { const k = `p${tail(x.phone)}`; supplierCounts.set(k, (supplierCounts.get(k) ?? 0) + 1); } }
  for (const x of s.data?.suppliers ?? []) {
    const digits = x.phone.replace(/\D/g, "");
    const phoneKey = `p${tail(x.phone)}`;
    const k = digits.length >= 7 && supplierCounts.get(phoneKey) === 1 ? phoneKey : `s${x.id}`;
    const e = map.get(k);
    if (e) { e.balance -= x.balance; e.kind = "Customer · Supplier"; e.supplierId = x.id; }
    else map.set(k, { key: k, name: x.name, phone: x.phone, kind: "Supplier", balance: -x.balance, supplierId: x.id });
  }
  const ql = q.trim().toLowerCase();
  const list = [...map.values()].filter((p) => !ql || p.name.toLowerCase().includes(ql) || p.phone.includes(ql)).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 200);

  useEffect(() => { listRef.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" }); }, [hi]);

  const pick = (p: Party) => { setSel(p); setQ(""); };

  const save = async () => {
    const a = Number(amount);
    if (!sel) { toast.error("Select a party"); return; }
    if (!(a > 0)) { toast.error("Enter a valid amount"); return; }
    if (busy) return;
    // In: customer receipt preferred; Out: supplier payment preferred.
    const kind = dir === "in" ? (sel.customerId ? "receipt" : "supplier_receipt") : (sel.supplierId ? "supplier_payment" : "customer_payment_out");
    const partyId = (kind === "receipt" || kind === "customer_payment_out" ? sel.customerId : sel.supplierId)!;
    setBusy(true);
    try {
      await partyPayment({ data: { kind, partyId, amount: a, method, note: note.trim() || undefined, clientRef: opRef.current } });
      opRef.current = newRef();
      toast.success(`${dir === "in" ? "Payment In" : "Payment Out"} ${rs(a)} saved`);
      const after = sel.balance + (dir === "in" ? -a : a);
      pc.afterSave({
        kind: "receipt", title: dir === "in" ? "Payment In Receipt" : "Payment Out Voucher",
        number: `${dir === "in" ? "PIN" : "POUT"}-${Date.now().toString().slice(-6)}`, date: new Date(),
        party: { label: dir === "in" ? "Received from" : "Paid to", name: sel.name, phone: sel.phone },
        payments: [{ method, amount: a }],
        totals: [{ label: dir === "in" ? "Amount received" : "Amount paid", value: a, bold: true }, { label: after >= 0 ? "Balance (receivable)" : "Balance (payable)", value: Math.abs(after) }],
        notes: note.trim() || undefined,
      }, "receipt");
      setSel(null); setAmount(""); setNote("");
      await Promise.all(["customer-balances", "suppliers", "cust-bal", "cust-ledger", "sup-ledger", "pos-dashboard"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      onOpenChange(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Payment could not be saved. Please try again."); }
    setBusy(false);
  };

  return (
    <>
      {pc.node}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{dir === "in" ? "Payment In" : "Payment Out"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={dir === "in" ? "default" : "outline"} onClick={() => onDirChange("in")}>Payment In</Button>
            <Button type="button" variant={dir === "out" ? "default" : "outline"} onClick={() => onDirChange("out")}>Payment Out</Button>
          </div>
          {sel ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-primary bg-accent p-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{sel.name}</p>
                <p className="truncate text-xs text-muted-foreground">{sel.phone || "No phone"}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`text-sm font-bold ${sel.balance > 0 ? "text-success" : "text-destructive"}`}>{rs(Math.abs(sel.balance))}</span>
                <Button type="button" size="sm" variant="ghost" onClick={() => setSel(null)}>Change</Button>
              </div>
            </div>
          ) : (
            <>
              <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setHi(0); }} placeholder="Search customer or supplier · ↑↓ select · Enter pick" className={inputCls}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(list.length - 1, h + 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
                  else if (e.key === "Enter" && list[hi]) { e.preventDefault(); pick(list[hi]); }
                }} />
              <ul ref={listRef} role="listbox" className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {c.isLoading || s.isLoading ? <li className="p-3 text-center text-sm text-muted-foreground">Loading parties…</li> : null}
                {!c.isLoading && !s.isLoading && !list.length ? <li className="p-3 text-center text-sm text-muted-foreground">No parties found</li> : null}
                {list.map((p, i) => (
                  <li key={p.key} data-i={i} role="option" aria-selected={i === hi}>
                    <button type="button" onMouseEnter={() => setHi(i)} onClick={() => pick(p)} className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left ${i === hi ? "bg-accent" : ""}`}>
                      <span className="min-w-0"><b className="block truncate text-sm">{p.name}</b><span className="text-xs text-muted-foreground">{p.kind}{p.phone ? ` · ${p.phone}` : ""}</span></span>
                      <span className={`shrink-0 text-sm font-bold ${p.balance > 0 ? "text-success" : "text-destructive"}`}>{rs(Math.abs(p.balance))}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="grid grid-cols-2 gap-2">
            <input className={inputCls} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} placeholder="Amount · Enter saves" aria-label="Amount" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void save(); } }} />
            <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Method">{methods.map((m) => <option key={m}>{m}</option>)}</select>
          </div>
          <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
          <Button type="button" className="w-full" disabled={busy || !sel} onClick={save}>{busy ? "Saving…" : dir === "in" ? "Save Payment In" : "Save Payment Out"}</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
