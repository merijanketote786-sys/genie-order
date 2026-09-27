import { AppShell } from "@/components/app-shell";
import { usePinPrompt } from "@/components/pos-access";
import { cancelWithPin } from "@/lib/pos-access.functions";
import { PAY_OPTS, PosSubnav, posInput, rs } from "@/components/pos-subnav";
import { Button } from "@/components/ui/button";
import { cancelDoc, getSaleForReturn, listReturns, saveSalesReturn, searchSales } from "@/lib/business.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Search, Undo2 } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { newRef } from "@/lib/pos-errors";
import { usePrintCenter } from "@/components/print-center";
import { PurchasesPage } from "./purchases";

export const Route = createFileRoute("/_authenticated/returns")({
  head: () => ({
    meta: [
      { title: "Sales Returns — HB Chemicals Pakistan Workspace" },
      { name: "description", content: "Full or partial return from an old bill, refund or customer credit, stock restored automatically." },
      { property: "og:title", content: "Sales Returns — HB Chemicals Pakistan Workspace" },
      { property: "og:description", content: "Sales return aur refund history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReturnsPage,
});

function ReturnsPage() {
  const qc = useQueryClient();
  const pc = usePrintCenter();
  const [pinNode, askPin] = usePinPrompt();
  const cancelReturn = async (id: string) => {
    if (!confirm("Cancel this return? Stock will be reduced again.")) return;
    try { await cancelDoc({ data: { id, reason: "manual" } }); }
    catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (!msg.includes("PIN")) return toast.error(msg || "Failed");
      const pin = await askPin("Not allowed to cancel — enter manager PIN.");
      if (!pin) return;
      try { await cancelWithPin({ data: { id, reason: "manual", pin } }); } catch (er) { return toast.error(er instanceof Error ? er.message : "Failed"); }
    }
    toast.success("Return cancelled");
    qc.invalidateQueries({ queryKey: ["ret-list"] });
  };
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => { const t = setTimeout(() => setDq(q), 250); return () => clearTimeout(t); }, [q]);
  const [saleId, setSaleId] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<"refund" | "credit">("refund");
  const [method, setMethod] = useState("Cash");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"sale" | "purchase">("sale");

  const { data: found } = useQuery({ queryKey: ["ret-search", dq], queryFn: () => searchSales({ data: { q: dq } }) });
  const { data: sale } = useQuery({ queryKey: ["ret-sale", saleId], queryFn: () => getSaleForReturn({ data: { id: saleId! } }), enabled: !!saleId });
  const { data: hist } = useQuery({ queryKey: ["ret-list"], queryFn: () => listReturns() });

  const items = sale?.items ?? [];
  const lines = items.map((i) => ({ i, q: Math.min(Number(qty[i.id] || 0), i.qty - i.returned) })).filter((x) => x.q > 0);
  const total = lines.reduce((s, x) => s + x.q * x.i.unitRefund, 0);

  const cell = "h-9 w-full rounded-sm border border-border bg-background px-2 text-sm";
  const head = "text-[11px] font-bold uppercase tracking-wide text-muted-foreground";
  const lockRef = useRef(false);
  const opRef = useRef(newRef());
  const submit = async () => {
    if (!saleId || !lines.length || lockRef.current) return;
    lockRef.current = true;
    setSaving(true);
    try {
      const r = await saveSalesReturn({ data: { saleId, mode, method, reason: reason || undefined, lines: lines.map((x) => ({ itemId: x.i.id, qty: x.q })), clientRef: opRef.current } });
      opRef.current = newRef();
      toast.success(`Return save: ${r.number} — ${rs(r.total)}`);
      pc.afterSave({
        kind: "return", title: "Sales Return", number: r.number, date: new Date(),
        meta: [["Original bill", sale?.sale?.number ?? ""], ["Mode", mode === "refund" ? `Refund (${method})` : "Customer credit"]],
        party: sale?.sale?.customerName ? { label: "Customer", name: sale.sale.customerName, phone: sale.sale.customerPhone || undefined } : undefined,
        lines: lines.map((x) => ({ name: x.i.name, unit: x.i.unit ?? undefined, qty: x.q, rate: x.i.unitRefund, total: x.q * x.i.unitRefund })),
        totals: [{ label: mode === "refund" ? "Refund amount" : "Credit amount", value: r.total, bold: true }], notes: reason || undefined,
      }, "return");
      setQty({}); setReason("");
      qc.invalidateQueries({ queryKey: ["ret-sale"] });
      qc.invalidateQueries({ queryKey: ["ret-list"] });
      qc.invalidateQueries({ queryKey: ["products"] }); qc.invalidateQueries({ queryKey: ["pos-products"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Return could not be saved");
    } finally { lockRef.current = false; setSaving(false); }
  };

  return (
    <AppShell title="Sales Returns" subtitle="Refund ya customer credit" active="/pos">
      {pc.node}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-8 pt-3">
        <PosSubnav />
        {pinNode}
        <div className="inline-flex rounded-full border-2 border-primary p-0.5" role="tablist" aria-label="Return type">
          <button type="button" role="tab" aria-selected={tab === "sale"} onClick={() => setTab("sale")} className={`rounded-full px-4 py-1.5 text-sm font-bold ${tab === "sale" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Sale Return</button>
          <button type="button" role="tab" aria-selected={tab === "purchase"} onClick={() => setTab("purchase")} className={`rounded-full px-4 py-1.5 text-sm font-bold ${tab === "purchase" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Purchase Return</button>
        </div>
        {tab === "purchase" ? <PurchasesPage embedded startDocType="return" /> : (
        <>
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <p className="text-lg font-bold text-foreground">Sale Return</p>
            <div className="text-right text-sm text-muted-foreground">Bill date <b className="text-foreground">{new Date().toLocaleDateString("en-PK")}</b></div>
          </div>

          <div className="relative flex flex-wrap items-center gap-2 px-4 py-3">
            <label className="flex h-10 min-w-[280px] flex-1 items-center gap-2 rounded-lg border border-border px-3 focus-within:border-primary">
              <Search className="size-4 text-primary" />
              <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search bill: invoice number, customer name or phone" aria-label="Search bill" />
            </label>
            {sale ? <p className="text-sm font-semibold text-foreground">{sale.sale.number} · {sale.sale.customerName || "Walk-in"} · {rs(sale.sale.total)}</p> : null}
            {q.trim() && !saleId ? (
              <ul className="absolute left-4 right-4 top-full z-30 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
                {(found?.sales ?? []).map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => { setSaleId(s.id); setQty({}); setQ(""); }} className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent">
                      <span className="font-semibold text-foreground">{s.doc_number}</span> · {s.customer_name || "Walk-in"}
                      <span className="block text-xs text-muted-foreground">{rs(s.grand_total)} · {s.payment_status} · {new Date(s.created_at).toLocaleString("en-PK")}</span>
                    </button>
                  </li>
                ))}
                {found && !found.sales.length ? <p className="py-3 text-center text-xs text-muted-foreground">No bill found.</p> : null}
              </ul>
            ) : null}
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[820px]">
              <div className="grid grid-cols-[36px_minmax(220px,2.4fr)_minmax(80px,0.7fr)_minmax(90px,0.8fr)_minmax(100px,0.9fr)_minmax(130px,1fr)_minmax(110px,1fr)] items-center gap-2 border-y border-border bg-surface-2 px-2 py-2">
                <span className={head}>#</span><span className={head}>Item</span><span className={head}>Sold</span><span className={head}>Returned</span><span className={head}>Rate</span><span className={head}>Return Qty</span><span className={`${head} text-right`}>Amount</span>
              </div>
              {!sale ? <p className="py-10 text-center text-sm text-muted-foreground">Upar search kar ke bill chunein — us ke items yahan aa jayenge.</p> : null}
              {items.map((i, idx) => {
                const left = Math.round((i.qty - i.returned) * 1000) / 1000;
                const rq = Math.min(Number(qty[i.id] || 0), left);
                return (
                  <div key={i.id} className="grid grid-cols-[36px_minmax(220px,2.4fr)_minmax(80px,0.7fr)_minmax(90px,0.8fr)_minmax(100px,0.9fr)_minmax(130px,1fr)_minmax(110px,1fr)] items-center gap-2 border-b border-border px-2 py-1.5">
                    <span className="text-sm text-muted-foreground">{idx + 1}</span>
                    <span className="truncate text-sm font-medium text-foreground">{i.name} <span className="text-xs text-muted-foreground">{i.unit}</span></span>
                    <span className="text-sm">{i.qty}</span>
                    <span className="text-sm">{i.returned}</span>
                    <span className="text-sm">{rs(i.unitRefund)}</span>
                    <div className="flex gap-1">
                      <input className={cell} inputMode="decimal" disabled={left <= 0} value={qty[i.id] ?? ""} placeholder="0" onChange={(e) => setQty((m) => ({ ...m, [i.id]: e.target.value.replace(/[^\d.]/g, "") }))} aria-label={`${i.name} return qty`} />
                      <Button size="sm" variant="ghost" disabled={left <= 0} onClick={() => setQty((m) => ({ ...m, [i.id]: String(left) }))}>All</Button>
                    </div>
                    <span className="text-right text-sm font-semibold">{rs(rq * i.unitRefund)}</span>
                  </div>
                );
              })}
              {sale ? (
                <div className="grid grid-cols-[36px_minmax(220px,2.4fr)_minmax(80px,0.7fr)_minmax(90px,0.8fr)_minmax(100px,0.9fr)_minmax(130px,1fr)_minmax(110px,1fr)] items-center gap-2 bg-surface-2 px-2 py-2">
                  <span /><span className="text-xs font-bold text-muted-foreground">TOTAL</span><span className="text-sm font-bold">{lines.reduce((s, x) => s + x.q, 0)}</span><span /><span /><span />
                  <span className="text-right text-sm font-bold">{rs(total)}</span>
                </div>
              ) : null}
            </div>
          </div>

          {sale ? (
            <div className="grid gap-4 p-4 md:grid-cols-2">
              <div className="space-y-2">
                <select className={posInput} value={mode} onChange={(e) => setMode(e.target.value as "refund" | "credit")} aria-label="Return mode">
                  <option value="refund">Money back (refund)</option>
                  <option value="credit" disabled={!sale.sale.hasCustomer}>Credit to customer account</option>
                </select>
                {mode === "refund" ? <select className={posInput} value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Refund method">{PAY_OPTS.map((m) => <option key={m}>{m}</option>)}</select> : null}
                <textarea className={`${posInput} min-h-20 py-2`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" />
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between border-t border-border pt-2 text-base"><span className="font-bold">{mode === "refund" ? "Refund amount" : "Credit amount"}</span><b className="text-foreground">{rs(total)}</b></div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => { setSaleId(null); setQty({}); setReason(""); }}>Clear</Button>
                  <Button size="lg" disabled={!lines.length || saving} onClick={submit}><Undo2 /> Save return (stock +)</Button>
                </div>
                <p className="text-right text-[11px] text-muted-foreground">The original bill is not changed — a separate return record is created and stock is restored automatically.</p>
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-border bg-card p-3">
          <p className="mb-2 text-sm font-bold text-foreground">Return history</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th>No.</th><th>Customer</th><th>Amount</th><th>Refund</th><th>Note</th><th>Date</th><th /></tr></thead>
              <tbody>
                {(hist?.returns ?? []).map((r) => (
                  <tr key={r.id} className={`border-t border-border ${r.status === "cancelled" ? "opacity-50" : ""}`}>
                    <td className="py-1.5 font-semibold">{r.doc_number}</td><td>{r.customer_name}</td><td>{rs(r.grand_total)}</td><td>{r.paid_total ? rs(r.paid_total) : "Credit"}</td>
                    <td className="max-w-48 truncate text-xs">{r.notes}</td><td className="text-xs">{new Date(r.created_at).toLocaleString("en-PK")}</td>
                    <td>{r.status === "cancelled" ? "Cancelled" : <Button size="sm" variant="ghost" onClick={() => void cancelReturn(r.id)}>Cancel</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hist && !hist.returns.length ? <p className="py-3 text-center text-xs text-muted-foreground">No returns yet.</p> : null}
          </div>
        </section>
        </>
        )}
      </div>
    </AppShell>
  );
}
