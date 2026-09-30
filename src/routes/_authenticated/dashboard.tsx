import { AppShell } from "@/components/app-shell";
import { WorkspaceHeader } from "@/components/workspace-header";
import { Button } from "@/components/ui/button";
import { getDashboard, type DashboardRank } from "@/lib/dashboard.functions";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Boxes,
  ClipboardList,
  LayoutDashboard,
  ReceiptText,
  RefreshCw,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — HB Chemicals Pakistan Workspace" },
      { name: "description", content: "Full progress of orders, invoices, customers and stock at a glance." },
      { property: "og:title", content: "Dashboard — HB Chemicals Pakistan Workspace" },
      { property: "og:description", content: "Detailed workspace progress and reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

function num(n: number) {
  return n.toLocaleString("en-PK");
}

function when(iso: string) {
  return new Date(iso).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "warning";
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <span
          className={
            tone === "success"
              ? "grid size-8 place-items-center rounded-lg bg-success/15 text-success"
              : tone === "warning"
                ? "grid size-8 place-items-center rounded-lg bg-warning/15 text-warning"
                : "grid size-8 place-items-center rounded-lg bg-primary/10 text-primary"
          }
        >
          <Icon className="size-4" />
        </span>
        <p className="truncate text-[11px] font-bold uppercase text-muted-foreground">{label}</p>
      </div>
      <p className="mt-2 font-display text-2xl font-bold text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 truncate text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function RankList({ title, rows, currency }: { title: string; rows: DashboardRank[]; currency: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h3 className="font-display text-sm font-bold text-foreground">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">No data yet.</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {rows.map((r) => (
            <li key={r.label}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm text-foreground">{r.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {num(r.count)} · {currency} {num(Math.round(r.total))}
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(r.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DashboardPage() {
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => getDashboard(), staleTime: 60_000 });
  const d = q.data;
  const cur = d?.currency ?? "Rs";
  const series = d?.series ?? [];
  const maxRevenue = Math.max(1, ...series.map((p) => p.revenue));
  const maxOrders = Math.max(1, ...series.map((p) => p.orders));

  return (
    <AppShell title="Dashboard" subtitle="Full workspace progress" active="/dashboard" wide>
      <WorkspaceHeader
        icon={LayoutDashboard}
        eyebrow="Overview"
        title="Workspace Dashboard"
        description="Detailed progress of orders, invoices, customers, payments and stock — all in one place."
        meta={["Live data", "14-day trend", "Reports"]}
      />

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-8 pt-3">
        {q.isLoading ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Dashboard loading…</p>
        ) : !d ? (
          <p className="py-16 text-center text-sm text-muted-foreground">Could not load data.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                icon={ClipboardList}
                label="Orders today"
                value={num(d.orders.today)}
                hint={`7 days: ${num(d.orders.week)} · 30 days: ${num(d.orders.month)}`}
              />
              <StatCard
                icon={TrendingUp}
                label="Revenue (30 days)"
                value={`${cur} ${num(Math.round(d.orders.revenueMonth))}`}
                hint={`Today: ${cur} ${num(Math.round(d.orders.revenueToday))}`}
                tone="success"
              />
              <StatCard
                icon={Wallet}
                label="Outstanding"
                value={`${cur} ${num(Math.round(d.invoices.amountOutstanding))}`}
                hint={`${num(d.invoices.unpaid)} unpaid invoices`}
                tone="warning"
              />
              <StatCard
                icon={Users}
                label="Customers"
                value={num(d.customers.total)}
                hint={`New (30 days): ${num(d.customers.newMonth)} · Repeat: ${num(d.customers.repeat)}`}
              />
            </div>

            <section className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-sm font-bold text-foreground">Last 14 days trend</h3>
                <p className="text-xs text-muted-foreground">
                  Highest day: {cur} {num(Math.round(maxRevenue))}
                </p>
              </div>
              <div className="mt-4 grid grid-cols-14 items-end gap-1" style={{ gridTemplateColumns: "repeat(14, minmax(0,1fr))" }}>
                {series.map((p) => (
                  <div key={p.date} className="flex flex-col items-center gap-1">
                    <div className="flex h-32 w-full items-end gap-0.5">
                      <div
                        className="flex-1 rounded-t bg-primary"
                        style={{ height: `${Math.max(2, (p.revenue / maxRevenue) * 100)}%` }}
                        title={`${p.date}: ${cur} ${num(Math.round(p.revenue))}`}
                      />
                      <div
                        className="flex-1 rounded-t bg-primary/30"
                        style={{ height: `${Math.max(2, (p.orders / maxOrders) * 100)}%` }}
                        title={`${p.date}: ${num(p.orders)} orders`}
                      />
                    </div>
                    <span className="text-[9px] text-muted-foreground">{p.date.slice(8)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-4 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-primary" /> Revenue</span>
                <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-primary/30" /> Orders</span>
              </div>
            </section>

            <div className="grid gap-3 lg:grid-cols-3">
              <section className="rounded-2xl border border-border bg-card p-4">
                <h3 className="font-display text-sm font-bold text-foreground">Orders summary</h3>
                <dl className="mt-3 space-y-2 text-sm">
                  <Row label="Total orders" value={num(d.orders.total)} />
                  <Row label="Total revenue" value={`${cur} ${num(Math.round(d.orders.revenueTotal))}`} />
                  <Row label="Average order" value={`${cur} ${num(d.orders.avgValue)}`} />
                  <Row label="COD parcels" value={`${num(d.orders.cod)} · ${cur} ${num(Math.round(d.orders.codAmount))}`} />
                  <Row label="CC parcels" value={num(d.orders.cc)} />
                </dl>
              </section>

              <section className="rounded-2xl border border-border bg-card p-4">
                <h3 className="font-display text-sm font-bold text-foreground">Invoices &amp; payments</h3>
                <dl className="mt-3 space-y-2 text-sm">
                  <Row label="Total invoices" value={num(d.invoices.total)} />
                  <Row label="This month" value={num(d.invoices.month)} />
                  <Row label="Paid" value={`${num(d.invoices.paid)} · ${cur} ${num(Math.round(d.invoices.amountPaid))}`} />
                  <Row label="Partial" value={num(d.invoices.partial)} />
                  <Row label="Unpaid" value={`${num(d.invoices.unpaid)} · ${cur} ${num(Math.round(d.invoices.amountOutstanding))}`} />
                </dl>
                <Button asChild variant="outline" size="sm" className="mt-3 w-full rounded-xl">
                  <Link to="/invoices">Open invoices</Link>
                </Button>
              </section>

              <section className="rounded-2xl border border-border bg-card p-4">
                <h3 className="font-display text-sm font-bold text-foreground">Stock &amp; rates</h3>
                <dl className="mt-3 space-y-2 text-sm">
                  <Row label="Products" value={num(d.products.total)} />
                  <Row label="Active" value={num(d.products.active)} />
                  <Row label="Low stock (&lt;5)" value={num(d.products.lowStock)} />
                  <Row label="Out of stock" value={num(d.products.outOfStock)} />
                  <Row label="Stock value" value={`${cur} ${num(Math.round(d.products.stockValue))}`} />
                </dl>
                {d.sync ? (
                  <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <RefreshCw className="size-3" /> Last sync: {when(d.sync.at!)} ({d.sync.status})
                  </p>
                ) : null}
              </section>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <RankList title="Top products" rows={d.topProducts} currency={cur} />
              <RankList title="Top cities" rows={d.cities} currency={cur} />
              <RankList title="Top customers" rows={d.topCustomers} currency={cur} />
              <RankList title="Order status" rows={d.statuses} currency={cur} />
            </div>

            {d.isAdmin && d.team.length > 0 ? (
              <section className="rounded-2xl border border-border bg-card p-4">
                <h3 className="font-display text-sm font-bold text-foreground">Team activity</h3>
                <ul className="mt-3 divide-y divide-border">
                  {d.team.map((t) => (
                    <li key={t.label} className="flex items-center justify-between gap-3 py-2">
                      <span className="truncate text-sm text-foreground">{t.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {num(t.count)} orders · {cur} {num(Math.round(t.total))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-sm font-bold text-foreground">Recent activity</h3>
                <Button asChild variant="ghost" size="sm" className="rounded-xl text-xs">
                  <Link to="/history">History</Link>
                </Button>
              </div>
              {d.activity.length === 0 ? (
                <p className="mt-3 text-xs text-muted-foreground">No records yet.</p>
              ) : (
                <ul className="mt-2 divide-y divide-border">
                  {d.activity.map((a) => (
                    <li key={a.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-2.5">
                      <span className="grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground">
                        {a.kind === "order" ? <ClipboardList className="size-4" /> : <ReceiptText className="size-4" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-foreground">{a.title}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {[a.subtitle, when(a.createdAt)].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-semibold text-foreground">
                          {a.amount == null ? "—" : `${cur} ${num(Math.round(a.amount))}`}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">{a.status || ""}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="grid grid-cols-2 gap-3 pb-4 sm:grid-cols-4">
              <QuickLink to="/" label="New order" icon={ClipboardList} />
              <QuickLink to="/invoice" label="Create invoice" icon={ReceiptText} />
              <QuickLink to="/customers" label="Customers" icon={Users} />
              <QuickLink to="/rates" label="Rates" icon={Boxes} />
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="shrink-0 font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function QuickLink({ to, label, icon: Icon }: { to: "/" | "/invoice" | "/customers" | "/rates"; label: string; icon: LucideIcon }) {
  return (
    <Link
      to={to}
      className="flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-2xl border border-border bg-card text-center text-xs font-semibold text-foreground hover:bg-accent"
    >
      <Icon className="size-4.5 text-primary" />
      {label}
    </Link>
  );
}
