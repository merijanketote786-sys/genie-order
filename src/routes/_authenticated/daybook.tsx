import { AppShell } from "@/components/app-shell";
import { PosSubnav, posInput, rs } from "@/components/pos-subnav";
import { Button } from "@/components/ui/button";
import { getDayBook } from "@/lib/ledger.functions";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { useState } from "react";
import { usePrintCenter } from "@/components/print-center";


export const Route = createFileRoute("/_authenticated/daybook")({
  head: () => ({
    meta: [
      { title: "Cash Day Book — HB Chemicals Pakistan Workspace" },
      { name: "description", content: "Opening cash, din bhar ki cash aamad/kharch aur expected closing cash." },
      { property: "og:title", content: "Cash Day Book — HB Chemicals Pakistan Workspace" },
      { property: "og:description", content: "Rozana cash hisaab." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DayBookPage,
});

const localDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function DayBookPage() {
  const [date, setDate] = useState(localDate());
  const [counted, setCounted] = useState("");
  const pc = usePrintCenter();
  const { data } = useQuery({ queryKey: ["daybook", date], queryFn: () => getDayBook({ data: { date, tzOffsetMin: new Date(`${date}T12:00:00`).getTimezoneOffset() } }) });
  const diff = counted.trim() && data ? Number(counted) - data.closing : null;

  const Stat = ({ label, value, strong }: { label: string; value: number; strong?: boolean }) => (
    <div className="rounded-lg border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className={`text-lg font-bold ${strong ? "text-primary" : "text-foreground"}`}>{rs(value)}</p></div>
  );

  return (
    <AppShell title="Cash Day Book" subtitle="Rozana cash hisaab" active="/pos">
      {pc.node}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-8 pt-3">
        <PosSubnav />
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${posInput} w-44`} type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
          <Button variant="outline" disabled={!data} onClick={() => data && pc.preview({
            kind: "report", title: "Cash Day Book", number: date, date: new Date(),
            meta: [["Opening cash", rs(data.opening)], ["Cash in", rs(data.cashIn)], ["Cash out", rs(data.cashOut)], ...Object.entries(data.byMethod).map(([k, v]) => [`${k} (net)`, rs(v)] as [string, string])],
            table: { head: ["Time", "Detail", "Method", "Note", "In", "Out"], align: ["l", "l", "l", "l", "r", "r"], rows: data.rows.map((r) => [new Date(r.time).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" }), r.kind, r.method, r.note, r.dir === "in" ? r.amount : "", r.dir === "out" ? r.amount : ""] as (string | number)[]) },
            totals: [{ label: "Expected closing cash", value: data.closing, bold: true }],
          })}><Printer /> Print</Button>
        </div>
        {data ? (
          <>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Stat label="Opening cash" value={data.opening} />
              <Stat label="Cash aaya" value={data.cashIn} />
              <Stat label="Cash gaya" value={data.cashOut} />
              <Stat label="Expected closing cash" value={data.closing} strong />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <section className="rounded-xl border border-border bg-card p-3 text-sm">
                <p className="mb-2 font-bold text-foreground">Cash breakdown</p>
                {Object.entries(data.byKind).map(([k, v]) => <p key={k} className="flex justify-between border-t border-border py-1.5"><span>{k}</span><b className={v < 0 ? "text-destructive" : ""}>{rs(v)}</b></p>)}
                {!Object.keys(data.byKind).length ? <p className="text-xs text-muted-foreground">Aaj koi cash entry nahi.</p> : null}
              </section>
              <section className="rounded-xl border border-border bg-card p-3 text-sm">
                <p className="mb-2 font-bold text-foreground">Payment method wise (net)</p>
                {Object.entries(data.byMethod).map(([k, v]) => <p key={k} className="flex justify-between border-t border-border py-1.5"><span>{k}</span><b>{rs(v)}</b></p>)}
                <div className="mt-3 flex items-center gap-2">
                  <input className={posInput} value={counted} inputMode="decimal" onChange={(e) => setCounted(e.target.value)} placeholder="Galle me gini hui cash" aria-label="Counted cash" />
                  {diff != null ? <b className={Math.abs(diff) < 0.01 ? "text-primary" : "text-destructive"}>{Math.abs(diff) < 0.01 ? "Barabar" : `${diff > 0 ? "Zyada" : "Kam"} ${rs(Math.abs(diff))}`}</b> : null}
                </div>
              </section>
            </div>
            <section className="rounded-xl border border-border bg-card p-3">
              <p className="mb-2 text-sm font-bold text-foreground">Din ki tamam entries</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-muted-foreground"><th>Time</th><th>Detail</th><th>Method</th><th>Note</th><th className="text-right">In</th><th className="text-right">Out</th></tr></thead>
                  <tbody>
                    {data.rows.map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="py-1.5 text-xs">{new Date(r.time).toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit" })}</td><td>{r.kind}</td><td>{r.method}</td><td className="text-xs">{r.note}</td>
                        <td className="text-right">{r.dir === "in" ? rs(r.amount) : ""}</td><td className="text-right">{r.dir === "out" ? rs(r.amount) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.rows.length ? <p className="py-4 text-center text-xs text-muted-foreground">Is din koi entry nahi.</p> : null}
              </div>
            </section>
          </>
        ) : <p className="py-10 text-center text-sm text-muted-foreground">Load ho raha hai…</p>}
      </div>
    </AppShell>
  );
}
