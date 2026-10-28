import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addShiftMove, closeShift, getShiftState, openShift } from "@/lib/shift.functions";
import type { ShiftSummary } from "@/lib/shift-calc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Printer, Timer } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/shifts")({
  head: () => ({ meta: [
    { title: "Shifts & Cash Drawer — HBPOS" },
    { name: "description", content: "Open and close cashier shifts, record cash in/out and print the Z-Report." },
    { property: "og:title", content: "Shifts & Cash Drawer — HBPOS" },
    { property: "og:description", content: "Cashier shift management with end-of-day Z-Report." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: ShiftsPage,
});

const money = (n: number) => Number(n ?? 0).toLocaleString("en-PK", { maximumFractionDigits: 2 });
const dt = (s: string) => new Date(s).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

function printZ(s: ShiftSummary, counted: number, openedAt: string, closedAt: string) {
  const diff = counted - s.expected;
  const row = (a: string, b: string) => `<tr><td>${a}</td><td style="text-align:right">${b}</td></tr>`;
  const methods = Object.entries(s.byMethod).map(([m, v]) => row(m.replace(/[<>&]/g, ""), money(v))).join("");
  const w = window.open("", "_blank", "width=380,height=640");
  if (!w) return toast.error("Allow popups to print");
  w.document.write(`<html><head><title>Z-Report</title><style>body{font:12px monospace;width:72mm;margin:0 auto}h3{text-align:center}table{width:100%}hr{border:0;border-top:1px dashed #000}</style></head><body>
<h3>Z-REPORT</h3><div>Opened: ${dt(openedAt)}</div><div>Closed: ${dt(closedAt)}</div><hr><table>
${row("Opening float", money(s.openingFloat))}${row("Cash received", money(s.cashReceived))}${row("Cash paid out", money(s.cashPaid))}${row("Drawer cash in", money(s.drawerIn))}${row("Drawer cash out", money(s.drawerOut))}
</table><hr><table>${row("<b>Expected cash</b>", money(s.expected))}${row("<b>Counted cash</b>", money(counted))}${row("<b>Difference</b>", money(diff))}</table><hr>
<div>Sales collected: ${money(s.salesCollected)}</div><table>${methods}</table><hr><div style="text-align:center">End of shift</div></body></html>`);
  w.document.close(); w.focus(); setTimeout(() => w.print(), 200);
}

function ShiftsPage() {
  const qc = useQueryClient();
  const fetchState = useServerFn(getShiftState);
  const q = useQuery({ queryKey: ["pos-shift"], queryFn: () => fetchState(), refetchInterval: 30000 });
  const doOpen = useServerFn(openShift), doMove = useServerFn(addShiftMove), doClose = useServerFn(closeShift);
  const [float, setFloat] = useState(""); const [amt, setAmt] = useState(""); const [note, setNote] = useState(""); const [counted, setCounted] = useState(""); const [closeNote, setCloseNote] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["pos-shift"] });
  const onErr = (e: Error) => toast.error(e.message);
  const open = useMutation({ mutationFn: () => doOpen({ data: { float: Number(float) || 0 } }), onSuccess: () => { setFloat(""); toast.success("Shift opened"); refresh(); }, onError: onErr });
  const move = useMutation({ mutationFn: (direction: "in" | "out") => doMove({ data: { shiftId: q.data!.open!.id, direction, amount: Number(amt), note } }), onSuccess: () => { setAmt(""); setNote(""); toast.success("Recorded"); refresh(); }, onError: onErr });
  const close = useMutation({ mutationFn: () => doClose({ data: { shiftId: q.data!.open!.id, counted: Number(counted) || 0, note: closeNote } }), onSuccess: (r) => { toast.success("Shift closed"); printZ(r.summary, r.counted, r.openedAt, r.closedAt); setCounted(""); setCloseNote(""); refresh(); }, onError: onErr });
  const s = q.data?.open;
  const sum = s?.summary as ShiftSummary | undefined;
  return <AppShell title="Shifts" subtitle="Cash drawer & Z-Report" active="/shifts">
    <section className="space-y-6 py-6">
      <div className="flex items-center gap-3"><Timer className="size-7 text-primary" /><h2 className="font-display text-2xl font-bold">Shift & Cash Drawer</h2></div>
      {q.isLoading ? <p className="text-muted-foreground">Loading…</p> : !s ? (
        <form className="max-w-sm space-y-3 rounded-lg border border-border p-4" onSubmit={(e) => { e.preventDefault(); open.mutate(); }}>
          <p className="font-semibold">No shift open</p>
          <label className="block text-sm">Opening cash (float)<Input inputMode="decimal" value={float} onChange={(e) => setFloat(e.target.value)} placeholder="0" autoFocus /></label>
          <Button type="submit" disabled={open.isPending} className="w-full">Open shift</Button>
        </form>
      ) : <>
        <div className="rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Open since {dt(s.opened_at)}</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[["Opening float", sum!.openingFloat], ["Cash received", sum!.cashReceived], ["Cash paid out", sum!.cashPaid], ["Drawer in", sum!.drawerIn], ["Drawer out", sum!.drawerOut], ["Non-cash", sum!.nonCash]].map(([l, v]) => <div key={l as string}><p className="text-xs text-muted-foreground">{l}</p><p className="font-semibold">{money(v as number)}</p></div>)}
          </div>
          <p className="mt-4 text-lg font-bold">Expected cash in drawer: {money(sum!.expected)}</p>
        </div>
        <div className="space-y-2 rounded-lg border border-border p-4">
          <p className="font-semibold">Cash in / cash out (drop, payout)</p>
          <div className="flex flex-wrap gap-2"><Input className="w-32" inputMode="decimal" placeholder="Amount" value={amt} onChange={(e) => setAmt(e.target.value)} /><Input className="min-w-0 flex-1" placeholder="Reason" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} /></div>
          <div className="flex gap-2"><Button variant="outline" disabled={!(Number(amt) > 0) || move.isPending} onClick={() => move.mutate("in")}>Cash in</Button><Button variant="outline" disabled={!(Number(amt) > 0) || move.isPending} onClick={() => move.mutate("out")}>Cash out</Button></div>
          {(s.moves as any[]).length > 0 && <ul className="mt-2 divide-y divide-border text-sm">{(s.moves as any[]).map((m) => <li key={m.id} className="flex justify-between py-1"><span>{m.direction === "in" ? "In" : "Out"} · {m.note ?? "—"}</span><span>{money(m.amount)}</span></li>)}</ul>}
        </div>
        <form className="max-w-sm space-y-3 rounded-lg border border-border p-4" onSubmit={(e) => { e.preventDefault(); close.mutate(); }}>
          <p className="font-semibold">Close shift</p>
          <label className="block text-sm">Counted cash<Input inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0" /></label>
          {counted !== "" && <p className="text-sm">Difference: <b>{money((Number(counted) || 0) - sum!.expected)}</b></p>}
          <Input placeholder="Note (optional)" value={closeNote} onChange={(e) => setCloseNote(e.target.value)} maxLength={300} />
          <Button type="submit" disabled={counted === "" || close.isPending} className="w-full"><Printer className="size-4" />Close & print Z-Report</Button>
        </form>
      </>}
      {(q.data?.history?.length ?? 0) > 0 && <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full text-sm"><thead><tr className="text-left text-muted-foreground"><th className="p-2">Closed</th><th className="p-2 text-right">Float</th><th className="p-2 text-right">Expected</th><th className="p-2 text-right">Counted</th><th className="p-2 text-right">Diff</th></tr></thead><tbody>
        {q.data!.history.map((h: any) => <tr key={h.id} className="border-t border-border"><td className="p-2">{dt(h.closed_at)}</td><td className="p-2 text-right">{money(h.opening_float)}</td><td className="p-2 text-right">{money(h.expected_cash)}</td><td className="p-2 text-right">{money(h.counted_cash)}</td><td className="p-2 text-right font-semibold">{money(Number(h.counted_cash) - Number(h.expected_cash))}</td></tr>)}
      </tbody></table></div>}
    </section>
  </AppShell>;
}
