import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listCustomerBalances } from "@/lib/ledger.functions";
import { listSuppliers } from "@/lib/business.functions";
import { rs } from "@/components/pos-subnav";

type Party = { key: string; name: string; phone: string; kind: string; balance: number };

const tail = (p: string) => p.replace(/\D/g, "").slice(-10);

export function PartiesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [q, setQ] = useState("");
  const c = useQuery({ queryKey: ["customer-balances"], queryFn: () => listCustomerBalances(), enabled: open });
  const s = useQuery({ queryKey: ["suppliers"], queryFn: () => listSuppliers(), enabled: open });

  // Balance: positive = hum ne lene hain (receivable), negative = dene hain (payable).
  const map = new Map<string, Party>();
  for (const x of c.data?.customers ?? []) {
    const k = x.phone ? `p${tail(x.phone)}` : `c${x.id}`;
    map.set(k, { key: k, name: x.name || x.phone || "No name", phone: x.phone, kind: "Customer", balance: x.balance });
  }
  for (const x of s.data?.suppliers ?? []) {
    const k = x.phone ? `p${tail(x.phone)}` : `s${x.id}`;
    const e = map.get(k);
    if (e) { e.balance -= x.balance; e.kind = "Customer · Supplier"; }
    else map.set(k, { key: k, name: x.name, phone: x.phone, kind: "Supplier", balance: -x.balance });
  }
  const ql = q.trim().toLowerCase();
  const list = [...map.values()]
    .filter((p) => !ql || p.name.toLowerCase().includes(ql) || p.phone.includes(ql))
    .sort((a, b) => a.name.localeCompare(b.name));
  const loading = c.isLoading || s.isLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Parties</DialogTitle></DialogHeader>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search party name or phone" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary" />
        <div className="flex justify-between text-xs text-muted-foreground"><span>{list.length} parties</span><span><span className="text-success">Green</span> = to receive · <span className="text-destructive">Red</span> = to pay / zero</span></div>
        <ul className="max-h-[60vh] divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {loading ? <li className="p-4 text-center text-sm text-muted-foreground">Loading parties…</li> : null}
          {!loading && !list.length ? <li className="p-4 text-center text-sm text-muted-foreground">No parties found</li> : null}
          {list.map((p) => (
            <li key={p.key} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{p.name}</p>
                <p className="truncate text-xs text-muted-foreground">{p.kind}{p.phone ? ` · ${p.phone}` : ""}</p>
              </div>
              <span className={`shrink-0 text-sm font-bold tabular-nums ${p.balance > 0 ? "text-success" : "text-destructive"}`}>{rs(Math.abs(p.balance))}</span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
