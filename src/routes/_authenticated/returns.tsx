import { AppShell } from "@/components/app-shell";
import { usePinPrompt } from "@/components/pos-access";
import { cancelWithPin } from "@/lib/pos-access.functions";
import { PAY_OPTS, PosSubnav, posInput, rs } from "@/components/pos-subnav";
import { Button } from "@/components/ui/button";
import { cancelDoc, getSaleForReturn, listReturns, saveSalesReturn, saveUnlinkedSalesReturn, searchSales } from "@/lib/business.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Search, Trash2, Undo2, Zap } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { newRef } from "@/lib/pos-errors";
import { usePrintCenter } from "@/components/print-center";
import { PurchasesPage } from "./purchases";
import { listProductsLite } from "@/lib/business.functions";
import { UnitSelect } from "@/components/unit-select";
import { PosCustomerSearch } from "@/components/pos-customer-search";
import { createPosProduct } from "@/lib/inventory.functions";

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
  const [itemSearch, setItemSearch] = useState("");
  const [stagedId, setStagedId] = useState<string | null>(null);
  const [pendingNew, setPendingNew] = useState(false);
  const [savingNew, setSavingNew] = useState(false);
  const [entryQty, setEntryQty] = useState("1");
  const [entryRate, setEntryRate] = useState("");
  const [entryUnit, setEntryUnit] = useState("Piece");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [freeLines, setFreeLines] = useState<Array<{ productId: string; name: string; unit: string; qty: number; rate: number }>>([]);
  const itemRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"refund" | "credit">("refund");
  const [method, setMethod] = useState("Cash");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"sale" | "purchase">("sale");

  const { data: found } = useQuery({ queryKey: ["ret-search", dq], queryFn: () => searchSales({ data: { q: dq } }) });
  const { data: sale } = useQuery({ queryKey: ["ret-sale", saleId], queryFn: () => getSaleForReturn({ data: { id: saleId! } }), enabled: !!saleId });
  const { data: hist } = useQuery({ queryKey: ["ret-list"], queryFn: () => listReturns() });
  const { data: prod } = useQuery({ queryKey: ["products-lite"], queryFn: () => listProductsLite(), staleTime: 60_000 });
  const products = prod?.products ?? [];

  const items = sale?.items ?? [];
  const lines = items.map((i) => ({ i, q: Number(qty[i.id] || 0) })).filter((x) => x.q > 0);
  const total = saleId ? lines.reduce((s, x) => s + x.q * x.i.unitRefund, 0) : freeLines.reduce((s, x) => s + x.qty * x.rate, 0);
  const stagedItem = items.find((i) => i.id === stagedId);
  const matchedItems = itemSearch.trim() && !stagedId ? items.filter((i) => i.qty - i.returned - Number(qty[i.id] || 0) > 0 && i.name.toLowerCase().includes(itemSearch.trim().toLowerCase())) : [];
  const matchedProducts = itemSearch.trim() && !stagedId ? products.filter((p) => [p.name, p.id].some((v) => v.toLowerCase().includes(itemSearch.trim().toLowerCase()))).slice(0, 8) : [];
  const matches = pendingNew ? [] : saleId ? matchedItems : matchedProducts;
  const stagedProduct = !saleId ? products.find((p) => p.id === stagedId) : undefined;
  const stage = (id: string, name: string, unit: string, rate: number) => { setStagedId(id); setItemSearch(name); setEntryUnit(unit || "Piece"); setEntryRate(String(rate)); itemRef.current?.focus(); };
  const resetEntry = () => { setItemSearch(""); setStagedId(null); setPendingNew(false); setEntryQty("1"); setEntryRate(""); setEntryUnit("Piece"); itemRef.current?.focus(); };
  const addItem = async () => {
    if (!itemSearch.trim() || savingNew) return;
    if (!saleId) {
      if (!stagedProduct && !pendingNew) {
        if (matchedProducts.length) stage(matchedProducts[0].id, matchedProducts[0].name, matchedProducts[0].unit, matchedProducts[0].salePrice);
        else setPendingNew(true);
        return;
      }
      const n = Number(entryQty), rate = Number(entryRate);
      if (!Number.isFinite(n) || n <= 0 || n > 1e7 || !Number.isFinite(rate) || rate < 0 || rate > 1e9) return toast.error("Enter a valid quantity and return price");
      let productId = stagedProduct?.id;
      let name = stagedProduct?.name ?? itemSearch.trim();
      if (pendingNew) {
        setSavingNew(true);
        try {
          const created = await createPosProduct({ data: { name, unit: entryUnit } });
          productId = created.id; name = itemSearch.trim();
          qc.invalidateQueries({ queryKey: ["products-lite"] }); qc.invalidateQueries({ queryKey: ["pos-products"] });
        } catch (e) { toast.error(e instanceof Error ? e.message : "Product could not be saved"); return; }
        finally { setSavingNew(false); }
      }
      if (!productId) return;
      setFreeLines((prev) => [...prev, { productId, name, unit: entryUnit, qty: n, rate }]);
      resetEntry(); return;
    }
    if (!sale) return;
    if (!stagedItem) {
      if (matchedItems.length) { stage(matchedItems[0].id, matchedItems[0].name, matchedItems[0].unit, matchedItems[0].unitRefund); }
      else toast.error("Choose an item from the selected bill");
      return;
    }
    const n = Number(entryQty);
    const remaining = Math.round((stagedItem.qty - stagedItem.returned - Number(qty[stagedItem.id] || 0)) * 1000) / 1000;
    if (!Number.isFinite(n) || n <= 0 || n > remaining) return toast.error(`Available to return: ${remaining} ${stagedItem.unit}`);
    setQty((m) => ({ ...m, [stagedItem.id]: String(Math.round((Number(m[stagedItem.id] || 0) + n) * 1000) / 1000) }));
    resetEntry();
  };

  const cell = "h-9 w-full rounded-sm border border-border bg-background px-2 text-sm";
  const head = "text-[11px] font-bold uppercase tracking-wide text-muted-foreground";
  const grid = "grid grid-cols-[36px_minmax(200px,2.4fr)_minmax(80px,0.8fr)_minmax(110px,1fr)_minmax(100px,1fr)_minmax(80px,0.8fr)_minmax(70px,0.7fr)_minmax(110px,1fr)_42px] items-center gap-2";
  const lockRef = useRef(false);
  const opRef = useRef(newRef());
  const submit = async () => {
    if (lockRef.current || (saleId ? !lines.length : !freeLines.length)) return;
    if (!saleId && mode === "credit" && !customerId) return toast.error("Select a saved customer for account credit");
    lockRef.current = true;
    setSaving(true);
    try {
      const r = saleId
        ? await saveSalesReturn({ data: { saleId, mode, method, reason: reason || undefined, lines: lines.map((x) => ({ itemId: x.i.id, qty: x.q })), clientRef: opRef.current } })
        : await saveUnlinkedSalesReturn({ data: { customerId: customerId ?? undefined, customerName: customerName.trim() || undefined, mode, method, reason: reason || undefined, items: freeLines, clientRef: opRef.current } });
      opRef.current = newRef();
      toast.success(`Return saved: ${r.number} — ${rs(r.total)}`);
      pc.afterSave({
        kind: "return", title: "Sales Return", number: r.number, date: new Date(),
        meta: [["Original bill", sale?.sale?.number ?? "Not linked"], ["Mode", mode === "refund" ? `Refund (${method})` : "Customer credit"]],
        party: (sale?.sale?.customerName || customerName) ? { label: "Customer", name: sale?.sale?.customerName || customerName, phone: sale?.sale?.customerPhone || customerPhone || undefined } : undefined,
        lines: saleId ? lines.map((x) => ({ name: x.i.name, unit: x.i.unit ?? undefined, qty: x.q, rate: x.i.unitRefund, total: x.q * x.i.unitRefund })) : freeLines.map((x) => ({ name: x.name, unit: x.unit, qty: x.qty, rate: x.rate, total: x.qty * x.rate })),
        totals: [{ label: mode === "refund" ? "Refund amount" : "Credit amount", value: r.total, bold: true }], notes: reason || undefined,
      }, "return");
      setQty({}); setFreeLines([]); setReason(""); resetEntry();
      qc.invalidateQueries({ queryKey: ["ret-sale"] }); qc.invalidateQueries({ queryKey: ["ret-list"] });
      qc.invalidateQueries({ queryKey: ["products"] }); qc.invalidateQueries({ queryKey: ["products-lite"] }); qc.invalidateQueries({ queryKey: ["pos-products"] });
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
        {tab === "purchase" ? <div className="inline-flex rounded-full border-2 border-primary p-0.5" role="tablist" aria-label="Return type">
          <Button type="button" role="tab" aria-selected={false} variant="ghost" onClick={() => setTab("sale")} className="rounded-full px-4 py-1.5 text-sm font-bold text-muted-foreground">Sale Return</Button>
          <Button type="button" role="tab" aria-selected={true} className="rounded-full px-4 py-1.5 text-sm font-bold">Purchase Return</Button>
        </div> : null}
        {tab === "purchase" ? <PurchasesPage embedded startDocType="return" /> : (
        <>
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-lg font-bold text-foreground">Sale Return</p>
              <div className="inline-flex rounded-full border-2 border-primary p-0.5" role="tablist" aria-label="Return type">
                <Button type="button" role="tab" aria-selected={true} className="rounded-full px-4 py-1.5 text-sm font-bold">Sale Return</Button>
                <Button type="button" role="tab" aria-selected={false} variant="ghost" onClick={() => setTab("purchase")} className="rounded-full px-4 py-1.5 text-sm font-bold text-muted-foreground">Purchase Return</Button>
              </div>
            </div>
            <div className="text-right text-sm text-muted-foreground">Bill date <b className="text-foreground">{new Date().toLocaleDateString("en-PK")}</b></div>
          </div>

          <div className="relative space-y-2 px-4 py-3">
            {!saleId ? <div className="grid gap-2 sm:grid-cols-2"><PosCustomerSearch field="name" value={customerName} onChange={(v) => { setCustomerName(v); setCustomerId(null); }} onPick={(c) => { setCustomerId(c.id); setCustomerName(c.name || ""); setCustomerPhone(c.phone); }} placeholder="Customer name (optional)" className={cell} /><PosCustomerSearch field="phone" value={customerPhone} onChange={(v) => { setCustomerPhone(v); setCustomerId(null); }} onPick={(c) => { setCustomerId(c.id); setCustomerName(c.name || ""); setCustomerPhone(c.phone); }} placeholder="Customer phone (optional)" className={cell} /></div> : null}
            <label className="flex h-10 w-full items-center gap-2 rounded-lg border border-border bg-background px-3 focus-within:border-primary">
              <Search className="size-4 text-primary" />
              <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Optional: search original bill by number, customer or phone" aria-label="Search bill" />
            </label>
            {sale ? <p className="flex items-center gap-2 text-sm font-semibold text-foreground">{sale.sale.number} · {sale.sale.customerName || "Walk-in"} · {rs(sale.sale.total)} <Button size="sm" variant="outline" onClick={() => { setSaleId(null); setQty({}); resetEntry(); }}>Remove bill</Button></p> : null}
            {q.trim() ? (
              <ul className="absolute left-4 right-4 top-full z-30 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
                {(found?.sales ?? []).map((s) => (
                  <li key={s.id}>
                    <Button type="button" variant="ghost" onClick={() => { setSaleId(s.id); setQty({}); setQ(""); setItemSearch(""); setStagedId(null); setFreeLines([]); setMode("refund"); }} className="h-auto w-full justify-start px-2 py-1.5 text-left text-sm">
                      <span className="font-semibold text-foreground">{s.doc_number}</span> · {s.customer_name || "Walk-in"}
                      <span className="block text-xs text-muted-foreground">{rs(s.grand_total)} · {s.payment_status} · {new Date(s.created_at).toLocaleString("en-PK")}</span>
                    </Button>
                  </li>
                ))}
                {found && !found.sales.length ? <p className="py-3 text-center text-xs text-muted-foreground">No bill found.</p> : null}
              </ul>
            ) : null}
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              <div className={`${grid} border-y border-border bg-surface-2 px-2 py-2`}>
                <span className={head}>#</span><span className={head}>Item</span><span className={head}>Qty</span><span className={head}>Unit</span><span className={head}>Price/Unit</span><span className={head}>Disc</span><span className={head}>Tax %</span><span className={`${head} text-right`}>Amount</span><span />
              </div>
              <div className="relative border-b border-border bg-accent/20 px-2 py-2 focus-within:bg-accent/30" onKeyDown={(e) => { if (e.key === "Enter" && !e.ctrlKey && !e.altKey && !e.metaKey && (e.target as HTMLElement).tagName !== "BUTTON") { e.preventDefault(); addItem(); } else if (e.key === "Escape") resetEntry(); }}>
                <div className={grid}>
                  <Zap className="size-4 text-primary" />
                  <input ref={itemRef} className={cell} value={itemSearch} onChange={(e) => { setItemSearch(e.target.value); setStagedId(null); setPendingNew(false); }} placeholder={saleId ? "Search item from selected bill" : "Search or type new POS product"} aria-label="Search return item" />
                  <input className={cell} inputMode="decimal" value={entryQty} onChange={(e) => setEntryQty(e.target.value.replace(/[^\d.]/g, ""))} disabled={!stagedItem && !stagedProduct && !pendingNew} aria-label="Return Qty" />
                  {saleId ? <span className="truncate text-sm text-muted-foreground">{stagedItem?.unit || "—"}</span> : <UnitSelect className={cell} value={entryUnit} onChange={setEntryUnit} label="Return unit" />}
                  {saleId ? <span className="text-sm text-muted-foreground">{stagedItem ? rs(stagedItem.unitRefund) : "—"}</span> : <input className={cell} inputMode="decimal" value={entryRate} onChange={(e) => setEntryRate(e.target.value.replace(/[^\d.]/g, ""))} disabled={!stagedProduct && !pendingNew} aria-label="Return price per unit" placeholder="Price" />}
                  <span className="text-sm text-muted-foreground" title="Already included in the original bill's refund rate">—</span>
                  <span className="text-sm text-muted-foreground" title="Already included in the original bill's refund rate">—</span>
                  <span className="text-right text-sm font-semibold">{stagedItem || stagedProduct || pendingNew ? rs(Number(entryQty || 0) * (stagedItem?.unitRefund ?? Number(entryRate || 0))) : "—"}</span>
                  <Button size="icon-sm" onClick={() => void addItem()} disabled={!itemSearch.trim() || savingNew} aria-label="Add return item"><Zap /></Button>
                </div>
                {pendingNew ? <p className="ml-9 mt-1 text-xs text-muted-foreground">New product — press Enter again to save it to inventory and add it to this return.</p> : null}
                {matches.length ? <ul role="listbox" className="relative z-30 ml-9 mt-1 max-h-72 w-[min(450px,90vw)] overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
                  {matches.map((i) => <li key={i.id} role="option" aria-selected={false}><Button variant="ghost" size="sm" className="h-auto w-full justify-start text-left" onClick={() => stage(i.id, i.name, i.unit, saleId ? (i as (typeof items)[number]).unitRefund : (i as (typeof products)[number]).salePrice)}>{i.name} · {saleId ? `${Math.round(((i as (typeof items)[number]).qty - (i as (typeof items)[number]).returned - Number(qty[i.id] || 0)) * 1000) / 1000} ${i.unit} available` : `${i.unit} · ${rs((i as (typeof products)[number]).salePrice)}`}</Button></li>)}
                </ul> : null}
              </div>
              {lines.map(({ i, q: rq }, idx) => {
                const left = Math.round((i.qty - i.returned) * 1000) / 1000;
                return (
                  <div key={i.id} className={`${grid} border-b border-border px-2 py-1.5`}>
                    <span className="text-sm text-muted-foreground">{idx + 1}</span>
                    <span className="truncate text-sm font-medium text-foreground" title={`Sold ${i.qty}, previously returned ${i.returned}`}>{i.name}</span>
                    <input className={cell} inputMode="decimal" value={qty[i.id] ?? ""} onChange={(e) => { const value = e.target.value.replace(/[^\d.]/g, ""); if (!value || Number(value) <= left) setQty((m) => ({ ...m, [i.id]: value })); }} aria-label={`${i.name} return qty`} title={`Maximum ${left} ${i.unit}`} />
                    <span className="text-sm">{i.unit}</span>
                    <span className="text-sm">{rs(i.unitRefund)}</span>
                    <span className="text-sm text-muted-foreground">—</span><span className="text-sm text-muted-foreground">—</span>
                    <span className="text-right text-sm font-semibold">{rs(rq * i.unitRefund)}</span>
                    <Button size="icon-sm" variant="ghost" onClick={() => setQty((m) => { const next = { ...m }; delete next[i.id]; return next; })} aria-label={`Remove ${i.name}`}><Trash2 /></Button>
                  </div>
                );
              })}
              {!saleId && freeLines.map((l, idx) => <div key={`${l.productId}-${idx}`} className={`${grid} border-b border-border px-2 py-1.5`}><span className="text-sm text-muted-foreground">{idx + 1}</span><span className="truncate text-sm font-medium">{l.name}</span><input className={cell} inputMode="decimal" value={l.qty} onChange={(e) => { const qty = Number(e.target.value); if (qty > 0 && qty <= 1e7) setFreeLines((prev) => prev.map((x, j) => j === idx ? { ...x, qty } : x)); }} aria-label={`${l.name} return qty`} /><span>{l.unit}</span><input className={cell} inputMode="decimal" value={l.rate} onChange={(e) => { const rate = Number(e.target.value); if (rate >= 0 && rate <= 1e9) setFreeLines((prev) => prev.map((x, j) => j === idx ? { ...x, rate } : x)); }} aria-label={`${l.name} return price`} /><span className="text-muted-foreground">—</span><span className="text-muted-foreground">—</span><span className="text-right font-semibold">{rs(l.qty * l.rate)}</span><Button size="icon-sm" variant="ghost" onClick={() => setFreeLines((prev) => prev.filter((_, j) => j !== idx))} aria-label={`Remove ${l.name}`}><Trash2 /></Button></div>)}
              <div className={`${grid} bg-surface-2 px-2 py-2`}>
                <span /><Button size="sm" variant="outline" className="w-fit rounded-full border-primary text-xs font-bold text-primary" onClick={() => itemRef.current?.focus()}>ADD ROW</Button><span className="text-sm font-bold">{saleId ? lines.reduce((s, x) => s + x.q, 0) : freeLines.reduce((s, x) => s + x.qty, 0)}</span><span /><span /><span /><span className="text-xs font-bold text-muted-foreground">TOTAL</span>
                <span className="text-right text-sm font-bold">{rs(total)}</span><span />
              </div>
            </div>
          </div>

            <div className="grid gap-4 p-4 md:grid-cols-2">
              <div className="space-y-2">
                <select className={posInput} value={mode} onChange={(e) => setMode(e.target.value as "refund" | "credit")} aria-label="Return mode" disabled={false}>
                  <option value="refund">Money back (refund)</option>
                  <option value="credit" disabled={saleId ? !sale?.sale.hasCustomer : !customerId}>Credit to customer account</option>
                </select>
                {mode === "refund" ? <select className={posInput} value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Refund method" disabled={false}>{PAY_OPTS.map((m) => <option key={m}>{m}</option>)}</select> : null}
                <textarea className={`${posInput} min-h-20 py-2`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Description / note" disabled={!sale} />
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3 text-muted-foreground"><span>Discount (Rs)</span><span title="Original bill adjustments are already included in the refund rate">—</span></div>
                <div className="flex items-center justify-between border-t border-border pt-2 text-base"><span className="font-bold">Total</span><b className="text-foreground">{rs(total)}</b></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">{mode === "refund" ? "Refunded" : "Customer credit"}</span><b className="text-foreground">{rs(total)}</b></div>
                <div className="flex items-center justify-between"><span className="text-muted-foreground">Balance</span><b>{rs(0)}</b></div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => { setSaleId(null); setQty({}); setFreeLines([]); setCustomerId(null); setCustomerName(""); setCustomerPhone(""); setReason(""); setMode("refund"); resetEntry(); }}>Clear</Button>
                  <Button size="lg" disabled={!(saleId ? lines.length : freeLines.length) || saving || (!saleId && mode === "credit" && !customerId)} onClick={submit}><Undo2 /> Save return (stock +)</Button>
                </div>
                <p className="text-right text-[11px] text-muted-foreground">A separate return record is created and stock is restored automatically. Without a bill, choose the product and enter its return price.</p>
                <p className="text-right text-[11px] text-muted-foreground">Enter: select item / add row · Tab: next field · Esc: clear entry</p>
              </div>
            </div>
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
