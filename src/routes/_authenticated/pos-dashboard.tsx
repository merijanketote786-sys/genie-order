import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { PosSubnav, rs } from "@/components/pos-subnav";
import { usePosAccess } from "@/components/pos-access";
import { getPosDashboard, type PosDashRow } from "@/lib/pos-dashboard.functions";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle, BarChart3, Boxes, FileText, HandCoins, Landmark, Notebook, Receipt, RefreshCw,
  ShoppingCart, TrendingUp, Truck, Undo2, Users, Wallet,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { ArrowDownLeft, ArrowUpRight, Factory, Users as PartiesIcon } from "lucide-react";
import { PartiesDialog } from "@/components/parties-dialog";
import { PaymentInOutDialog } from "@/components/payment-in-out-dialog";
import { ManufactureDialog } from "@/components/manufacture-dialog";
import { useMfgStatus } from "@/components/mfg-gate";

export const Route = createFileRoute("/_authenticated/pos-dashboard")({
  head: () => ({
    meta: [
      { title: "POS Dashboard — HB Chemicals Pakistan" },
      { name: "description", content: "Sales, profit, stock, credit and cash progress for the POS at a glance." },
      { property: "og:title", content: "POS Dashboard — HB Chemicals Pakistan" },
      { property: "og:description", content: "Sales, profit, stock, credit and cash progress for the POS at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PosDashboardPage,
});

function Stat({ label, value, hint, icon, tone = "default" }: { label: string; value: string; hint?: string; icon: ReactNode; tone?: "default" | "good" | "bad" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">{label}<span className="text-primary">{icon}</span></div>
      <p className={`mt-2 font-display text-xl font-bold ${tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : "text-foreground"}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between"><h3 className="font-display text-sm font-bold text-foreground">{title}</h3>{action}</div>
      {children}
    </section>
  );
}

function RankList({ rows, qtyLabel }: { rows: PosDashRow[]; qtyLabel: string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No data yet.</p>;
  const max = Math.max(...rows.map((r) => r.amount), 1);
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.label}>
          <div className="flex justify-between gap-2 text-sm"><span className="truncate text-foreground">{r.label}</span><span className="shrink-0 font-semibold">{rs(r.amount)}</span></div>
          <div className="mt-1 flex items-center gap-2"><div className="h-1.5 flex-1 rounded bg-muted"><div className="h-1.5 rounded bg-primary" style={{ width: `${(r.amount / max) * 100}%` }} /></div><span className="text-[11px] text-muted-foreground">{r.qty} {qtyLabel}</span></div>
        </li>
      ))}
    </ul>
  );
}

const QUICK = [
  { to: "/pos", label: "New Sale", icon: ShoppingCart, perm: "view_pos" },
  { to: "/returns", label: "Sale Return", icon: Undo2, perm: "create_sale" },
  { to: "/purchases", label: "Purchase", icon: Truck, perm: "manage_purchases" },
  { to: "/expenses", label: "Expense", icon: Receipt, perm: "manage_expenses" },
  { to: "/ledger", label: "Credit", icon: HandCoins, perm: "view_balances" },
  { to: "/inventory", label: "Inventory", icon: Boxes, perm: "edit_stock" },
  { to: "/daybook", label: "Day Book", icon: Notebook, perm: "view_reports" },
  { to: "/reports", label: "Reports", icon: BarChart3, perm: "view_reports" },
  { to: "/pos-invoices", label: "Invoices", icon: FileText, perm: "view_pos" },
  { to: "/accounting", label: "Accounting", icon: Landmark, perm: "view_accounting" },
] as const;

function PosDashboardPage() {
  const { can } = usePosAccess();
  const [mfgOpen, setMfgOpen] = useState(false);
  const { data: mfg } = useMfgStatus();
  const [partiesOpen, setPartiesOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payDir, setPayDir] = useState<"in" | "out">("in");
  const q = useQuery({ queryKey: ["pos-dashboard"], queryFn: () => getPosDashboard(), staleTime: 30_000 });
  const d = q.data;
  const maxBar = d ? Math.max(1, ...d.series.map((p) => Math.max(p.sales, p.purchases))) : 1;

  return (
    <AppShell title="POS Dashboard" subtitle="Business progress at a glance" active="/pos" wide>
      <div className="space-y-4 py-4">
        <PosSubnav />
        <div className="flex flex-wrap gap-2">
          {QUICK.filter((x) => can(x.perm)).map((x) => (
            <Button key={x.to} asChild variant="outline" size="sm"><Link to={x.to}><x.icon className="size-4" /> {x.label}</Link></Button>
          ))}
          {mfg?.canManufacture ? <Button variant="outline" size="sm" onClick={() => setMfgOpen(true)}><Factory className="size-4" /> Manufacture</Button> : null}
          <ManufactureDialog open={mfgOpen} onOpenChange={setMfgOpen} />
          <Button variant="outline" size="sm" onClick={() => setPartiesOpen(true)}><PartiesIcon className="size-4" /> Parties</Button>
          <PartiesDialog open={partiesOpen} onOpenChange={setPartiesOpen} />
          <Button variant="outline" size="sm" onClick={() => { setPayDir("in"); setPayOpen(true); }}><ArrowDownLeft className="size-4" /> Payment In</Button>
          <Button variant="outline" size="sm" onClick={() => { setPayDir("out"); setPayOpen(true); }}><ArrowUpRight className="size-4" /> Payment Out</Button>
          <PaymentInOutDialog open={payOpen} onOpenChange={setPayOpen} dir={payDir} onDirChange={setPayDir} />
          <Button variant="ghost" size="sm" onClick={() => q.refetch()} disabled={q.isFetching} className="ml-auto"><RefreshCw className={`size-4 ${q.isFetching ? "animate-spin" : ""}`} /> Refresh</Button>
        </div>

        {q.isError ? <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">Dashboard could not load. Press Refresh.</p> : null}
        {!d ? <p className="p-6 text-center text-sm text-muted-foreground">{q.isLoading ? "Loading dashboard…" : ""}</p> : (
          <>
            <h3 className="text-xs font-bold uppercase text-muted-foreground">Today</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Stat label="Sales" value={rs(d.today.sales)} hint={`${d.today.bills} bills`} icon={<ShoppingCart className="size-4" />} />
              <Stat label="Profit" value={rs(d.today.profit)} hint="after returns & expenses" tone={d.today.profit >= 0 ? "good" : "bad"} icon={<TrendingUp className="size-4" />} />
              <Stat label="Cash in" value={rs(d.today.cashIn)} hint={`Out ${rs(d.today.cashOut)}`} icon={<Wallet className="size-4" />} />
              <Stat label="Returns" value={rs(d.today.returns)} icon={<Undo2 className="size-4" />} />
              <Stat label="Purchases" value={rs(d.today.purchases)} icon={<Truck className="size-4" />} />
              <Stat label="Expenses" value={rs(d.today.expenses)} hint={`${d.today.estimates} estimates today`} icon={<Receipt className="size-4" />} />
            </div>

            <h3 className="text-xs font-bold uppercase text-muted-foreground">Last 30 days & balances</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Stat label="Sales (30d)" value={rs(d.month.sales)} hint={`${d.month.bills} bills · avg ${rs(d.month.avgBill)}`} icon={<BarChart3 className="size-4" />} />
              <Stat label="Net profit (30d)" value={rs(d.month.profit)} tone={d.month.profit >= 0 ? "good" : "bad"} icon={<TrendingUp className="size-4" />} />
              <Stat label="Purchases (30d)" value={rs(d.month.purchases)} icon={<Truck className="size-4" />} />
              <Stat label="Expenses (30d)" value={rs(d.month.expenses)} icon={<Receipt className="size-4" />} />
              <Stat label="To receive" value={rs(d.receivable)} hint={`${d.unpaidBills} unpaid bills`} icon={<Users className="size-4" />} />
              <Stat label="To pay suppliers" value={rs(d.payable)} icon={<HandCoins className="size-4" />} />
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <div className="xl:col-span-2">
                <Panel title="Last 14 days — sales vs purchases">
                  <div className="flex h-44 items-end gap-1.5">
                    {d.series.map((p) => (
                      <div key={p.date} className="flex flex-1 flex-col items-center gap-1" title={`${p.date}\nSales ${rs(p.sales)}\nPurchases ${rs(p.purchases)}\nProfit ${rs(p.profit)}`}>
                        <div className="flex h-36 w-full items-end gap-0.5">
                          <div className="flex-1 rounded-t bg-primary" style={{ height: `${(Math.max(0, p.sales) / maxBar) * 100}%` }} />
                          <div className="flex-1 rounded-t bg-muted-foreground/40" style={{ height: `${(Math.max(0, p.purchases) / maxBar) * 100}%` }} />
                        </div>
                        <span className="text-[9px] text-muted-foreground">{p.date.slice(8)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-4 text-[11px] text-muted-foreground"><span className="flex items-center gap-1"><i className="size-2 rounded bg-primary" /> Sales</span><span className="flex items-center gap-1"><i className="size-2 rounded bg-muted-foreground/40" /> Purchases</span></div>
                </Panel>
              </div>
              <Panel title="Stock" action={can("edit_stock") ? <Link to="/inventory" className="text-xs text-primary">Open</Link> : null}>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div><p className="text-muted-foreground text-xs">Products</p><p className="font-bold">{d.stock.products}</p></div>
                  <div><p className="text-muted-foreground text-xs">Stock value</p><p className="font-bold">{rs(d.stock.value)}</p></div>
                  <div><p className="text-muted-foreground text-xs">Low stock</p><p className="font-bold text-warning">{d.stock.low}</p></div>
                  <div><p className="text-muted-foreground text-xs">Out of stock</p><p className="font-bold text-destructive">{d.stock.out}</p></div>
                </div>
                {d.stock.lowList.length ? (
                  <ul className="mt-3 space-y-1 border-t border-border pt-2 text-sm">
                    {d.stock.lowList.map((p) => <li key={p.name} className="flex justify-between gap-2"><span className="flex min-w-0 items-center gap-1 truncate"><AlertTriangle className="size-3 shrink-0 text-warning" />{p.name}</span><span className="shrink-0 text-muted-foreground">{p.stock} / {p.min}</span></li>)}
                  </ul>
                ) : null}
              </Panel>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Panel title="Top products (30d)"><RankList rows={d.topProducts} qtyLabel="sold" /></Panel>
              <Panel title="Top customers (30d)"><RankList rows={d.topCustomers} qtyLabel="bills" /></Panel>
              <Panel title="Payments received by method (30d)"><RankList rows={d.methods} qtyLabel="payments" /></Panel>
            </div>

            <Panel title="Recent documents" action={<Link to="/pos-invoices" className="text-xs text-primary">View all</Link>}>
              {d.recent.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground"><tr><th className="py-1">No.</th><th>Type</th><th>Party</th><th>Status</th><th className="text-right">Total</th><th className="text-right">Time</th></tr></thead>
                    <tbody>
                      {d.recent.map((r) => (
                        <tr key={r.id} className="border-t border-border">
                          <td className="py-1.5 font-medium">{r.number}</td><td className="capitalize">{r.kind}</td><td className="truncate">{r.party}</td><td className="capitalize">{r.status}</td>
                          <td className="text-right font-semibold">{rs(r.total)}</td><td className="text-right text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString("en-PK", { dateStyle: "short", timeStyle: "short" })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-muted-foreground">No documents yet.</p>}
            </Panel>
          </>
        )}
      </div>
    </AppShell>
  );
}
