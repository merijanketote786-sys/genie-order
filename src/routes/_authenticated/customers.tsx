import { AppShell } from "@/components/app-shell";
import { WorkspaceHeader } from "@/components/workspace-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type CustomerRow, getCustomerDetail, listCustomers } from "@/lib/records.functions";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Search, Users } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/customers")({
  head: () => ({
    meta: [
      { title: "Customers — OrderBot" },
      { name: "description", content: "Customer record: phone, city, address aur unke purane orders." },
      { property: "og:title", content: "Customers — OrderBot" },
      { property: "og:description", content: "Customer record aur unke purane orders." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CustomersPage,
});

const money = (n: number) => n.toLocaleString("en-PK");
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-PK", { dateStyle: "medium" }) : "—";

function CustomersPage() {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const customers = useQuery({
    queryKey: ["customers", term],
    queryFn: () => listCustomers({ data: { search: term || undefined } }),
  });

  const rows = customers.data?.customers ?? [];

  return (
    <AppShell title="Customers" subtitle="Customer record" active="/customers">
      <WorkspaceHeader
        icon={Users}
        eyebrow="Records"
        title="Customers"
        description="Har order se customer khud record ho jata hai — phone, city, address aur kharch ka hisaab."
        meta={["Auto-saved", "Order history", "Search"]}
      />

      <form
        className="flex gap-2 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          setTerm(search.trim());
        }}
      >
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Naam, phone ya city"
          className="h-12 rounded-2xl"
        />
        <Button type="submit" className="h-12 gap-1.5 rounded-2xl px-4">
          <Search className="size-4" /> <span className="hidden sm:inline">Search</span>
        </Button>
      </form>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-6">
        {customers.isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Load ho raha hai…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-3xl border border-border bg-card p-8 text-center">
            <h3 className="font-display text-base font-bold text-foreground">Koi customer nahi</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Order save hote hi customer yahan khud aa jayega.
            </p>
          </div>
        ) : (
          rows.map((c: CustomerRow) => (
            <article key={c.id} className="rounded-3xl border border-border bg-card">
              <button
                type="button"
                onClick={() => setOpenId(openId === c.id ? null : c.id)}
                className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 text-left"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {c.name || "Bina naam"}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[c.phone, c.city].filter(Boolean).join(" · ")}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {c.address || ""}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-display text-base font-bold text-foreground">
                    {money(c.totalSpent)}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {c.orderCount} orders · {day(c.lastOrderAt)}
                  </span>
                </span>
              </button>
              {openId === c.id ? <CustomerDetail id={c.id} /> : null}
            </article>
          ))
        )}
      </div>
    </AppShell>
  );
}

function CustomerDetail({ id }: { id: string }) {
  const detail = useQuery({
    queryKey: ["customer-detail", id],
    queryFn: () => getCustomerDetail({ data: { id } }),
  });

  if (detail.isLoading) {
    return <p className="border-t border-border px-4 py-4 text-sm text-muted-foreground">Load ho raha hai…</p>;
  }

  const orders = detail.data?.orders ?? [];
  const invoices = detail.data?.invoices ?? [];

  return (
    <div className="grid gap-4 border-t border-border p-4 sm:grid-cols-2">
      <div>
        <p className="text-[11px] font-bold uppercase text-muted-foreground">Orders</p>
        <ul className="mt-2 space-y-1.5">
          {orders.length === 0 ? (
            <li className="text-sm text-muted-foreground">Koi order nahi</li>
          ) : (
            orders.map((o: any) => (
              <li key={o.id} className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-foreground">
                <span className="block truncate font-semibold">{o.product || "—"}</span>
                <span className="text-muted-foreground">
                  {day(o.created_at)} · {o.product_total ?? "—"}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
      <div>
        <p className="text-[11px] font-bold uppercase text-muted-foreground">Invoices</p>
        <ul className="mt-2 space-y-1.5">
          {invoices.length === 0 ? (
            <li className="text-sm text-muted-foreground">Koi invoice nahi</li>
          ) : (
            invoices.map((i: any) => (
              <li key={i.id} className="rounded-xl bg-surface-2 px-3 py-2 text-xs text-foreground">
                <span className="block truncate font-semibold">{i.invoice_number}</span>
                <span className="text-muted-foreground">
                  {day(i.created_at)} · {i.total ?? "—"} · {i.payment_status}
                </span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
