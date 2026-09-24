import { AppShell } from "@/components/app-shell";
import { PosSubnav, posInput, rs } from "@/components/pos-subnav";
import { Button } from "@/components/ui/button";
import { EXPENSE_CATEGORIES, cancelExpense, listExpenses, saveExpense } from "@/lib/ledger.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { newRef } from "@/lib/pos-errors";
import { usePrintCenter } from "@/components/print-center";
import { usePosAccess } from "@/components/pos-access";

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({
    meta: [
      { title: "Expenses — HB Chemicals Pakistan Workspace" },
      { name: "description", content: "Record expenses like rent, electricity, salary, courier etc. and see category-wise totals." },
      { property: "og:title", content: "Expenses — HB Chemicals Pakistan Workspace" },
      { property: "og:description", content: "Record of business expenses." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExpensesPage,
});

const localDate = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function ExpensesPage() {
  const qc = useQueryClient();
  const pc = usePrintCenter();
  const { cfg } = usePosAccess();
  const today = localDate();
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const [f, setF] = useState({ category: "Rent", amount: "", date: today, method: "Cash", description: "" });
  const { data } = useQuery({ queryKey: ["expenses", from, to], queryFn: () => listExpenses({ data: { from, to } }) });
  const rows = data?.expenses ?? [];
  const active = rows.filter((r) => r.status !== "cancelled");
  const byCat: Record<string, number> = {};
  for (const r of active) byCat[r.category] = (byCat[r.category] ?? 0) + r.amount;

  const lockRef = useRef(false);
  const opRef = useRef(newRef());
  const add = async () => {
    const a = Number(f.amount);
    if (!(a > 0)) return toast.error("Enter an amount");
    if (lockRef.current) return;
    lockRef.current = true;
    try {
      await saveExpense({ data: { category: f.category, amount: a, date: f.date, method: f.method, description: f.description || undefined, clientRef: opRef.current } });
      opRef.current = newRef();
      toast.success(`Expense ${rs(a)} saved`);
      setF({ ...f, amount: "", description: "" });
      qc.invalidateQueries({ queryKey: ["expenses"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save expense. Please try again."); } finally { lockRef.current = false; }
  };

  return (
    <AppShell title="Expenses" subtitle="Business expenses" active="/pos">
      {pc.node}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-8 pt-3">
        <PosSubnav />
        <section className="grid gap-2 rounded-xl border border-border bg-card p-3 sm:grid-cols-3 lg:grid-cols-6">
          <select className={posInput} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} aria-label="Category">{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          <input className={posInput} value={f.amount} inputMode="decimal" onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="Amount" aria-label="Amount" />
          <input className={posInput} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label="Date" />
          <select className={posInput} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} aria-label="Method">{cfg.payMethods.filter((m) => m !== "Credit").map((m) => <option key={m}>{m}</option>)}</select>
          <input className={posInput} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Detail" />
          <Button className="h-10" onClick={add}><Plus /> Expense add</Button>
        </section>

        <section className="space-y-3 rounded-xl border border-border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <input className={`${posInput} w-40`} type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
            <span>to</span>
            <input className={`${posInput} w-40`} type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
            <b className="ml-auto text-foreground">Total: {rs(active.reduce((s, r) => s + r.amount, 0))}</b>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(byCat).map(([k, v]) => <span key={k} className="rounded-full border border-border px-3 py-1 text-xs">{k}: <b>{rs(v)}</b></span>)}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th>Date</th><th>Category</th><th>Detail</th><th>Method</th><th className="text-right">Amount</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={`border-t border-border ${r.status === "cancelled" ? "opacity-50 line-through" : ""}`}>
                    <td className="py-1.5">{r.date}</td><td>{r.category}</td><td className="text-xs">{r.description}</td><td>{r.method}</td><td className="text-right font-semibold">{rs(r.amount)}</td>
                    <td className="whitespace-nowrap text-right"><Button size="sm" variant="ghost" onClick={() => pc.preview({ kind: "expense", id: r.id, title: "Expense Voucher", number: `EXP-${r.id.slice(0, 6).toUpperCase()}`, date: r.date, meta: [["Category", r.category], ["Method", r.method], ["Status", r.status]], notes: r.description || undefined, totals: [{ label: "Amount", value: r.amount, bold: true }] })}>Print</Button>{r.status !== "cancelled" ? <Button size="sm" variant="ghost" onClick={async () => { if (!confirm("Cancel this expense?")) return; await cancelExpense({ data: { id: r.id } }); qc.invalidateQueries({ queryKey: ["expenses"] }); }}>Cancel</Button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data && !rows.length ? <p className="py-4 text-center text-xs text-muted-foreground">No expenses in this period.</p> : null}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
