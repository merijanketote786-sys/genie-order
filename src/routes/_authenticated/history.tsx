import { AppShell } from "@/components/app-shell";
import { WorkspaceHeader } from "@/components/workspace-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResultCard } from "@/components/result-card";
import { type OrderRow, deleteOrder, listOrders } from "@/lib/records.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { History, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({
    meta: [
      { title: "Order History — OrderBot" },
      { name: "description", content: "All saved orders in one place — search, copy and WhatsApp." },
      { property: "og:title", content: "Order History — OrderBot" },
      { property: "og:description", content: "All saved orders in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HistoryPage,
});

function money(n: number | null) {
  return n == null ? "—" : n.toLocaleString("en-PK");
}

function when(iso: string) {
  return new Date(iso).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });
}

function HistoryPage() {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const qc = useQueryClient();

  const orders = useQuery({
    queryKey: ["orders", term],
    queryFn: () => listOrders({ data: { search: term || undefined } }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteOrder({ data: { id } }),
    onSuccess: () => {
      toast.success("Order deleted");
      qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = orders.data?.orders ?? [];

  return (
    <AppShell title="Order History" subtitle="Record of saved orders" active="/history" wide>
      <WorkspaceHeader
        icon={History}
        eyebrow="Records"
        title="Order History"
        description="Every saved order is kept here — search, copy or send it on WhatsApp."
        meta={["Shared record", "Search", "WhatsApp"]}
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
          placeholder="Search by name, phone, city or product"
          className="h-12 rounded-2xl"
        />
        <Button type="submit" className="h-12 gap-1.5 rounded-2xl px-4">
          <Search className="size-4" /> <span className="hidden sm:inline">Search</span>
        </Button>
      </form>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-6">
        {orders.isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-3xl border border-border bg-card p-8 text-center">
            <h3 className="font-display text-base font-bold text-foreground">No orders found</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Create an order from the Order section — it will be saved here automatically.
            </p>
          </div>
        ) : (
          rows.map((o: OrderRow) => (
            <article key={o.id} className="rounded-3xl border border-border bg-card">
              <button
                type="button"
                onClick={() => setOpenId(openId === o.id ? null : o.id)}
                className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 text-left"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {o.customerName || "No name"} {o.orderNumber ? `· ${o.orderNumber}` : ""}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[o.phone, o.city, o.product].filter(Boolean).join(" · ") || "—"}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">{when(o.createdAt)}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-display text-base font-bold text-foreground">
                    {money(o.paymentMethod === "COD" && !o.total && o.codAmount ? o.codAmount : o.total)}
                  </span>
                  {o.paymentMethod ? (
                    <span
                      className={`mt-0.5 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                        o.paymentMethod === "CC"
                          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                          : "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                      }`}
                    >
                      {o.paymentMethod}
                      {o.paymentMethod === "COD" && o.codAmount
                        ? ` · ${money(o.codAmount)}`
                        : o.paymentMethod === "CC"
                          ? " · Paid"
                          : ""}
                    </span>
                  ) : null}
                  <span className="block text-[11px] text-muted-foreground">{o.status || ""}</span>
                </span>
              </button>

              {openId === o.id ? (
                <div className="space-y-3 border-t border-border p-3 sm:p-4">
                  <ResultCard text={o.orderText} label="Saved order" phone={o.phone} />
                  {orders.data?.isAdmin ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => remove.mutate(o.id)}
                      disabled={remove.isPending}
                      className="gap-1.5 rounded-xl text-destructive"
                    >
                      <Trash2 className="size-4" /> Delete
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </AppShell>
  );
}
