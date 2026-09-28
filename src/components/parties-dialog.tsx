import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { listCustomerBalances } from "@/lib/ledger.functions";
import { listSuppliers, saveSupplier } from "@/lib/business.functions";
import { saveParty } from "@/lib/records.functions";
import { rs } from "@/components/pos-subnav";

type Party = { key: string; name: string; phone: string; kind: string; balance: number };

const tail = (p: string) => p.replace(/\D/g, "").slice(-10);
const inputCls = "h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary";

export function PartiesDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<"customer" | "supplier">("customer");
  const [addName, setAddName] = useState("");
  const [addPhone, setAddPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const c = useQuery({ queryKey: ["customer-balances", "pos"], queryFn: () => listCustomerBalances({ data: { posOnly: true } }), enabled: open });
  const s = useQuery({ queryKey: ["suppliers"], queryFn: () => listSuppliers(), enabled: open });

  const addParty = async () => {
    if (!addName.trim() || !addPhone.trim()) { toast.error("Name aur phone zaroori hain"); return; }
    setSaving(true);
    try {
      if (addKind === "customer") await saveParty({ data: { name: addName.trim(), phone: addPhone.trim() } });
      else await saveSupplier({ data: { name: addName.trim(), phone: addPhone.trim() } });
      toast.success("Party add ho gayi");
      setAddName(""); setAddPhone(""); setAddOpen(false);
      await Promise.all([qc.invalidateQueries({ queryKey: ["customer-balances"] }), qc.invalidateQueries({ queryKey: ["suppliers"] })]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Party add nahi hui"); }
    setSaving(false);
  };

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
        <div className="flex gap-2">
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search party name or phone" className={inputCls} />
          <Button type="button" variant="outline" className="h-10 shrink-0 gap-1" onClick={() => setAddOpen((o) => !o)}><UserPlus className="size-4" /> Add party</Button>
        </div>
        {addOpen ? (
          <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={addKind === "customer" ? "default" : "outline"} onClick={() => setAddKind("customer")}>Customer</Button>
              <Button type="button" size="sm" variant={addKind === "supplier" ? "default" : "outline"} onClick={() => setAddKind("supplier")}>Supplier</Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className={inputCls} placeholder="Name *" value={addName} onChange={(e) => setAddName(e.target.value)} />
              <input className={inputCls} placeholder="Phone *" inputMode="tel" value={addPhone} onChange={(e) => setAddPhone(e.target.value.replace(/[^\d+\s-]/g, ""))} />
            </div>
            <Button type="button" className="w-full" disabled={saving} onClick={addParty}>{saving ? "Saving…" : "Save party"}</Button>
          </div>
        ) : null}
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
