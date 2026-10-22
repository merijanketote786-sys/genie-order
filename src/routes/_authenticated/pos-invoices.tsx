import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer, ReceiptText, Download, Share2, Search, RotateCcw, MoreVertical, Ban, Trash2, FileInput, Truck, Pencil, X, Wallet } from "lucide-react";
import { ReceivePaymentDialog } from "@/components/receive-payment-dialog";
import { PosPage } from "./pos";
import { AppShell } from "@/components/app-shell";
import { PosSubnav, rs } from "@/components/pos-subnav";
import { ALL_DATES, DateRangeFilter, rangeToIso, type DateRange } from "@/components/date-range-filter";
import { usePrintCenter } from "@/components/print-center";
import { ShareDialog } from "@/components/share-dialog";
import { listPosSales, deletePosDoc } from "@/lib/pos.functions";
import { cancelDoc } from "@/lib/business.functions";
import type { PrintDoc } from "@/lib/print/render";
import { toChallan } from "@/lib/print/do";
import { toast } from "sonner";
import { askReason } from "@/lib/ask-reason";
import { WaTemplateButton } from "@/components/wa-template-button";
import { usePosAccess } from "@/components/pos-access";
import type { ReceiptInput } from "@/lib/pos";

function saleToReceipt(s: SaleRow, business: string): ReceiptInput {
  const ui = s.payload?.ui ?? s.payload;
  return {
    business,
    invoiceNumber: s.doc_number,
    title: s.doc_type === "quotation" ? "Quotation" : s.doc_type === "return" ? "Sale Return" : "Invoice",
    date: new Date(s.created_at).toLocaleDateString("en-PK"),
    customerName: s.customer_name ?? undefined,
    customerPhone: s.customer_phone ?? undefined,
    customerAddress: ui?.customerAddress,
    customerCityArea: ui?.customerCityArea,
    lines: s.items.map((it, i) => ({ key: String(i), name: it.name, unit: it.unit ?? "", rateType: "sale", price: Number(it.rate), qty: Number(it.qty), discount: Number(it.discount) || 0 }) as ReceiptInput["lines"][number]),
    billDiscount: Math.max(0, Number(s.discount_total) - s.items.reduce((a, it) => a + (Number(it.discount) || 0), 0)),
    delivery: Number(s.delivery) || 0,
    payMode: s.payments.map((p) => p.method).join("+") || "Credit",
    paid: Number(s.paid_total) || 0,
    notes: s.notes ?? undefined,
    currency: "PKR",
  };
}

export const Route = createFileRoute("/_authenticated/pos-invoices")({
  head: () => ({
    meta: [
      { title: "POS Invoices — HB Chemicals Pakistan" },
      { name: "description", content: "POS billing invoice records: reprint, PDF and share." },
      { property: "og:title", content: "POS Invoices — HB Chemicals Pakistan" },
      { property: "og:description", content: "POS billing invoice records: reprint, PDF and share." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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

/** D-O — print-only document, koi transaction nahi banta. */
function challanDoc(s: SaleRow): PrintDoc {
  const delivery = s.payload?.ui ?? s.payload;
  return toChallan({
    kind: "pos",
    id: s.id,
    title: "D-O",
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
  });
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
  const { cfg } = usePosAccess();
  const business = cfg.business.name || "HBPOS";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [share, setShare] = useState<SaleRow | null>(null);
  const [estimates, setEstimates] = useState(false);
  const [range, setRange] = useState<DateRange>(ALL_DATES);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editSale, setEditSale] = useState<SaleRow | null>(null);
  const [receive, setReceive] = useState<SaleRow | null>(null);
  const q = useQuery({ queryKey: ["pos-sales", search, estimates, range], queryFn: () => listPosSales({ data: { search, estimates, ...rangeToIso(range) } }) });
  const sales = ((q.data?.sales ?? []) as SaleRow[]).filter((s) => s.status !== "cancelled");

  const refresh = () => qc.invalidateQueries({ queryKey: ["pos-sales"] });

  const doCancel = async (s: SaleRow) => {
    const reason = await askReason(`Cancel ${s.doc_number}?`, "Cancel bill");
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

  const openInBilling = (s: SaleRow, navigateAway: boolean) => {
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
    let saved: Record<string, unknown> = {};
    try {
      const raw = typeof s.payload === "string" ? JSON.parse(s.payload) : s.payload;
      if (raw && typeof raw === "object") saved = ((raw as { ui?: unknown }).ui && typeof (raw as { ui?: unknown }).ui === "object" ? (raw as { ui: Record<string, unknown> }).ui : raw) as Record<string, unknown>;
    } catch { /* ignore */ }
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);
    const pays = (s.payments ?? [])
      .filter((p) => Number(p.amount) > 0)
      .map((p) => ({ method: p.method, amount: String(Number(p.amount)) }));
    const payload = JSON.stringify({
      ...saved,
      cart: Array.isArray(saved.cart) && (saved.cart as unknown[]).length ? saved.cart : cart,
      notes: str(saved.notes) ?? s.notes ?? "",
      customerName: str(saved.customerName) ?? s.customer_name ?? "",
      customerPhone: str(saved.customerPhone) ?? s.customer_phone ?? "",
      delivery: str(saved.delivery) ?? String(Number(s.delivery) || ""),
      pays: pays.length ? pays : undefined,
    });
    sessionStorage.setItem("pos-open-doc", JSON.stringify({ id: s.id, doc_number: s.doc_number, doc_type: s.doc_type, customer_name: s.customer_name, customer_phone: s.customer_phone, grand_total: s.grand_total, created_at: s.created_at, payload, status: s.status, convert: navigateAway && s.doc_type === "quotation" }));
    if (navigateAway) navigate({ to: "/pos" });
    else setEditSale(s);
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
    <AppShell title="POS Invoices" subtitle="POS billing record — reprint, PDF, share" active="/pos" wide>
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
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by invoice #, customer, phone"
              className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"
            />
          </div>
          <DateRangeFilter value={range} onChange={setRange} />
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
                <WaTemplateButton compact label={`WhatsApp message for ${s.doc_number}`} getReceipt={() => saleToReceipt(s, business)} />
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
                        {s.doc_type === "sale" && Number(s.balance) > 0 ? item(s, <Wallet className="size-4" />, "Receive Payment", () => setReceive(s)) : null}
                        {item(s, <Pencil className="size-4" />, "Edit", () => openInBilling(s, false))}
                        {isEstimate ? item(s, <FileInput className="size-4" />, "Convert to Invoice", () => openInBilling(s, true)) : null}
                        {item(s, <Truck className="size-4" />, "Convert to D-O", () => pc.preview(challanDoc(s), false))}
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
      {share ? (() => { const d = saleToDoc(share); return <ShareDialog title={share.doc_number} doc={d} phone={share.customer_phone ?? undefined} onOpenPdf={() => pc.preview(d, true)} onClose={() => setShare(null)} />; })() : null}
      {receive ? (
        <ReceivePaymentDialog
          sale={receive}
          onClose={() => setReceive(null)}
          onDone={(amount, method) => {
            const r = receive;
            setReceive(null);
            refresh();
            ["customer-balances", "cust-bal", "cust-ledger", "pos-dashboard"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
            const after = Math.max(0, Number(r.balance) - amount);
            pc.preview({ kind: "receipt", title: "Payment Receipt", number: `RCPT-${r.doc_number}`, date: new Date().toISOString(), party: { label: "Received from", name: r.customer_name ?? undefined, phone: r.customer_phone ?? undefined }, lines: [], payments: [{ method, amount }], totals: [{ label: `Against ${r.doc_number}`, value: amount, bold: true }, { label: "Balance remaining", value: after }], paid: amount, balance: after } as PrintDoc, false);
          }}
        />
      ) : null}
      {editSale ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
          <button
            type="button"
            aria-label="Close edit"
            title="Close"
            onClick={() => { setEditSale(null); refresh(); }}
            className="fixed right-4 top-4 z-[60] rounded-full border border-border bg-card p-2 shadow-lg transition-transform hover:scale-110 hover:bg-accent"
          >
            <X className="size-5" />
          </button>
          <PosPage onSaved={(d) => { setEditSale(null); refresh(); if (d) pc.preview(d, false); }} />
        </div>
      ) : null}
      {pc.node}
    </AppShell>
  );
}
