import { AppShell } from "@/components/app-shell";
import { PAY_OPTS, PosSubnav, posInput, rs } from "@/components/pos-subnav";
import { Button } from "@/components/ui/button";
import { getPurchaseItems, listProductsLite, listPurchases, listSuppliers, savePurchase } from "@/lib/business.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PackagePlus, Trash2, Undo2, Zap } from "lucide-react";
import { UnitSelect } from "@/components/unit-select";
import { createPosProduct } from "@/lib/inventory.functions";
import { useEffect, useMemo, useState, useRef } from "react";
import { toast } from "sonner";
import { newRef } from "@/lib/pos-errors";
import { usePrintCenter } from "@/components/print-center";

export const Route = createFileRoute("/_authenticated/purchases")({
  head: () => ({
    meta: [
      { title: "Purchases — HB Chemicals Pakistan Workspace" },
      { name: "description", content: "Purchase invoice, supplier credit, purchase return — stock updates automatically." },
      { property: "og:title", content: "Purchases — HB Chemicals Pakistan Workspace" },
      { property: "og:description", content: "Purchase and purchase return history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PurchasesPage,
});

type Line = { productId?: string; name: string; unit: string; qty: string; rate: string; discount: string; tax: string; batch: string; expiry: string };
type Staged = { productId?: string; name: string; isNew: boolean };
const num = (s: string) => Number(s.replace(/[^\d.]/g, "")) || 0;
const GRID = "grid grid-cols-[36px_minmax(200px,2.4fr)_minmax(80px,0.8fr)_minmax(110px,1fr)_minmax(100px,1fr)_minmax(80px,0.8fr)_minmax(70px,0.7fr)_minmax(110px,1fr)_42px] items-center gap-2";

export function PurchasesPage({ embedded, startDocType }: { embedded?: boolean; startDocType?: "purchase" | "return" } = {}) {
  const qc = useQueryClient();
  const pc = usePrintCenter();
  const { data: sup } = useQuery({ queryKey: ["suppliers"], queryFn: () => listSuppliers() });
  const { data: prod } = useQuery({ queryKey: ["products-lite"], queryFn: () => listProductsLite(), staleTime: 60_000 });
  const { data: hist } = useQuery({ queryKey: ["purchases"], queryFn: () => listPurchases() });
  const [docType, setDocType] = useState<"purchase" | "return">(startDocType ?? "purchase");
  const [refId, setRefId] = useState<string | undefined>();
  const [supplierId, setSupplierId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [term, setTerm] = useState("");
  const [staged, setStaged] = useState<Staged | null>(null);
  const [sf, setSf] = useState({ qty: "1", unit: "Piece", rate: "", discount: "", tax: "0" });
  const [hi, setHi] = useState(0);
  const dropRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    dropRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [hi]);
  const [discount, setDiscount] = useState("");
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState("Cash");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingNew, setSavingNew] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const today = new Date().toLocaleDateString("en-PK");

  const products = prod?.products ?? [];
  const matches = useMemo(() => {
    const t = term.trim().toLowerCase();
    return t && !staged ? products.filter((p) => p.name.toLowerCase().includes(t)).slice(0, 8) : [];
  }, [products, term, staged]);

  const lineTotal = (l: Line) => { const b = Math.max(0, num(l.qty) * num(l.rate) - num(l.discount)); return b + (b * num(l.tax)) / 100; };
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const total = Math.max(0, subtotal - num(discount));
  const paidNum = paid.trim() ? Math.min(num(paid), total) : total;
  const totalQty = lines.reduce((s, l) => s + num(l.qty), 0);
  const set = (i: number, v: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...v } : l)));
  const stagedAmount = (() => { const b = Math.max(0, num(sf.qty) * num(sf.rate) - num(sf.discount)); return b + (b * num(sf.tax)) / 100; })();

  const stage = (p: (typeof products)[number]) => {
    setStaged({ productId: p.id, name: p.name, isNew: false });
    setTerm(p.name);
    setSf({ qty: "1", unit: p.unit || "Piece", rate: p.purchasePrice != null ? String(p.purchasePrice) : "", discount: "", tax: "0" });
    searchRef.current?.focus();
  };
  const clearEntry = () => { setStaged(null); setTerm(""); setSf({ qty: "1", unit: "Piece", rate: "", discount: "", tax: "0" }); setHi(0); searchRef.current?.focus(); };

  const pushLine = (productId: string | undefined, name: string) => {
    setLines((ls) => {
      const i = productId ? ls.findIndex((l) => l.productId === productId && l.unit === sf.unit && l.rate === sf.rate) : -1;
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: String(num(l.qty) + num(sf.qty)) } : l));
      return [...ls, { productId, name, unit: sf.unit, qty: sf.qty || "1", rate: sf.rate, discount: sf.discount, tax: sf.tax || "0", batch: "", expiry: "" }];
    });
    clearEntry();
  };

  const confirm = async () => {
    if (savingNew) return;
    if (staged && !staged.isNew) return pushLine(staged.productId, staged.name);
    const name = term.trim();
    if (!name) return;
    if (!staged) {
      const exact = products.find((p) => p.name.toLowerCase() === name.toLowerCase());
      if (matches.length) return stage(matches[Math.min(hi, matches.length - 1)]);
      if (exact) return stage(exact);
      setStaged({ name, isNew: true });
      return;
    }
    setSavingNew(true);
    try {
      const r = await createPosProduct({ data: { name, unit: sf.unit, purchase_price: sf.rate || undefined } });
      qc.invalidateQueries({ queryKey: ["products-lite"] });
      toast.success(`"${name}" saved to inventory`);
      pushLine(r.id, name);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Product could not be saved"); } finally { setSavingNew(false); }
  };

  const reset = () => { setLines([]); setDiscount(""); setPaid(""); setNotes(""); setRefId(undefined); setDocType("purchase"); clearEntry(); };

  const startReturn = async (id: string) => {
    const r = await getPurchaseItems({ data: { id } });
    setDocType("return"); setRefId(id); setSupplierId(r.purchase?.supplier_id ?? "");
    setLines(r.items.map((i) => ({ productId: i.productId ?? undefined, name: i.name, unit: i.unit, qty: String(i.qty), rate: String(i.rate), discount: "", tax: String(i.taxPercent), batch: "", expiry: "" })));
    setNotes(`Return of ${r.purchase?.doc_number ?? ""}`);
    toast.message("Adjust the quantity for the return, then save");
  };

  const lockRef = useRef(false);
  const opRef = useRef(newRef());
  const save = async () => {
    const valid = lines.filter((l) => l.name.trim() && num(l.qty) > 0);
    if (!valid.length) return toast.error("Enter at least one item");
    if (paidNum < total && !supplierId) return toast.error("Select a supplier for a credit purchase");
    if (lockRef.current) return;
    lockRef.current = true;
    setSaving(true);
    try {
      const r = await savePurchase({ data: {
        docType, supplierId: supplierId || undefined, paid: paidNum, method, discount: num(discount), notes: notes || undefined, refPurchaseId: refId, clientRef: opRef.current,
        items: valid.map((l) => ({ productId: l.productId, name: l.name, unit: l.unit, qty: num(l.qty), rate: num(l.rate), discount: num(l.discount), taxPercent: num(l.tax), batch: l.batch || undefined, expiry: l.expiry || undefined })),
      } });
      opRef.current = newRef();
      toast.success(`${docType === "purchase" ? "Purchase" : "Purchase return"} saved: ${r.number} — ${rs(r.total)}`);
      const supName = sup?.suppliers.find((x) => x.id === supplierId)?.name;
      pc.afterSave({
        kind: "purchase", title: docType === "purchase" ? "Purchase Invoice" : "Purchase Return", number: r.number, date: new Date(),
        party: supName ? { label: "Supplier", name: supName } : undefined,
        lines: valid.map((l) => ({ name: l.name, unit: l.unit, qty: num(l.qty), rate: num(l.rate), discount: num(l.discount), taxPercent: num(l.tax), total: lineTotal(l) })),
        totals: [...(num(discount) ? [{ label: "Discount", value: -num(discount) }] : []), { label: "Grand Total", value: r.total, bold: true }],
        payments: paidNum ? [{ method, amount: paidNum }] : [], paid: paidNum, balance: Math.max(0, r.total - paidNum), notes: notes || undefined,
      }, "purchase");
      reset();
      ["purchases", "suppliers", "products", "products-lite"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Purchase could not be saved. Please try again."); } finally { lockRef.current = false; setSaving(false); }
  };

  const onKeys = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void save(); }
  };

  const cell = "h-9 w-full rounded-sm border border-border bg-background px-2 text-sm";
  const head = "text-[11px] font-bold uppercase tracking-wide text-muted-foreground";
  const body = (
      <div className={embedded ? "space-y-3" : "min-h-0 flex-1 space-y-3 overflow-y-auto pb-8 pt-3"} onKeyDown={onKeys}>
        {embedded ? null : <PosSubnav />}
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex items-center gap-3">
              <p className="text-lg font-bold text-foreground">{docType === "purchase" ? "Purchase" : "Purchase Return"}</p>
              <div className="inline-flex rounded-full border-2 border-primary p-0.5" role="tablist" aria-label="Document type">
                <button type="button" role="tab" aria-selected={docType === "purchase"} onClick={() => { if (docType !== "purchase") reset(); }} className={`rounded-full px-4 py-1.5 text-sm font-bold ${docType === "purchase" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Purchase</button>
                <button type="button" role="tab" aria-selected={docType === "return"} onClick={() => { setDocType("return"); setRefId(undefined); }} className={`rounded-full px-4 py-1.5 text-sm font-bold ${docType === "return" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Return</button>
              </div>
            </div>
            <div className="text-right text-sm text-muted-foreground">Bill date <b className="text-foreground">{today}</b></div>
          </div>

          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            <select className={`${posInput} min-w-[260px] flex-1`} value={supplierId} onChange={(e) => setSupplierId(e.target.value)} aria-label="Supplier">
              <option value="">— Cash purchase (no supplier) —</option>
              {(sup?.suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name} · balance {rs(s.balance)}</option>)}
            </select>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              <div className={`${GRID} border-y border-border bg-surface-2 px-2 py-2`}>
                <span className={head}>#</span><span className={head}>Item</span><span className={head}>Qty</span><span className={head}>Unit</span><span className={head}>Price/Unit</span><span className={head}>Disc</span><span className={head}>Tax %</span><span className={`${head} text-right`}>Amount</span><span />
              </div>

              <div className="relative border-b border-border bg-accent/20 px-2 py-2 focus-within:bg-accent/30"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.ctrlKey && !e.altKey && !e.metaKey && (e.target as HTMLElement).tagName !== "BUTTON") { e.preventDefault(); void confirm(); } else if (e.key === "Escape") clearEntry(); }}>
                <div className={GRID}>
                  <Zap className="size-4 text-primary" />
                  <input ref={searchRef} className={cell} value={term} autoFocus aria-label="Search product"
                    onChange={(e) => { setTerm(e.target.value); setStaged(null); setHi(0); }}
                    onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, matches.length - 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); } }}
                    placeholder="Search or type new product · ↑↓ select · Enter add" />
                  <input className={cell} value={sf.qty} inputMode="decimal" aria-label="Qty" onChange={(e) => setSf({ ...sf, qty: e.target.value })} />
                  <UnitSelect value={sf.unit} onChange={(v) => setSf({ ...sf, unit: v })} className={cell} label="Unit" />
                  <input className={cell} value={sf.rate} inputMode="decimal" aria-label="Price/Unit" onChange={(e) => setSf({ ...sf, rate: e.target.value })} />
                  <input className={cell} value={sf.discount} inputMode="decimal" aria-label="Discount" onChange={(e) => setSf({ ...sf, discount: e.target.value })} />
                  <input className={cell} value={sf.tax} inputMode="decimal" aria-label="Tax" onChange={(e) => setSf({ ...sf, tax: e.target.value })} />
                  <span className="text-right text-sm font-semibold">{rs(stagedAmount)}</span>
                  <Button size="icon-sm" onClick={() => void confirm()} disabled={savingNew || !term.trim()} aria-label="Add to bill"><Zap /></Button>
                </div>
                {matches.length ? (
                  <ul ref={dropRef} role="listbox" className="relative z-30 ml-9 mt-1 max-h-72 w-[min(450px,90vw)] overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">
                    {matches.map((p, i) => (
                      <li key={p.id} role="option" aria-selected={i === hi}>
                        <button type="button" className={`w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent ${i === hi ? "bg-accent" : ""}`} onMouseDown={(e) => e.preventDefault()} onClick={() => stage(p)}>
                          {p.name} <span className="text-xs text-muted-foreground">· stock {p.stock} · buy {p.purchasePrice != null ? rs(p.purchasePrice) : "—"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {staged?.isNew ? <p className="ml-9 mt-1 text-xs text-muted-foreground">"{staged.name}" is not in inventory — set qty/rate and press Enter again to save it and add to the bill.</p> : null}
                {staged && !staged.isNew ? <p className="ml-9 mt-1 text-xs text-muted-foreground">Tab to edit fields · Enter to add to bill · Esc to clear</p> : null}
              </div>

              {lines.map((l, i) => (
                <div key={i} className={`${GRID} border-b border-border px-2 py-1.5`}>
                  <span className="text-sm text-muted-foreground">{i + 1}</span>
                  <span className="truncate text-sm font-medium text-foreground">{l.name}</span>
                  <input className={cell} value={l.qty} inputMode="decimal" onChange={(e) => set(i, { qty: e.target.value })} aria-label="Qty" />
                  <UnitSelect value={l.unit} onChange={(v) => set(i, { unit: v })} className={cell} label="Unit" />
                  <input className={cell} value={l.rate} inputMode="decimal" onChange={(e) => set(i, { rate: e.target.value })} aria-label="Price/Unit" />
                  <input className={cell} value={l.discount} inputMode="decimal" onChange={(e) => set(i, { discount: e.target.value })} aria-label="Discount" />
                  <input className={cell} value={l.tax} inputMode="decimal" onChange={(e) => set(i, { tax: e.target.value })} aria-label="Tax" />
                  <span className="text-right text-sm font-semibold">{rs(lineTotal(l))}</span>
                  <Button size="icon-sm" variant="ghost" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="Remove"><Trash2 /></Button>
                </div>
              ))}

              <div className={`${GRID} bg-surface-2 px-2 py-2`}>
                <span />
                <button type="button" className="w-fit rounded-md border border-primary px-3 py-1 text-xs font-bold text-primary" onClick={() => searchRef.current?.focus()}>ADD ROW</button>
                <span className="text-sm font-bold">{totalQty}</span><span /><span /><span /><span className="text-xs font-bold text-muted-foreground">TOTAL</span>
                <span className="text-right text-sm font-bold">{rs(subtotal)}</span><span />
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-4 md:grid-cols-2">
            <div className="space-y-2">
              <select className={posInput} value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Payment type">{PAY_OPTS.map((m) => <option key={m}>{m}</option>)}</select>
              <textarea className={`${posInput} min-h-20 py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Description / note" />
            </div>
            <div className="space-y-2 text-sm">
              <label className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Discount (Rs)</span><input className={`${cell} max-w-40 text-right`} value={discount} inputMode="decimal" onChange={(e) => setDiscount(e.target.value)} /></label>
              <div className="flex items-center justify-between border-t border-border pt-2 text-base"><span className="font-bold">Total</span><b className="text-foreground">{rs(total)}</b></div>
              <label className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{docType === "purchase" ? "Paid" : "Refunded"}</span><input className={`${cell} max-w-40 text-right`} value={paid} inputMode="decimal" placeholder={String(total)} onChange={(e) => setPaid(e.target.value)} /></label>
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Balance</span><b className={total - paidNum > 0 ? "text-destructive" : ""}>{rs(total - paidNum)}</b></div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={reset}>Clear</Button>
                <Button size="lg" disabled={saving || !lines.length} onClick={save}><PackagePlus /> {docType === "purchase" ? "Save (stock +)" : "Save return (stock −)"}</Button>
              </div>
              <p className="text-right text-[11px] text-muted-foreground">Enter: add item · Tab: next field · Esc: clear row · Ctrl+S: save</p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-3">
          <p className="mb-2 text-sm font-bold text-foreground">Purchase history</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th>No.</th><th>Type</th><th>Supplier</th><th>Total</th><th>Paid</th><th>Balance</th><th>Date</th><th /></tr></thead>
              <tbody>
                {(hist?.purchases ?? []).map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="py-1.5 font-semibold">{p.doc_number}</td><td>{p.doc_type === "purchase" ? "Purchase" : "Return"}</td><td>{p.supplier_name}</td>
                    <td>{rs(p.grand_total)}</td><td>{rs(p.paid_total)}</td><td>{rs(p.balance)}</td><td className="text-xs">{new Date(p.created_at).toLocaleString("en-PK")}</td>
                    <td>{p.doc_type === "purchase" ? <Button size="sm" variant="ghost" onClick={() => startReturn(p.id)}><Undo2 /> Return</Button> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hist && !hist.purchases.length ? <p className="py-3 text-center text-xs text-muted-foreground">No purchases yet.</p> : null}
          </div>
        </section>
      </div>
  );
  if (embedded) return <>{pc.node}{body}</>;
  return (
    <AppShell title="Purchases" subtitle="Stock purchases and supplier credit" active="/pos">
      {pc.node}
      {body}
    </AppShell>
  );
}
