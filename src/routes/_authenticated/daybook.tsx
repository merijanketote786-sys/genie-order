import { AppShell } from "@/components/app-shell";
import { PosSubnav, posInput, rs } from "@/components/pos-subnav";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cancelCashEntry, getDayBook, saveCashEntry } from "@/lib/ledger.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus, Printer, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { usePrintCenter } from "@/components/print-center";

export const Route = createFileRoute("/_authenticated/daybook")({
  head: () => ({
    meta: [
      { title: "Cash Day Book — HB Chemicals Pakistan Workspace" },
      { name: "description", content: "Opening cash, cash in/out throughout the day, manual entries and expected closing cash." },
      { property: "og:title", content: "Cash Day Book — HB Chemicals Pakistan Workspace" },
      { property: "og:description", content: "Daily cash accounting with manual entries." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DayBookPage,
});

const localDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const shift = (date: string, days: number) => { const d = new Date(`${date}T12:00:00`); d.setDate(d.getDate() + days); return localDate(d); };
const CATS_IN = ["Owner capital", "Loan received", "Other income", "Cash from bank", "Opening cash", "Other"];
const CATS_OUT = ["Owner drawing", "Loan repaid", "Cash to bank", "Petty expense", "Salary advance", "Other"];
const METHODS = ["Cash", "Bank", "JazzCash", "Easypaisa", "Card"];
const tm = (t: string) => new Date(t).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" });

function DayBookPage() {
  const [date, setDate] = useState(localDate());
  const [counted, setCounted] = useState("");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const pc = usePrintCenter();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["daybook", date], queryFn: () => getDayBook({ data: { date, tzOffsetMin: new Date(`${date}T12:00:00`).getTimezoneOffset() } }) });
  const diff = counted.trim() && data ? Number(counted) - data.closing : null;
  const rows = (data?.rows ?? []).filter((r) => !q.trim() || `${r.kind} ${r.method} ${r.note}`.toLowerCase().includes(q.toLowerCase()));

  const cancel = async (id: string) => {
    const reason = window.prompt("Reason for cancelling this entry?");
    if (reason == null) return;
    try { await cancelCashEntry({ data: { id, reason } }); toast.success("Entry cancelled"); qc.invalidateQueries({ queryKey: ["daybook"] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  };

  const Stat = ({ label, value, strong, danger }: { label: string; value: number; strong?: boolean; danger?: boolean }) => (
    <div className="rounded-lg border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className={`text-lg font-bold ${danger ? "text-destructive" : strong ? "text-primary" : "text-foreground"}`}>{rs(value)}</p></div>
  );

  return (
    <AppShell title="Cash Day Book" subtitle="Daily cash accounting" active="/pos" wide>
      {pc.node}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-8 pt-3">
        <PosSubnav />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setDate(shift(date, -1))} aria-label="Previous day"><ChevronLeft /></Button>
          <input className={`${posInput} w-40`} type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Date" />
          <Button variant="outline" size="icon" onClick={() => setDate(shift(date, 1))} aria-label="Next day"><ChevronRight /></Button>
          <Button variant="ghost" onClick={() => setDate(localDate())}>Today</Button>
          <Button onClick={() => setOpen(true)}><Plus /> Add entry</Button>
          <Button variant="outline" disabled={!data} onClick={() => data && pc.preview({
            kind: "report", title: "Cash Day Book", number: date, date: new Date(),
            meta: [["Opening cash", rs(data.opening)], ["Cash in", rs(data.cashIn)], ["Cash out", rs(data.cashOut)], ["Sales", rs(data.summary.sales)], ["Credit sales", rs(data.summary.creditSales)], ["Purchases", rs(data.summary.purchases)], ["Expenses", rs(data.summary.expenses)], ...Object.entries(data.byMethod).map(([k, v]) => [`${k} (net)`, rs(v)] as [string, string])],
            table: { head: ["Time", "Detail", "Method", "Note", "In", "Out"], align: ["l", "l", "l", "l", "r", "r"], rows: data.rows.map((r) => [tm(r.time), r.kind, r.method, r.note, r.dir === "in" ? r.amount : "", r.dir === "out" ? r.amount : ""] as (string | number)[]) },
            totals: [{ label: "Expected closing cash", value: data.closing, bold: true }],
          })}><Printer /> Print</Button>
        </div>
        {data ? (
          <>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Stat label="Opening cash" value={data.opening} />
              <Stat label="Cash in" value={data.cashIn} />
              <Stat label="Cash out" value={data.cashOut} />
              <Stat label="Expected closing cash" value={data.closing} strong danger={data.closing < 0} />
            </div>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-6">
              <Stat label="Total sales" value={data.summary.sales} />
              <Stat label="Credit sales (udhaar)" value={data.summary.creditSales} />
              <Stat label="Sales returns" value={data.summary.salesReturns} />
              <Stat label="Purchases" value={data.summary.purchases} />
              <Stat label="Credit purchases" value={data.summary.creditPurchases} />
              <Stat label="Expenses" value={data.summary.expenses} />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <section className="rounded-xl border border-border bg-card p-3 text-sm">
                <p className="mb-2 font-bold text-foreground">Cash breakdown</p>
                {Object.entries(data.byKind).map(([k, v]) => <p key={k} className="flex justify-between border-t border-border py-1.5"><span>{k}</span><b className={v < 0 ? "text-destructive" : ""}>{rs(v)}</b></p>)}
                {!Object.keys(data.byKind).length ? <p className="text-xs text-muted-foreground">No cash entries today.</p> : null}
              </section>
              <section className="rounded-xl border border-border bg-card p-3 text-sm">
                <p className="mb-2 font-bold text-foreground">Payment method wise (net)</p>
                {Object.entries(data.byMethod).map(([k, v]) => <p key={k} className="flex justify-between border-t border-border py-1.5"><span>{k}</span><b>{rs(v)}</b></p>)}
                <div className="mt-3 flex items-center gap-2">
                  <input className={posInput} value={counted} inputMode="decimal" onChange={(e) => setCounted(e.target.value)} placeholder="Cash counted in the till" aria-label="Counted cash" />
                  {diff != null ? <b className={Math.abs(diff) < 0.01 ? "text-primary" : "text-destructive"}>{Math.abs(diff) < 0.01 ? "Matched" : `${diff > 0 ? "Excess" : "Short"} ${rs(Math.abs(diff))}`}</b> : null}
                </div>
              </section>
            </div>
            <section className="rounded-xl border border-border bg-card p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-foreground">All money entries for the day</p>
                <input className={`${posInput} w-56`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search entries" aria-label="Search entries" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-muted-foreground"><th>Time</th><th>Detail</th><th>Method</th><th>Note</th><th className="text-right">In</th><th className="text-right">Out</th><th /></tr></thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="py-1.5 text-xs">{tm(r.time)}</td><td>{r.kind}</td><td>{r.method}</td><td className="text-xs">{r.note}</td>
                        <td className="text-right">{r.dir === "in" ? rs(r.amount) : ""}</td><td className="text-right">{r.dir === "out" ? rs(r.amount) : ""}</td>
                        <td className="text-right">{r.manualId ? <Button size="icon" variant="ghost" onClick={() => cancel(r.manualId!)} aria-label="Cancel entry"><X /></Button> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!rows.length ? <p className="py-4 text-center text-xs text-muted-foreground">No entries for this day.</p> : null}
              </div>
            </section>
            <section className="rounded-xl border border-border bg-card p-3">
              <p className="mb-2 text-sm font-bold text-foreground">Bills of the day</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-muted-foreground"><th>Time</th><th>Type</th><th>No.</th><th>Party</th><th className="text-right">Total</th><th className="text-right">Paid</th><th className="text-right">Balance</th></tr></thead>
                  <tbody>
                    {data.docs.map((d, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="py-1.5 text-xs">{tm(d.time)}</td><td>{d.type}</td><td>{d.number}</td><td>{d.party}</td>
                        <td className="text-right">{rs(d.total)}</td><td className="text-right">{rs(d.paid)}</td><td className={`text-right ${d.balance > 0 ? "text-destructive" : ""}`}>{rs(d.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.docs.length ? <p className="py-4 text-center text-xs text-muted-foreground">No bills for this day.</p> : null}
              </div>
            </section>
            {data.manual.some((m) => m.status === "cancelled") ? (
              <section className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
                <p className="mb-1 font-bold">Cancelled manual entries</p>
                {data.manual.filter((m) => m.status === "cancelled").map((m) => <p key={m.id}>{m.direction === "in" ? "In" : "Out"} · {m.category} · {rs(m.amount)} · {m.note}</p>)}
              </section>
            ) : null}
          </>
        ) : <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>}
      </div>
      <EntryDialog open={open} onOpenChange={setOpen} date={date} accounts={data?.accounts ?? []} onSaved={() => qc.invalidateQueries({ queryKey: ["daybook"] })} />
    </AppShell>
  );
}

function EntryDialog({ open, onOpenChange, date, accounts, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; date: string; accounts: { id: string; label: string }[]; onSaved: () => void }) {
  const [dir, setDir] = useState<"in" | "out">("in");
  const [d, setD] = useState(date);
  const [method, setMethod] = useState("Cash");
  const [cat, setCat] = useState("Other");
  const [party, setParty] = useState("");
  const [acc, setAcc] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [ref, setRef] = useState(() => crypto.randomUUID());
  const cats = dir === "in" ? CATS_IN : CATS_OUT;
  const save = async () => {
    const amt = Number(amount);
    if (!(amt > 0)) { toast.error("Enter an amount"); return; }
    setBusy(true);
    try {
      await saveCashEntry({ data: { date: d, direction: dir, method, category: cat, party: party || undefined, accountId: acc || undefined, amount: amt, note: note || undefined, clientRef: ref } });
      toast.success("Entry saved");
      setAmount(""); setNote(""); setParty(""); setRef(crypto.randomUUID());
      onSaved(); onOpenChange(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (o) setD(date); onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add day book entry</DialogTitle></DialogHeader>
        <div className="space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <Button variant={dir === "in" ? "default" : "outline"} onClick={() => { setDir("in"); setCat("Other"); }}>Money in</Button>
            <Button variant={dir === "out" ? "destructive" : "outline"} onClick={() => { setDir("out"); setCat("Other"); }}>Money out</Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1"><span className="text-xs text-muted-foreground">Date</span><input className={posInput} type="date" value={d} onChange={(e) => setD(e.target.value)} /></label>
            <label className="space-y-1"><span className="text-xs text-muted-foreground">Amount</span><input className={posInput} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" autoFocus /></label>
            <label className="space-y-1"><span className="text-xs text-muted-foreground">Method</span><select className={posInput} value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select></label>
            <label className="space-y-1"><span className="text-xs text-muted-foreground">Category</span><select className={posInput} value={cat} onChange={(e) => setCat(e.target.value)}>{cats.map((c) => <option key={c}>{c}</option>)}</select></label>
          </div>
          <label className="block space-y-1"><span className="text-xs text-muted-foreground">Accounting head (optional)</span>
            <select className={posInput} value={acc} onChange={(e) => setAcc(e.target.value)}><option value="">Automatic</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
          <label className="block space-y-1"><span className="text-xs text-muted-foreground">Person / party (optional)</span><input className={posInput} value={party} onChange={(e) => setParty(e.target.value)} /></label>
          <label className="block space-y-1"><span className="text-xs text-muted-foreground">Note</span><input className={posInput} value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} /></label>
          <Button className="w-full" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save entry"}</Button>
          <p className="text-xs text-muted-foreground">Entry also posts automatically to Accounting (journal) and appears in the ledger.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
