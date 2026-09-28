import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer, ReceiptText, Download, Share2, Search, RotateCcw, MoreVertical, Ban, Trash2, FileInput, Truck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PosSubnav, rs } from "@/components/pos-subnav";
import { usePrintCenter } from "@/components/print-center";
import { ShareDialog } from "@/components/share-dialog";
import { listPosSales, deletePosDoc } from "@/lib/pos.functions";
import { cancelDoc } from "@/lib/business.functions";
import type { PrintDoc } from "@/lib/print/render";
import { toast } from "sonner";

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
  payload: { ui?: { customerAddress?: string; customerCityArea?: string; courierServiceName?: string; goodsAddaName?: string; customFields?: { label: string; value: string; show?: boolean; sizePt?: number; addToTotal?: boolean }[] }; customerAddress?: string; customerCityArea?: string; courierServiceName?: string; goodsAddaName?: string; customFields?: { label: string; value: string; show?: boolean; sizePt?: number; addToTotal?: boolean }[] } | null;
  created_at: string;
  items: { name: string; sku: string | null; unit: string | null; qty: number; rate: number; discount: number; tax_percent: number; line_total: number; note: string | null }[];
  payments: { method: string; amount: number; kind: string }[];
};

function saleToDoc(s: SaleRow): PrintDoc {
  const isReturn = s.doc_type === "return";
  const delivery = s.payload?.ui ?? s.payload;
  const totals: PrintDoc["totals"] = [{ label: "Subtotal", value: Number(s.subtotal) }];
  if (Number(s.tax_total)) totals!.push({ label: "Tax", value: Number(s.tax_total) });
  if (Number(s.discount_total)) totals!.push({ label: "Discount", value: Number(s.discount_total), neg: true });
  if (Number(s.delivery)) totals!.push({ label: "Delivery", value: Number(s.delivery) });
  for (const field of delivery?.customFields ?? []) {
    if (field.show === false || !field.addToTotal) continue;
    const amount = Number(String(field.value ?? "").replace(/,/g, "").trim());
    if (Number.isFinite(amount) && amount > 0) totals!.push({ label: field.label.trim() || "Custom charge", value: amount });
  }
  totals!.push({ label: "Grand Total", value: Number(s.grand_total), bold: true });
  return {
    kind: "pos",
    id: s.id,
    title: isReturn ? "Sale Return" : s.doc_type === "quotation" ? "Estimate" : "Invoice",
    number: s.doc_number,
    date: s.created_at,
    party: { label: "Customer", name: s.customer_name ?? undefined, phone: s.customer_phone ?? undefined, address: [delivery?.customerAddress, delivery?.customerCityArea].filter(Boolean).join(", ") || undefined },
    meta: [["City / Area", delivery?.customerCityArea], ["Courier service", delivery?.courierServiceName], ["Goods adda", delivery?.goodsAddaName]].filter((entry): entry is [string, string] => Boolean(entry[1])),
    lines: s.items.map((i) => ({ name: i.name, sku: i.sku ?? undefined, unit: i.unit ?? undefined, qty: Number(i.qty), rate: Number(i.rate), discount: Number(i.discount), taxPct: Number(i.tax_percent), total: Number(i.line_total), note: i.note ?? undefined })),
    totals,
    payments: s.payments.map((p) => ({ method: p.method, amount: Number(p.amount) })),
    paid: Number(s.paid_total),
    balance: Number(s.balance),
    notes: s.notes ?? undefined,
    customFields: delivery?.customFields,
  };
}

/** Delivery challan — print-only document, koi transaction nahi banta. */
function challanDoc(s: SaleRow): PrintDoc {
  const delivery = s.payload?.ui ?? s.payload;
  return {
    kind: "pos",
    id: s.id,
    title: "Delivery Challan",
    number: `DC-${s.doc_number}`,
    date: s.created_at,
    party: { label: "Deliver To", name: s.customer_name ?? undefined, phone: s.customer_phone ?? undefined, address: [delivery?.customerAddress, delivery?.customerCityArea].filter(Boolean).join(", ") || undefined },
    meta: [["City / Area", delivery?.customerCityArea], ["Courier service", delivery?.courierServiceName], ["Goods adda", delivery?.goodsAddaName]].filter((entry): entry is [string, string] => Boolean(entry[1])),
    lines: s.items.map((i) => ({ name: i.name, unit: i.unit ?? undefined, qty: Number(i.qty), rate: 0, discount: 0, taxPct: 0, total: 0, note: i.note ?? undefined })),
    totals: [],
    payments: [],
    paid: 0,
    balance: 0,
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
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [share, setShare] = useState<SaleRow | null>(null);
  const [estimates, setEstimates] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ["pos-sales", search, estimates], queryFn: () => listPosSales({ data: { search, estimates } }) });
  const sales = ((q.data?.sales ?? []) as SaleRow[]).filter((s) => s.status !== "cancelled");

  const refresh = () => qc.invalidateQueries({ queryKey: ["pos-sales"] });

  const doCancel = async (s: SaleRow) => {
    const reason = window.prompt(`Cancel ${s.doc_number}? Reason (optional):`) ?? "";
    if (reason === null) return;
    setBusy(true);
    try {
      await cancelDoc({ data: { id: s.id, reason } });
      toast.success(`${s.doc_number} cancelled`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async (s: SaleRow) => {
    if (!window.confirm(`Delete ${s.doc_number} permanently? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await deletePosDoc({ data: { id: s.id } });
      toast.success(`${s.doc_number} deleted`);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const convertToInvoice = (s: SaleRow) => {
    const cart = s.items.map((i, idx) => ({
      key: `conv-${s.id}-${idx}`,
      name: i.name,
      unit: i.unit ?? "pcs",
      rateType: "custom",
      price: Number(i.rate),
      qty: Number(i.qty),
      discount: Number(i.discount),
      taxPercent: Number(i.tax_percent),
      sku: i.sku ?? undefined,
      note: i.note ?? undefined,
    }));
    const payload = JSON.stringify({ cart, notes: s.notes ?? "", customerName: s.customer_name ?? "", customerPhone: s.customer_phone ?? "", delivery: String(Number(s.delivery) || "") });
    sessionStorage.setItem("pos-open-doc", JSON.stringify({ id: s.id, doc_number: s.doc_number, customer_name: s.customer_name, customer_phone: s.customer_phone, grand_total: s.grand_total, created_at: s.created_at, payload, status: s.status }));
    navigate({ to: "/pos" });
  };

  const item = (s: SaleRow, icon: React.ReactNode, label: string, onClick: () => void, danger = false) => (
    <button
      key={label}
      type="button"
      disabled={busy}
      onClick={() => { setMenuFor(null); onClick(); }}
      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50 ${danger ? "text-destructive" : "text-foreground"}`}
    >
      {icon} {label}
    </button>
  );

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
            const isEstimate = s.doc_type === "quotation";
            return (
              <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{s.doc_number}</span>
                    {isReturn ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"><RotateCcw className="size-3" /> Return</span>
                    ) : null}
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
                <div className="relative">
                  <button
                    title="Actions"
                    aria-label={`Actions for ${s.doc_number}`}
                    onClick={() => setMenuFor(menuFor === s.id ? null : s.id)}
                    className="rounded-lg border border-border p-2 hover:bg-accent"
                  >
                    <MoreVertical className="size-4" />
                  </button>
                  {menuFor === s.id ? (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setMenuFor(null)} />
                      <div className="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-xl">
                        {item(s, <ReceiptText className="size-4" />, "Preview", () => pc.preview(doc, true))}
                        {item(s, <Printer className="size-4" />, "Reprint", () => pc.print(doc, { reprint: true }))}
                        {item(s, <Download className="size-4" />, "PDF", () => pc.pdf(doc))}
                        {item(s, <Share2 className="size-4" />, "Share", () => setShare(s))}
                        {isEstimate ? item(s, <FileInput className="size-4" />, "Convert to Invoice", () => convertToInvoice(s)) : null}
                        {isEstimate ? item(s, <Truck className="size-4" />, "Convert to Delivery Challan", () => pc.preview(challanDoc(s), false)) : null}
                        {!isEstimate ? item(s, <Ban className="size-4" />, "Cancel", () => void doCancel(s), true) : null}
                        {isEstimate ? item(s, <Trash2 className="size-4" />, "Delete", () => void doDelete(s), true) : null}
                      </div>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {share ? <ShareDialog title={share.doc_number} text={shareText(share)} phone={share.customer_phone ?? undefined} onClose={() => setShare(null)} /> : null}
      {pc.node}
    </AppShell>
  );
}
