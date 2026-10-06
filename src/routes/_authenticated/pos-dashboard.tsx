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
import { ItemsDialog } from "@/components/items-dialog";
import { AttendanceDialog } from "@/components/attendance";
import { CalendarCheck } from "lucide-react";
import { Package } from "lucide-react";
import { PartiesDialog } from "@/components/parties-dialog";
import { PaymentInOutDialog } from "@/components/payment-in-out-dialog";
import { ManufactureDialog } from "@/components/manufacture-dialog";
import { useMfgStatus } from "@/components/mfg-gate";
import { FullScreenPopup } from "@/components/fullscreen-popup";
import { CashCountPanel, MoneyAccountsPanel } from "@/components/money-accounts";
import { ChevronDown, LayoutGrid, Ruler, Tags } from "lucide-react";
import { lazy, Suspense, type ComponentType } from "react";
import { EmbeddedShell } from "@/components/app-shell";
import { UnitsPanel, CategoriesPanel } from "@/components/units-categories";
import { EmbeddedUnsavedCtx, UnsavedCloseDialog, type UnsavedGuardState } from "@/hooks/use-unsaved-guard";

type RouteMod = { Route: { options: { component?: unknown } } };
const embed = (load: () => Promise<RouteMod>) => lazy(async () => ({ default: (await load()).Route.options.component as ComponentType }));
const PAGES: Record<string, ComponentType> = {
  "/pos": embed(() => import("./pos")),
  "/returns": embed(() => import("./returns")),
  "/pos-invoices": embed(() => import("./pos-invoices")),
  "/purchases": embed(() => import("./purchases")),
  "/expenses": embed(() => import("./expenses")),
  "/daybook": embed(() => import("./daybook")),
  "/accounting": embed(() => import("./accounting")),
  "/inventory": embed(() => import("./inventory")),
  "/ledger": embed(() => import("./ledger")),
  "/reports": embed(() => import("./reports")),
};

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


function PosDashboardPage() {
  const { can, config } = usePosAccess();
  const [mfgOpen, setMfgOpen] = useState(false);
  const { data: mfg } = useMfgStatus();
  const [partiesOpen, setPartiesOpen] = useState(false);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [attOpen, setAttOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payDir, setPayDir] = useState<"in" | "out">("in");
  const [menuOpen, setMenuOpen] = useState(false);
  const [pop, setPop] = useState<{ title: string; kind?: "cash" | "bank" | "units" | "categories"; to?: string } | null>(null);
  const page = (to: string, title: string) => () => setPop({ title, to });
  const attOn = can("manage_expenses") && (config as unknown as { attendance?: { enabled?: boolean } }).attendance?.enabled !== false;
  type Item = { label: string; icon: typeof Wallet; run: () => void; show?: boolean };
  const G = (title: string, items: Item[]) => ({ title, items: items.filter((i) => i.show !== false) });
  const groups = [
    G("Sales", [
      { label: "New Sale", icon: ShoppingCart, run: page("/pos", "New Sale"), show: can("view_pos") },
      { label: "Sale Return", icon: Undo2, run: page("/returns", "Sale Return"), show: can("create_sale") },
      { label: "Invoices", icon: FileText, run: page("/pos-invoices", "Invoices"), show: can("view_pos") },
      { label: "Payment In", icon: ArrowDownLeft, run: () => { setPayDir("in"); setPayOpen(true); } },
    ]),
    G("Purchases", [
      { label: "Purchase", icon: Truck, run: page("/purchases", "Purchase"), show: can("manage_purchases") },
      { label: "Payment Out", icon: ArrowUpRight, run: () => { setPayDir("out"); setPayOpen(true); } },
      { label: "Expense", icon: Receipt, run: page("/expenses", "Expenses"), show: can("manage_expenses") },
    ]),
    G("Cash & Bank", [
      { label: "Cash in hand", icon: Wallet, run: () => setPop({ title: "Cash in hand — till count", kind: "cash" }), show: can("view_reports") || can("manage_expenses") },
      { label: "Bank & cash accounts", icon: Landmark, run: () => setPop({ title: "Bank & cash accounts", kind: "bank" }), show: can("view_accounting") },
      { label: "Day Book", icon: Notebook, run: page("/daybook", "Day Book"), show: can("view_reports") },
      { label: "Accounting", icon: Landmark, run: page("/accounting", "Accounting"), show: can("view_accounting") },
    ]),
    G("Stock", [
      { label: "Items", icon: Package, run: () => setItemsOpen(true) },
      { label: "Units", icon: Ruler, run: () => setPop({ title: "Units & conversions", kind: "units" }) },
      { label: "Categories", icon: Tags, run: () => setPop({ title: "Item categories", kind: "categories" }) },
      { label: "Inventory", icon: Boxes, run: page("/inventory", "Inventory"), show: can("edit_stock") },
      { label: "Manufacture", icon: Factory, run: () => setMfgOpen(true), show: !!mfg?.canManufacture },
    ]),
    G("People", [
      { label: "Parties", icon: PartiesIcon, run: () => setPartiesOpen(true) },
      { label: "Credit", icon: HandCoins, run: page("/ledger", "Credit"), show: can("view_balances") },
      { label: "Attendance", icon: CalendarCheck, run: () => setAttOpen(true), show: attOn },
    ]),
    G("Reports", [
      { label: "Reports", icon: BarChart3, run: page("/reports", "Reports"), show: can("view_reports") },
    ]),
  ];
  const q = useQuery({ queryKey: ["pos-dashboard"], queryFn: () => getPosDashboard(), staleTime: 30_000 });
  const d = q.data;
  const maxBar = d ? Math.max(1, ...d.series.map((p) => Math.max(p.sales, p.purchases))) : 1;

  return (
    <AppShell title="POS Dashboard" subtitle="Business progress at a glance" active="/pos" wide>
      <div className="space-y-4 py-4">
        <PosSubnav />
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center gap-2 p-2">
            <Button className="flex-1 justify-between" variant={menuOpen ? "default" : "outline"} onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen}>
              <span className="flex items-center gap-2"><LayoutGrid className="size-4" /> Quick actions</span><ChevronDown className={`size-4 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => q.refetch()} disabled={q.isFetching}><RefreshCw className={`size-4 ${q.isFetching ? "animate-spin" : ""}`} /> Refresh</Button>
          </div>
          {menuOpen ? (
            <div className="grid gap-3 border-t border-border p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {groups.map((g) => g.items.length ? (
                <div key={g.title}>
                  <p className="mb-1.5 text-[11px] font-bold uppercase text-muted-foreground">{g.title}</p>
                  <div className="grid gap-1.5">
                    {g.items.map((it) => <Button key={it.label} variant="outline" size="sm" className="justify-start" onClick={() => { setMenuOpen(false); it.run(); }}><it.icon className="size-4" /> {it.label}</Button>)}
                  </div>
                </div>
              ) : null)}
            </div>
          ) : null}
          <ManufactureDialog open={mfgOpen} onOpenChange={setMfgOpen} />
          <ItemsDialog open={itemsOpen} onOpenChange={setItemsOpen} />
          <AttendanceDialog open={attOpen} onOpenChange={setAttOpen} />
          <PartiesDialog open={partiesOpen} onOpenChange={setPartiesOpen} />
          <PaymentInOutDialog open={payOpen} onOpenChange={setPayOpen} dir={payDir} onDirChange={setPayDir} />
          <GuardedPopup open={!!pop} title={pop?.title ?? ""} onClose={() => { setPop(null); q.refetch(); }}>
            {pop?.kind === "cash" ? <div className="mx-auto max-w-3xl p-4"><CashCountPanel /></div>
              : pop?.kind === "bank" ? <div className="mx-auto max-w-3xl p-4"><MoneyAccountsPanel /></div>
              : pop?.kind === "units" ? <UnitsPanel />
              : pop?.kind === "categories" ? <CategoriesPanel />
              : pop?.to && PAGES[pop.to] ? <EmbedPage to={pop.to} /> : null}
          </GuardedPopup>
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
              <Stat label="To pay parties" value={rs(d.payable)} icon={<HandCoins className="size-4" />} />
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

/** Full-screen quick-action popup that warns before closing when the embedded page has unsaved entries. */
function GuardedPopup({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const [guard, setGuard] = useState<UnsavedGuardState>(null);
  const [warn, setWarn] = useState(false);
  const [saving, setSaving] = useState(false);
  const ctxValue = useMemo(() => ({ setGuard }), []);

  const requestClose = () => {
    if (guard?.dirty) setWarn(true);
    else onClose();
  };
  const leave = () => { setWarn(false); onClose(); };
  const save = async () => {
    if (!guard?.onSave) return leave();
    setSaving(true);
    try {
      await guard.onSave();
      leave();
    } catch {
      setWarn(false); // save failed (page already toasted); keep popup open
    } finally {
      setSaving(false);
    }
  };

  return (
    <EmbeddedUnsavedCtx.Provider value={ctxValue}>
      <FullScreenPopup open={open} title={title} onClose={requestClose}>{children}</FullScreenPopup>
      <UnsavedCloseDialog open={warn} saving={saving} onCancel={() => setWarn(false)} onLeave={leave} onSave={save} />
    </EmbeddedUnsavedCtx.Provider>
  );
}

function EmbedPage({ to }: { to: string }) {
  const Page = PAGES[to];
  return (
    <EmbeddedShell.Provider value={true}>
      <Suspense fallback={<p className="p-6 text-center text-sm text-muted-foreground">Opening…</p>}><Page /></Suspense>
    </EmbeddedShell.Provider>
  );
}
