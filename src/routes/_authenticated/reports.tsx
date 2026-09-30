import { AppShell } from "@/components/app-shell";
import { PosSubnav, posInput, rs } from "@/components/pos-subnav";
import { Button } from "@/components/ui/button";
import { getReport } from "@/lib/inventory.functions";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, FileSpreadsheet, Printer } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Reports — HB Chemicals Pakistan Workspace" },
      { name: "description", content: "Sales, profit & loss, purchases, expenses, stock and best-selling reports — from real data." },
      { property: "og:title", content: "Reports — HB Chemicals Pakistan Workspace" },
      { property: "og:description", content: "Business reports aur P&L." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

const ld = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
function range(k: string): [string, string] {
  const t = new Date(); const d = (x: number) => new Date(t.getFullYear(), t.getMonth(), t.getDate() + x);
  if (k === "yesterday") return [ld(d(-1)), ld(d(-1))];
  if (k === "week") return [ld(d(-((t.getDay() + 6) % 7))), ld(t)];
  if (k === "month") return [ld(new Date(t.getFullYear(), t.getMonth(), 1)), ld(t)];
  if (k === "lastmonth") return [ld(new Date(t.getFullYear(), t.getMonth() - 1, 1)), ld(new Date(t.getFullYear(), t.getMonth(), 0))];
  return [ld(t), ld(t)];
}
const PRESETS = [["today", "Today"], ["yesterday", "Yesterday"], ["week", "This week"], ["month", "This month"], ["lastmonth", "Last month"]] as const;

function ReportsPage() {
  const [[from, to], setRange] = useState<[string, string]>(range("month"));
  const { data, isFetching } = useQuery({ queryKey: ["report", from, to], queryFn: () => getReport({ data: { from, to, tzOffsetMin: new Date().getTimezoneOffset() } }) });
  const s = data?.summary;

  const download = (kind: "csv" | "xlsx") => {
    if (!data || !s) return;
    const sheets: Record<string, (string | number)[][]> = {
      Summary: [["Report", `${from} to ${to}`], ...Object.entries(s).map(([k, v]) => [k, v])],
      Daily: [["Date", "Net sales"], ...data.daily.map((d) => [d.date, d.sales])],
      Items: [["Item", "Qty", "Amount", "Profit"], ...data.items.map((i) => [i.name, i.qty, i.amount, i.profit])],
      Customers: [["Customer", "Sales"], ...data.byCustomer.map((x) => [x.name, x.amount])],
      Expenses: [["Category", "Amount"], ...data.expenses.map((x) => [x.name, x.amount])],
      LowStock: [["Product", "Stock", "Min"], ...data.lowStock.map((x) => [x.name, x.stock, x.min])],
    };
    if (kind === "csv") {
      const csv = Object.entries(sheets).map(([n, rows]) => [[n], ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n")).join("\n\n");
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `report-${from}-${to}.csv`; a.click();
      return;
    }
    void import("xlsx").then((X) => {
      const wb = X.utils.book_new();
      for (const [n, rows] of Object.entries(sheets)) X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(rows), n);
      X.writeFile(wb, `report-${from}-${to}.xlsx`);
    });
  };

  const Card = ({ l, v, tone }: { l: string; v: number; tone?: "good" | "bad" }) => (
    <div className="rounded-lg border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{l}</p><p className={`text-lg font-bold ${tone === "bad" ? "text-destructive" : tone === "good" ? "text-primary" : "text-foreground"}`}>{rs(v)}</p></div>
  );
  const List = ({ title, rows }: { title: string; rows: { name: string; amount: number }[] }) => (
    <section className="rounded-xl border border-border bg-card p-3 text-sm">
      <p className="mb-2 font-bold text-foreground">{title}</p>
      {rows.map((r) => <p key={r.name} className="flex justify-between gap-2 border-t border-border py-1.5"><span className="truncate">{r.name}</span><b>{rs(r.amount)}</b></p>)}
      {!rows.length ? <p className="text-xs text-muted-foreground">No data.</p> : null}
    </section>
  );
  const maxDay = Math.max(1, ...(data?.daily ?? []).map((d) => Math.abs(d.sales)));

  return (
    <AppShell title="Reports" subtitle="Sales, profit, stock" active="/pos" wide>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-8 pt-3">
        <PosSubnav />
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map(([k, l]) => <Button key={k} size="sm" variant="outline" onClick={() => setRange(range(k))}>{l}</Button>)}
          <input className={`${posInput} w-40`} type="date" value={from} onChange={(e) => setRange([e.target.value, to])} aria-label="From" />
          <input className={`${posInput} w-40`} type="date" value={to} onChange={(e) => setRange([from, e.target.value])} aria-label="To" />
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => download("csv")}><Download /> CSV</Button>
            <Button size="sm" variant="outline" onClick={() => download("xlsx")}><FileSpreadsheet /> Excel</Button>
            <Button size="sm" variant="outline" onClick={() => window.print()}><Printer /> Print / PDF</Button>
          </div>
        </div>
        {!s ? <p className="py-10 text-center text-sm text-muted-foreground">{isFetching ? "Building report…" : "No data"}</p> : (
          <>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Card l={`Net sales (${s.bills} bills)`} v={s.netSales} /><Card l="Gross profit" v={s.grossProfit} tone="good" /><Card l="Expenses" v={s.expenses} tone="bad" /><Card l="Net profit" v={s.netProfit} tone={s.netProfit < 0 ? "bad" : "good"} />
              <Card l="Purchases" v={s.purchases} /><Card l="Credit sales (outstanding)" v={s.creditSales} /><Card l="Stock value (cost)" v={s.stockValue} /><Card l="Stock value (sale)" v={s.stockSaleValue} />
            </div>
            <section className="rounded-xl border border-border bg-card p-3 text-sm">
              <p className="mb-2 font-bold text-foreground">Profit &amp; Loss</p>
              {[["Gross sales", s.grossSales], ["− Sale returns", -s.returns], ["= Net sales", s.netSales], ["− Cost of goods", -s.cost], ["= Gross profit", s.grossProfit], ["− Expenses", -s.expenses], ["= Net profit", s.netProfit]].map(([l, v]) => (
                <p key={l as string} className={`flex justify-between border-t border-border py-1.5 ${(l as string).startsWith("=") ? "font-bold text-foreground" : ""}`}><span>{l}</span><span>{rs(v as number)}</span></p>
              ))}
              <p className="mt-1 text-xs text-muted-foreground">Discount {rs(s.discount)} · Tax {rs(s.tax)} · Purchase returns {rs(s.purchaseReturns)} · Out of stock {s.outOfStock}. Cost is based on the purchase price of products where a price is available.</p>
            </section>
            <section className="rounded-xl border border-border bg-card p-3">
              <p className="mb-2 text-sm font-bold text-foreground">Daily net sales</p>
              <div className="flex h-36 items-end gap-1 overflow-x-auto">
                {data.daily.map((d) => (
                  <div key={d.date} className="flex min-w-6 flex-1 flex-col items-center justify-end" title={`${d.date}: ${rs(d.sales)}`}>
                    <div className="w-full rounded-t bg-primary" style={{ height: `${(Math.max(0, d.sales) / maxDay) * 100}%` }} />
                    <span className="mt-1 text-[10px] text-muted-foreground">{d.date.slice(8)}</span>
                  </div>
                ))}
                {!data.daily.length ? <p className="m-auto text-xs text-muted-foreground">No sales in this period.</p> : null}
              </div>
            </section>
            <section className="rounded-xl border border-border bg-card p-3">
              <p className="mb-2 text-sm font-bold text-foreground">Best-selling items</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-muted-foreground"><th>Item</th><th className="text-right">Qty</th><th className="text-right">Sale</th><th className="text-right">Profit</th></tr></thead>
                  <tbody>{data.items.map((i) => <tr key={i.name} className="border-t border-border"><td className="py-1.5">{i.name}</td><td className="text-right">{i.qty}</td><td className="text-right">{rs(i.amount)}</td><td className="text-right">{rs(i.profit)}</td></tr>)}</tbody>
                </table>
                {!data.items.length ? <p className="py-3 text-center text-xs text-muted-foreground">No items.</p> : null}
              </div>
            </section>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <List title="Category wise sale" rows={data.byCategory} />
              <List title="Top customers" rows={data.byCustomer} />
              <List title="Staff wise sale" rows={data.byStaff} />
              <List title="Expenses category wise" rows={data.expenses} />
              <section className="rounded-xl border border-border bg-card p-3 text-sm">
                <p className="mb-2 font-bold text-foreground">Payment method (in / out)</p>
                {data.byMethod.map((m) => <p key={m.method} className="flex justify-between border-t border-border py-1.5"><span>{m.method}</span><span>{rs(m.in)} / {rs(m.out)}</span></p>)}
                {!data.byMethod.length ? <p className="text-xs text-muted-foreground">No data.</p> : null}
              </section>
              <section className="rounded-xl border border-border bg-card p-3 text-sm">
                <p className="mb-2 font-bold text-foreground">Low stock ({data.lowStock.length})</p>
                {data.lowStock.slice(0, 30).map((x) => <p key={x.name} className="flex justify-between border-t border-border py-1.5"><span className="truncate">{x.name}</span><b className="text-destructive">{x.stock} / {x.min}</b></p>)}
                {!data.lowStock.length ? <p className="text-xs text-muted-foreground">Set min stock (in Inventory) to see alerts here.</p> : null}
              </section>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
