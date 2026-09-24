import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer, ReceiptText, Download, Share2, Search, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PosSubnav, rs } from "@/components/pos-subnav";
import { usePrintCenter } from "@/components/print-center";
import { ShareDialog } from "@/components/share-dialog";
import { listPosSales } from "@/lib/pos.functions";
import type { PrintDoc } from "@/lib/print/render";

export const Route = createFileRoute("/_authenticated/pos-invoices")({
  head: () => ({
    meta: [
      { title: "POS Invoices — HB Chemicals Pakistan" },
      { name: "description", content: "POS billing invoice records: reprint, PDF and share." },
      { property: "og:title", content: "POS Invoices — HB Chemicals Pakistan" },
      { property: "og:description", content: "POS billing invoice records: reprint, PDF and share." },
    ],
  }),
  component: PosInvoicesPage,
});

type SaleRow = {
  id: string;
  doc_number: string;
  doc_type: string;
  status: string;
  payment_status: string;
  customer_name: string | null;
  customer_phone: string | null;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  delivery: number;
  grand_total: number;
  paid_total: number;
  balance: number;
  notes: string | null;
  created_at: string;
  items: { name: string; sku: string | null; unit: string | null; qty: number; rate: number; discount: number; tax_percent: number; line_total: number; note: string | null }[];
  payments: { method: string; amount: number; kind: string }[];
};

function saleToDoc(s: SaleRow): PrintDoc {
  const isReturn = s.doc_type === "return";
  const totals: PrintDoc["totals"] = [{ label: "Subtotal", value: Number(s.subtotal) }];
  if (Number(s.tax_total)) totals!.push({ label: "Tax", value: Number(s.tax_total) });
  if (Number(s.discount_total)) totals!.push({ label: "Discount", value: Number(s.discount_total), neg: true });
  if (Number(s.delivery)) totals!.push({ label: "Delivery", value: Number(s.delivery) });
  totals!.push({ label: "Grand Total", value: Number(s.grand_total), bold: true });
  return {
    kind: "pos",
    id: s.id,
    title: isReturn ? "Sale Return" : s.doc_type === "quotation" ? "Estimate" : "Invoice",
    number: s.doc_number,
    date: s.created_at,
    party: { label: "Customer", name: s.customer_name ?? undefined, phone: s.customer_phone ?? undefined },
    lines: s.items.map((i) => ({ name: i.name, sku: i.sku ?? undefined, unit: i.unit ?? undefined, qty: Number(i.qty), rate: Number(i.rate), discount: Number(i.discount), taxPct: Number(i.tax_percent), total: Number(i.line_total), note: i.note ?? undefined })),
    totals,
    payments: s.payments.map((p) => ({ method: p.method, amount: Number(p.amount) })),
    paid: Number(s.paid_total),
    balance: Number(s.balance),
    notes: s.notes ?? undefined,
  };
}

function shareText(s: SaleRow): string {
  const lines = [
    `*${s.doc_type === "return" ? "Sale Return" : s.doc_type === "quotation" ? "Estimate" : "Invoice"} ${s.doc_number}*`,
    new Date(s.created_at).toLocaleString("en-PK"),
    s.customer_name ? `Customer: ${s.customer_name}` : "",
    "",
    ...s.items.map((i) => `${i.name} — ${i.qty} x ${rs(Number(i.rate))} = ${rs(Number(i.line_total))}`),
    "",
    `Total: ${rs(Number(s.grand_total))}`,
    `Paid: ${rs(Number(s.paid_total))}`,
    Number(s.balance) > 0 ? `Balance: ${rs(Number(s.balance))}` : "",
    "Thank you!",
  ];
  return lines.filter((l) => l !== "").join("\n");
}

function PosInvoicesPage() {
  const pc = usePrintCenter();
  const [search, setSearch] = useState("");
  const [share, setShare] = useState<SaleRow | null>(null);
  const [estimates, setEstimates] = useState(false);
  const q = useQuery({ queryKey: ["pos-sales", search, estimates], queryFn: () => listPosSales({ data: { search, estimates } }) });
  const sales = (q.data?.sales ?? []) as SaleRow[];

  return (
    <AppShell title="POS Invoices" subtitle="POS billing record — reprint, PDF, share" active="/pos">
      <div className="space-y-3">
        <PosSubnav />
        <div className="inline-flex rounded-lg border border-border bg-muted p-1">
          {([false, true] as const).map((v) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => setEstimates(v)}
              className={`rounded-md px-4 py-1.5 text-sm font-semibold ${estimates === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
            >
              {v ? "Estimates" : "Invoices"}
            </button>
          ))}
        </div>
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by invoice #, customer, phone"
            className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
          />
        </div>
        {q.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {!q.isLoading && sales.length === 0 ? <p className="text-sm text-muted-foreground">No POS invoices found.</p> : null}
        <div className="space-y-2">
          {sales.map((s) => {
            const doc = saleToDoc(s);
            const isReturn = s.doc_type === "return";
            return (
              <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{s.doc_number}</span>
                    {isReturn ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"><RotateCcw className="size-3" /> Return</span>
                    ) : null}
                    {s.status === "cancelled" ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Cancelled</span> : null}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.payment_status === "paid" ? "bg-primary/10 text-primary" : s.payment_status === "partial" ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"}`}>{s.payment_status}</span>
                  </div>
                  <div className="mt-0.5 text-sm text-muted-foreground">
                    {new Date(s.created_at).toLocaleString("en-PK")} · {s.customer_name || "Walk-in"}{s.customer_phone ? ` · ${s.customer_phone}` : ""}
                  </div>
                  <div className="mt-0.5 text-sm">
                    Total <b>{rs(Number(s.grand_total))}</b> · Paid {rs(Number(s.paid_total))}
                    {Number(s.balance) > 0 ? <> · Balance <b className="text-destructive">{rs(Number(s.balance))}</b></> : null}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button title="Preview" onClick={() => pc.preview(doc, true)} className="rounded-lg border border-border p-2 hover:bg-accent"><ReceiptText className="size-4" /></button>
                  <button title="Reprint" onClick={() => pc.print(doc, { reprint: true })} className="rounded-lg border border-border p-2 hover:bg-accent"><Printer className="size-4" /></button>
                  <button title="PDF" onClick={() => pc.pdf(doc)} className="rounded-lg border border-border p-2 hover:bg-accent"><Download className="size-4" /></button>
                  <button title="Share" onClick={() => setShare(s)} className="rounded-lg border border-border p-2 hover:bg-accent"><Share2 className="size-4" /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {share ? <ShareDialog title={share.doc_number} text={shareText(share)} phone={share.customer_phone ?? undefined} onClose={() => setShare(null)} /> : null}
    </AppShell>
  );
}
