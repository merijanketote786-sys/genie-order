import { AppShell } from "@/components/app-shell";
import { WorkspaceHeader } from "@/components/workspace-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResultCard } from "@/components/result-card";
import { ShareDialog } from "@/components/share-dialog";
import { type InvoiceRow, deleteInvoice, listInvoices, setInvoiceStatus } from "@/lib/records.functions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { FileCheck2, Search, Share2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/invoices")({
  head: () => ({
    meta: [
      { title: "Invoice Record — OrderBot" },
      { name: "description", content: "All invoices, payment status and re-download/WhatsApp." },
      { property: "og:title", content: "Invoice Record — OrderBot" },
      { property: "og:description", content: "All invoices and their payment status in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InvoicesPage,
});

const STATUS: { key: "unpaid" | "partial" | "paid"; label: string; cls: string }[] = [
  { key: "unpaid", label: "Unpaid", cls: "bg-destructive/10 text-destructive" },
  { key: "partial", label: "Partial", cls: "bg-warning/15 text-warning-foreground" },
  { key: "paid", label: "Paid", cls: "bg-success/15 text-success" },
];

const money = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-PK"));
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" });

function InvoicesPage() {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [shareInv, setShareInv] = useState<InvoiceRow | null>(null);
  const qc = useQueryClient();

  const invoices = useQuery({
    queryKey: ["invoices", term],
    queryFn: () => listInvoices({ data: { search: term || undefined } }),
  });

  const status = useMutation({
    mutationFn: (v: { id: string; status: "unpaid" | "partial" | "paid" }) =>
      setInvoiceStatus({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoices"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteInvoice({ data: { id } }),
    onSuccess: () => {
      toast.success("Invoice deleted");
      qc.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = invoices.data?.invoices ?? [];
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const thisMonth = rows.filter((r: InvoiceRow) => new Date(r.createdAt) >= monthStart);
  const totalValue = thisMonth.reduce((s: number, r: InvoiceRow) => s + (r.total ?? 0), 0);
  const paidValue = thisMonth
    .filter((r: InvoiceRow) => r.paymentStatus === "paid")
    .reduce((s: number, r: InvoiceRow) => s + (r.total ?? 0), 0);

  return (
    <AppShell title="Invoices" subtitle="Invoice record and payment status" active="/invoices">
      <WorkspaceHeader
        icon={FileCheck2}
        eyebrow="Records"
        title="Invoice Record"
        description="Every invoice is saved with its own number — change status, re-download or send via WhatsApp."
        meta={["Numbering", "Paid / Unpaid", "Re-download"]}
      />

      <div className="grid grid-cols-3 gap-2 py-3">
        <SummaryTile label="This month" value={money(totalValue)} />
        <SummaryTile label="Paid" value={money(paidValue)} />
        <SummaryTile label="Outstanding" value={money(totalValue - paidValue)} />
      </div>

      <form
        className="flex gap-2 pb-3"
        onSubmit={(e) => {
          e.preventDefault();
          setTerm(search.trim());
        }}
      >
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Invoice number, name or phone"
          className="h-12 rounded-2xl"
        />
        <Button type="submit" className="h-12 gap-1.5 rounded-2xl px-4">
          <Search className="size-4" /> <span className="hidden sm:inline">Search</span>
        </Button>
      </form>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-6">
        {invoices.isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-3xl border border-border bg-card p-8 text-center">
            <h3 className="font-display text-base font-bold text-foreground">No invoices</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Create an invoice in the Invoice section and press "Save" — it will appear here.
            </p>
          </div>
        ) : (
          rows.map((inv: InvoiceRow) => {
            const badge = STATUS.find((s) => s.key === inv.paymentStatus) ?? STATUS[0];
            return (
              <article key={inv.id} className="rounded-3xl border border-border bg-card">
                <button
                  type="button"
                  onClick={() => setOpenId(openId === inv.id ? null : inv.id)}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {inv.invoiceNumber}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[inv.customerName, inv.phone].filter(Boolean).join(" · ") || "—"}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted-foreground">
                      {when(inv.createdAt)}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-display text-base font-bold text-foreground">
                      {money(inv.total)}
                    </span>
                    <span
                      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                  </span>
                </button>

                {openId === inv.id ? (
                  <div className="space-y-3 border-t border-border p-3 sm:p-4">
                    <div className="flex flex-wrap gap-2">
                      {STATUS.map((s) => (
                        <Button
                          key={s.key}
                          size="sm"
                          variant={inv.paymentStatus === s.key ? "default" : "outline"}
                          disabled={status.isPending}
                          onClick={() => status.mutate({ id: inv.id, status: s.key })}
                          className="rounded-xl"
                        >
                          {s.label}
                        </Button>
                      ))}
                    </div>
                    <ResultCard text={inv.invoiceText} label={inv.invoiceNumber} phone={inv.phone} exportable />
                    {invoices.data?.isAdmin ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => remove.mutate(inv.id)}
                        disabled={remove.isPending}
                        className="gap-1.5 rounded-xl text-destructive"
                      >
                        <Trash2 className="size-4" /> Delete
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </div>
    </AppShell>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-2.5">
      <p className="truncate text-[11px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="truncate font-display text-base font-bold text-foreground">{value}</p>
    </div>
  );
}
