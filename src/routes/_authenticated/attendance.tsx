import { AppShell } from "@/components/app-shell";
import { AttendanceDialog, LabourManager, localDate } from "@/components/attendance";
import { posInput, rs } from "@/components/pos-subnav";
import { usePosAccess } from "@/components/pos-access";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getSalarySheet, payLabour, type SalaryRow } from "@/lib/attendance.functions";
import { newRef } from "@/lib/pos-errors";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { CalendarCheck, Settings2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/attendance")({
  head: () => ({
    meta: [
      { title: "Attendance & Salary — HB Chemicals Pakistan Workspace" },
      { name: "description", content: "Labour attendance from biometric machines or manual entry, with live salary calculation linked to expenses." },
      { property: "og:title", content: "Attendance & Salary — HB Chemicals Pakistan Workspace" },
      { property: "og:description", content: "Labour attendance and automatic salary." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AttendancePage,
});

function weekStart(d: string) { const x = new Date(`${d}T00:00:00`); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return localDate(x); }

function AttendancePage() {
  const today = localDate();
  const { cfg, can, config } = usePosAccess();
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const [markOpen, setMarkOpen] = useState(false);
  const [pay, setPay] = useState<{ row: SalaryRow; kind: "salary" | "advance" } | null>(null);
  const { data } = useQuery({ queryKey: ["att-salary", from, to], queryFn: () => getSalarySheet({ data: { from, to } }) });
  const rows = (data?.rows ?? []).filter((r) => r.isActive || r.earned || r.paid || r.advances);
  const tot = rows.reduce((a, r) => ({ earned: a.earned + r.earned, adv: a.adv + r.advances, paid: a.paid + r.paid, net: a.net + r.net }), { earned: 0, adv: 0, paid: 0, net: 0 });
  const allowed = can("manage_expenses");

  return (
    <AppShell title="Attendance & Salary" subtitle="Labour attendance and live salary" active="/pos" wide>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-8 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          {allowed ? <Button onClick={() => setMarkOpen(true)}><CalendarCheck /> Mark attendance</Button> : null}
          <Button variant="outline" size="sm" onClick={() => { setFrom(weekStart(today)); setTo(today); }}>This week</Button>
          <Button variant="outline" size="sm" onClick={() => { setFrom(today.slice(0, 8) + "01"); setTo(today); }}>This month</Button>
          <input type="date" className={`${posInput} w-40`} value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
          <span className="text-sm">to</span>
          <input type="date" className={`${posInput} w-40`} value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          {can("settings") ? <Button asChild variant="ghost" size="sm" className="ml-auto"><Link to="/pos-settings"><Settings2 /> Machines & settings</Link></Button> : null}
        </div>
        {(config as unknown as { attendance?: { postExpenses?: boolean } }).attendance?.postExpenses === false ? <p className="rounded-lg border border-border bg-muted/40 p-2 text-xs text-muted-foreground">Expenses link is OFF — salary payments are recorded here only.</p> : null}

        <section className="space-y-2 rounded-xl border border-border bg-card p-3">
          <div className="flex flex-wrap gap-3 text-sm">
            <span>Earned: <b>{rs(tot.earned)}</b></span><span>Advances: <b>{rs(tot.adv)}</b></span><span>Paid: <b>{rs(tot.paid)}</b></span><span className="text-foreground">Payable: <b>{rs(tot.net)}</b></span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th>Name</th><th>Type</th><th className="text-right">Full</th><th className="text-right">Half</th><th className="text-right">Leave</th><th className="text-right">Absent</th><th className="text-right">OT hrs</th><th className="text-right">Per day</th><th className="text-right">Earned</th><th className="text-right">Advance</th><th className="text-right">Paid</th><th className="text-right">Payable</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="py-1.5 font-semibold">{r.name}</td><td className="text-xs capitalize">{r.salaryType}</td>
                    <td className="text-right">{r.full}</td><td className="text-right">{r.half}</td><td className="text-right">{r.leave}{r.leave ? <span className="text-[10px] text-muted-foreground"> ({r.paidLeaveUsed} paid)</span> : null}</td><td className="text-right">{r.absent}</td><td className="text-right">{r.otHours}</td>
                    <td className="text-right">{rs(r.perDay)}</td><td className="text-right">{rs(r.earned)}</td><td className="text-right">{rs(r.advances)}</td><td className="text-right">{rs(r.paid)}</td>
                    <td className={`text-right font-bold ${r.net < 0 ? "text-destructive" : "text-foreground"}`}>{rs(r.net)}</td>
                    <td className="whitespace-nowrap text-right">{allowed ? <><Button size="sm" variant="ghost" onClick={() => setPay({ row: r, kind: "advance" })}>Advance</Button><Button size="sm" onClick={() => setPay({ row: r, kind: "salary" })}>Pay</Button></> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data && !rows.length ? <p className="py-4 text-center text-xs text-muted-foreground">No labour yet — add below.</p> : null}
          </div>
        </section>

        {data?.payments.length ? (
          <section className="space-y-2 rounded-xl border border-border bg-card p-3">
            <h3 className="text-sm font-bold text-foreground">Payments in this period</h3>
            <table className="w-full text-sm"><tbody>
              {data.payments.map((p) => (
                <tr key={p.id} className="border-t border-border"><td className="py-1">{p.date}</td><td>{data.rows.find((r) => r.id === p.labourId)?.name}</td><td className="capitalize">{p.kind}</td><td>{p.method}</td><td className="text-xs text-muted-foreground">{p.posted ? "In expenses" : "Not in expenses"}</td><td className="text-right font-semibold">{rs(p.amount)}</td></tr>
              ))}
            </tbody></table>
          </section>
        ) : null}

        <section className="rounded-xl border border-border bg-card p-3"><LabourManager /></section>
      </div>
      <AttendanceDialog open={markOpen} onOpenChange={setMarkOpen} />
      {pay ? <PayDialog {...pay} from={from} to={to} methods={cfg.payMethods.filter((m) => m !== "Credit")} onClose={() => setPay(null)} /> : null}
    </AppShell>
  );
}

function PayDialog({ row, kind, from, to, methods, onClose }: { row: SalaryRow; kind: "salary" | "advance"; from: string; to: string; methods: string[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(kind === "salary" && row.net > 0 ? String(row.net) : "");
  const [method, setMethod] = useState(methods[0] ?? "Cash");
  const [date, setDate] = useState(localDate());
  const [note, setNote] = useState("");
  const ref = useRef(newRef());
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const a = Number(amount);
    if (!(a > 0)) return toast.error("Enter an amount");
    setBusy(true);
    try {
      const res = await payLabour({ data: { labourId: row.id, kind, amount: a, date, method, from: kind === "salary" ? from : undefined, to: kind === "salary" ? to : undefined, note: note || undefined, clientRef: ref.current } });
      toast.success(`${kind === "advance" ? "Advance" : "Salary"} ${rs(a)} saved${res.posted ? " and added to Expenses" : ""}`);
      qc.invalidateQueries({ queryKey: ["att-salary"] }); qc.invalidateQueries({ queryKey: ["expenses"] });
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[94vw] max-w-sm">
        <DialogHeader><DialogTitle>{kind === "advance" ? "Give advance" : "Pay salary"} — {row.name}</DialogTitle></DialogHeader>
        {kind === "salary" ? <p className="text-xs text-muted-foreground">Payable for {from} to {to}: <b>{rs(row.net)}</b></p> : null}
        <div className="space-y-2">
          <input className={posInput} inputMode="decimal" placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" />
          <select className={posInput} value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Method">{methods.map((m) => <option key={m}>{m}</option>)}</select>
          <input type="date" className={posInput} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
          <input className={posInput} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</Button></div>
      </DialogContent>
    </Dialog>
  );
}
