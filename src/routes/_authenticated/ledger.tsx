import { AppShell } from "@/components/app-shell";
import { PosSubnav, posInput, rs } from "@/components/pos-subnav";
import { Button } from "@/components/ui/button";
import { partyPayment } from "@/lib/business.functions";
import { getCustomerLedger, listCustomerBalances, saveCustomerAccount } from "@/lib/ledger.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { MessageCircle, Printer, Search, Wallet } from "lucide-react";
import { useMemo, useState, useRef } from "react";
import { toast } from "sonner";
import { newRef } from "@/lib/pos-errors";
import { usePrintCenter } from "@/components/print-center";
import { usePosAccess } from "@/components/pos-access";

export const Route = createFileRoute("/_authenticated/ledger")({
  head: () => ({
    meta: [
      { title: "Customer Ledger (Credit) — HB Chemicals Pakistan Workspace" },
      { name: "description", content: "Customer credit, running balance ledger, receive payments and print statements." },
      { property: "og:title", content: "Customer Ledger — HB Chemicals Pakistan Workspace" },
      { property: "og:description", content: "Customer credit and statements." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LedgerPage,
});

function LedgerPage() {
  const qc = useQueryClient();
  const pc = usePrintCenter();
  const { cfg } = usePosAccess();
  const { data } = useQuery({ queryKey: ["cust-bal"], queryFn: () => listCustomerBalances() });
  const [q, setQ] = useState("");
  const [onlyDue, setOnlyDue] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [pay, setPay] = useState({ amount: "", method: "Cash", note: "" });
  const [acct, setAcct] = useState<{ opening: string; limit: string } | null>(null);
  const { data: led } = useQuery({ queryKey: ["cust-ledger", sel], queryFn: () => getCustomerLedger({ data: { id: sel! } }), enabled: !!sel });

  const all = data?.customers ?? [];
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter((c) => (!onlyDue || Math.abs(c.balance) > 0.009) && (!t || `${c.name} ${c.phone} ${c.city}`.toLowerCase().includes(t))).sort((a, b) => b.balance - a.balance);
  }, [all, q, onlyDue]);
  const cur = all.find((c) => c.id === sel);
  const receivable = all.reduce((s, c) => s + Math.max(0, c.balance), 0);

  const refresh = () => { qc.invalidateQueries({ queryKey: ["cust-bal"] }); qc.invalidateQueries({ queryKey: ["cust-ledger"] }); };
  const lockRef = useRef(false);
  const opRef = useRef(newRef());
  const receive = async () => {
    const a = Number(pay.amount);
    if (!sel || !(a > 0) || lockRef.current) return;
    lockRef.current = true;
    try {
      await partyPayment({ data: { kind: "receipt", partyId: sel, amount: a, method: pay.method, note: pay.note || undefined, clientRef: opRef.current } });
      opRef.current = newRef();
      toast.success(`Payment ${rs(a)} received`);
      if (cur) pc.afterSave({ kind: "receipt", title: "Payment Receipt", number: `RCPT-${Date.now().toString().slice(-6)}`, date: new Date(), party: { label: "Received from", name: cur.name, phone: cur.phone }, payments: [{ method: pay.method, amount: a }], totals: [{ label: "Amount received", value: a, bold: true }, { label: "Balance after payment", value: Math.max(0, cur.balance - a) }], notes: pay.note || undefined }, "receipt");
      setPay({ amount: "", method: "Cash", note: "" });
      refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Payment could not be saved. Please try again."); } finally { lockRef.current = false; }
  };
  const saveAcct = async () => {
    if (!sel || !acct) return;
    try {
      await saveCustomerAccount({ data: { id: sel, openingBalance: Number(acct.opening) || 0, creditLimit: acct.limit.trim() ? Number(acct.limit) || 0 : null } });
      toast.success("Saved"); setAcct(null); refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };
  const printStatement = () => {
    if (!led || !cur) return;
    pc.preview({
      kind: "statement", title: "Customer Statement", number: cur.name, date: new Date(),
      party: { label: "Customer", name: cur.name, phone: cur.phone, address: [led.customer.address, cur.city].filter(Boolean).join(", ") },
      meta: [["Credit limit", cur.creditLimit == null ? "-" : rs(cur.creditLimit)]],
      table: { head: ["Date", "Detail", "Ref", "Debit", "Credit", "Balance"], align: ["l", "l", "l", "r", "r", "r"], rows: [["", "Opening balance", "", "", "", led.opening], ...led.rows.map((r) => [new Date(r.date).toLocaleDateString("en-PK"), r.kind, r.ref, r.debit || "", r.credit || "", r.balance] as (string | number)[])] },
      totals: [{ label: "Closing balance (baqaya)", value: cur.balance, bold: true }],
    });
  };
  const whatsapp = () => {
    if (!cur) return;
    const ph = cur.phone.replace(/\D/g, "").replace(/^0/, "92");
    const tpl = cfg.customers.reminderText || "Assalam o Alaikum {name}, your outstanding balance is {balance}. Thank you.";
    const msg = tpl.replace(/\{name\}/g, cur.name).replace(/\{balance\}/g, `Rs ${cur.balance.toLocaleString("en-PK")}`);
    window.open(`https://wa.me/${ph}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <AppShell title="Customer Ledger" subtitle="Credit and payments" active="/pos">
      {pc.node}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-8 pt-3">
        <PosSubnav />
        <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr]">
          <section className="space-y-2 rounded-xl border border-border bg-card p-3">
            <p className="text-sm font-bold text-foreground">Total receivable: <span className="text-destructive">{rs(receivable)}</span></p>
            <label className="flex h-10 items-center gap-2 rounded-lg border border-border px-3 focus-within:border-primary">
              <Search className="size-4 text-primary" />
              <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, phone or city" />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={onlyDue} onChange={(e) => setOnlyDue(e.target.checked)} /> Only customers with outstanding balance</label>
            <ul className="max-h-[30rem] space-y-1 overflow-y-auto">
              {list.slice(0, 300).map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => { setSel(c.id); setAcct(null); }} className={`flex w-full items-center justify-between gap-2 rounded-lg border p-2 text-left text-sm ${sel === c.id ? "border-primary bg-accent" : "border-border"}`}>
                    <span className="min-w-0"><b className="block truncate text-foreground">{c.name || c.phone}</b><span className="text-xs text-muted-foreground">{c.phone} {c.city}</span></span>
                    <span className={`shrink-0 font-semibold ${c.balance > 0 ? "text-destructive" : "text-muted-foreground"}`}>{rs(c.balance)}</span>
                  </button>
                </li>
              ))}
              {data && !list.length ? <p className="py-4 text-center text-xs text-muted-foreground">No customer found.</p> : null}
            </ul>
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-card p-3">
            {!cur ? <p className="py-10 text-center text-sm text-muted-foreground">Select a customer — ledger, payment and statement will appear here.</p> : (
              <>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-foreground">{cur.name}</p>
                    <p className="text-xs text-muted-foreground">{cur.phone} {cur.city} · Sales {rs(cur.sales)} · Paid {rs(cur.paid)}{cur.creditLimit != null ? ` · Limit ${rs(cur.creditLimit)}` : ""}</p>
                    <p className={`text-lg font-bold ${cur.balance > 0 ? "text-destructive" : "text-foreground"}`}>Outstanding {rs(cur.balance)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setAcct({ opening: String(cur.opening), limit: cur.creditLimit == null ? "" : String(cur.creditLimit) })}>Opening / Limit</Button>
                    <Button size="sm" variant="outline" onClick={printStatement}><Printer /> Statement</Button>
                    {cfg.notify.paymentReminders ? <Button size="sm" variant="outline" disabled={!cur.phone} onClick={whatsapp}><MessageCircle /> Reminder</Button> : null}
                  </div>
                </div>
                {acct ? (
                  <div className="grid gap-2 rounded-lg border border-primary p-2 sm:grid-cols-[1fr_1fr_auto]">
                    <input className={posInput} value={acct.opening} inputMode="decimal" onChange={(e) => setAcct({ ...acct, opening: e.target.value })} placeholder="Opening balance" aria-label="Opening balance" />
                    <input className={posInput} value={acct.limit} inputMode="decimal" onChange={(e) => setAcct({ ...acct, limit: e.target.value })} placeholder="Credit limit (blank = none)" aria-label="Credit limit" />
                    <Button onClick={saveAcct}>Save</Button>
                  </div>
                ) : null}
                <div className="grid gap-2 rounded-lg border border-border p-2 sm:grid-cols-[1fr_auto_1fr_auto]">
                  <input className={posInput} value={pay.amount} inputMode="decimal" onChange={(e) => setPay({ ...pay, amount: e.target.value })} placeholder="Amount received" aria-label="Receive amount" />
                  <select className={posInput} value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} aria-label="Method">{cfg.payMethods.filter((m) => m !== "Credit").map((m) => <option key={m}>{m}</option>)}</select>
                  <input className={posInput} value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} placeholder="Note" />
                  <Button onClick={receive}><Wallet /> Receive Payment</Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[34rem] text-sm">
                    <thead><tr className="text-left text-xs text-muted-foreground"><th>Date</th><th>Detail</th><th>Ref</th><th className="text-right">Debit</th><th className="text-right">Credit</th><th className="text-right">Balance</th></tr></thead>
                    <tbody>
                      <tr className="border-t border-border"><td colSpan={5} className="py-1.5">Opening balance</td><td className="text-right">{rs(led?.opening ?? 0)}</td></tr>
                      {(led?.rows ?? []).map((r, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="py-1.5 text-xs">{new Date(r.date).toLocaleDateString("en-PK")}</td><td>{r.kind}</td><td className="text-xs">{r.ref}</td>
                          <td className="text-right">{r.debit ? rs(r.debit) : ""}</td><td className="text-right">{r.credit ? rs(r.credit) : ""}</td><td className="text-right font-semibold">{rs(r.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
