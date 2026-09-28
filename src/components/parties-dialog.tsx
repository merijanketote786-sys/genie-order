import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FileText, UserPlus } from "lucide-react";
import { usePrintCenter } from "@/components/print-center";
import { getCustomerLedger, getPartyStatementItems } from "@/lib/ledger.functions";
import { getSupplierLedger } from "@/lib/business.functions";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { listCustomerBalances } from "@/lib/ledger.functions";
import { listSuppliers, saveSupplier } from "@/lib/business.functions";
import { saveParty } from "@/lib/records.functions";
import { rs } from "@/components/pos-subnav";

type Party = { key: string; name: string; phone: string; kind: string; balance: number; customerId?: string; supplierId?: string; address?: string };

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
  const pc = usePrintCenter();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = today.slice(0, 8) + "01";
  const [stParty, setStParty] = useState<Party | null>(null);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [stBusy, setStBusy] = useState(false);
  const OPTS = [
    ["sale", "Sales"], ["saleReturn", "Sale returns"], ["purchase", "Purchases"], ["purchaseReturn", "Purchase returns"],
    ["received", "Amount received"], ["paid", "Amount paid"], ["items", "Item details"], ["qty", "Quantity"], ["unit", "Unit"], ["rate", "Price per unit"], ["lineTotal", "Item amount"],
  ] as const;
  type Opt = (typeof OPTS)[number][0];
  const [inc, setInc] = useState<Record<Opt, boolean>>({ sale: true, saleReturn: true, purchase: true, purchaseReturn: true, received: true, paid: true, items: true, qty: true, unit: true, rate: true, lineTotal: true });
  const cat = (kind: string): Opt => {
    if (kind === "Sale invoice") return "sale";
    if (kind === "Sale return") return "saleReturn";
    if (kind === "Purchase") return "purchase";
    if (kind === "Purchase return") return "purchaseReturn";
    if (/^(Payment mili|Bill par paid|Refund mila)/.test(kind)) return "received";
    return "paid";
  };
  const label = (kind: string, c: Opt) => {
    const m = kind.match(/\(([^)]*)\)/)?.[1];
    const base = c === "received" ? (kind.startsWith("Refund") ? "Refund received" : "Amount received") : c === "paid" ? (kind.startsWith("Refund") ? "Refund paid" : "Amount paid") : kind;
    return m ? `${base} (${m})` : base;
  };

  const openStatement = async () => {
    const p = stParty; if (!p) return;
    if (from > to) { toast.error("From date must be before To date"); return; }
    setStBusy(true);
    try {
      const [cl, sl, itm] = await Promise.all([
        p.customerId ? getCustomerLedger({ data: { id: p.customerId } }) : null,
        p.supplierId ? getSupplierLedger({ data: { id: p.supplierId } }) : null,
        inc.items ? getPartyStatementItems({ data: { customerId: p.customerId, supplierId: p.supplierId } }) : null,
      ]);
      // Our view: debit increases receivable, credit reduces it.
      type R = { date: string; kind: string; ref: string; debit: number; credit: number };
      const rows: R[] = [...(cl?.rows ?? []), ...(sl?.rows ?? []).map((r) => ({ date: r.date, kind: r.kind, ref: r.ref, debit: r.debit, credit: r.credit }))];
      rows.sort((a, b) => a.date.localeCompare(b.date));
      let run = Number(cl?.opening ?? 0) - Number(sl?.opening ?? 0);
      const d = (x: string) => new Date(x).toLocaleDateString("en-CA");
      const inRange: (string | number)[][] = [];
      let dr = 0, cr = 0;
      for (const r of rows) {
        const day = d(r.date);
        if (day > to) break;
        run = Math.round((run + r.debit - r.credit) * 100) / 100;
        if (day < from) continue;
        dr += r.debit; cr += r.credit;
        const c = cat(r.kind);
        if (!inc[c]) continue;
        inRange.push([new Date(r.date).toLocaleDateString("en-PK"), label(r.kind, c), r.ref, r.debit || "", r.credit || "", run]);
        for (const it of (inc.items ? itm?.items[r.ref] : null) ?? []) {
          const parts = [`• ${it.name}`];
          if (inc.qty) parts.push(`${it.qty}${inc.unit && it.unit ? " " + it.unit : ""}`);
          else if (inc.unit && it.unit) parts.push(it.unit);
          if (inc.rate) parts.push(`@ Rs ${it.rate.toLocaleString("en-PK")}`);
          if (inc.lineTotal) parts.push(`= Rs ${it.total.toLocaleString("en-PK")}`);
          inRange.push(["", parts.join("  "), "", "", "", ""]);
        }
      }
      const opening = Math.round((run - dr + cr) * 100) / 100;
      const fmt = (x: string) => new Date(x).toLocaleDateString("en-PK");
      onOpenChange(false);
      pc.preview({
        kind: "statement", title: "Party Statement", number: p.name, date: new Date(),
        party: { label: p.kind, name: p.name, phone: p.phone, address: p.address ?? "" },
        meta: [["Period", `${fmt(from)} to ${fmt(to)}`]],
        table: { head: ["Date", "Detail", "Ref", "Debit", "Credit", "Balance"], align: ["l", "l", "l", "r", "r", "r"], rows: [["", "Opening balance", "", "", "", opening], ...inRange] },
        totals: [
          { label: "Total debit", value: dr },
          { label: "Total credit", value: cr },
          { label: run >= 0 ? "Closing balance (receivable)" : "Closing balance (payable)", value: Math.abs(run), bold: true },
        ],
      });
      setStParty(null);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Statement could not be loaded"); }
    setStBusy(false);
  };
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
    map.set(k, { key: k, name: x.name || x.phone || "No name", phone: x.phone, kind: "Customer", balance: x.balance, customerId: x.id });
  }
  for (const x of s.data?.suppliers ?? []) {
    const k = x.phone ? `p${tail(x.phone)}` : `s${x.id}`;
    const e = map.get(k);
    if (e) { e.balance -= x.balance; e.kind = "Customer · Supplier"; e.supplierId = x.id; }
    else map.set(k, { key: k, name: x.name, phone: x.phone, kind: "Supplier", balance: -x.balance, supplierId: x.id, address: x.address ?? "" });
  }
  const ql = q.trim().toLowerCase();
  const list = [...map.values()]
    .filter((p) => !ql || p.name.toLowerCase().includes(ql) || p.phone.includes(ql))
    .sort((a, b) => a.name.localeCompare(b.name));
  const loading = c.isLoading || s.isLoading;

  return (
    <>
    {pc.node}
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
            <li key={p.key} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{p.name}</p>
                <p className="truncate text-xs text-muted-foreground">{p.kind}{p.phone ? ` · ${p.phone}` : ""}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`text-sm font-bold tabular-nums ${p.balance > 0 ? "text-success" : "text-destructive"}`}>{rs(Math.abs(p.balance))}</span>
                <Button type="button" size="sm" variant="outline" className="h-8 gap-1 px-2" onClick={() => setStParty(stParty?.key === p.key ? null : p)} aria-label={`Statement for ${p.name}`}><FileText className="size-4" /> Statement</Button>
              </div>
              {stParty?.key === p.key ? (
                <div className="basis-full space-y-2 rounded-lg border border-border bg-muted/40 p-2">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs text-muted-foreground">From<input type="date" className={inputCls} value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
                    <label className="text-xs text-muted-foreground">To<input type="date" className={inputCls} value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
                  </div>
                  <p className="text-xs font-semibold text-muted-foreground">Include in statement</p>
                  <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                    {OPTS.map(([k, l]) => (
                      <label key={k} className={`flex items-center gap-2 text-xs ${["qty", "unit", "rate", "lineTotal"].includes(k) && !inc.items ? "opacity-50" : ""}`}>
                        <input type="checkbox" className="size-4 accent-primary" checked={inc[k]} disabled={["qty", "unit", "rate", "lineTotal"].includes(k) && !inc.items} onChange={(e) => setInc({ ...inc, [k]: e.target.checked })} />{l}
                      </label>
                    ))}
                  </div>
                  <Button type="button" className="w-full" disabled={stBusy} onClick={openStatement}>{stBusy ? "Loading…" : "Preview statement · Print / PDF / Share"}</Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
    </>
  );
}
