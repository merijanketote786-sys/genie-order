import { AppShell } from "@/components/app-shell";
import { PAY_OPTS, PosSubnav, posInput, rs } from "@/components/pos-subnav";
import { Button } from "@/components/ui/button";
import { getPurchaseItems, listProductsLite, listPurchases, listSuppliers, savePurchase } from "@/lib/business.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PackagePlus, Trash2, Undo2 } from "lucide-react";
import { useMemo, useState, useRef } from "react";
import { toast } from "sonner";
import { newRef } from "@/lib/pos-errors";
import { usePrintCenter } from "@/components/print-center";

export const Route = createFileRoute("/_authenticated/purchases")({
  head: () => ({
    meta: [
      { title: "Purchases — HB Chemicals Pakistan Workspace" },
      { name: "description", content: "Purchase invoice, supplier credit, purchase return — stock khud barhta hai." },
      { property: "og:title", content: "Purchases — HB Chemicals Pakistan Workspace" },
      { property: "og:description", content: "Purchase aur purchase return history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PurchasesPage,
});

type Line = { productId?: string; name: string; unit: string; qty: string; rate: string; discount: string; tax: string; batch: string; expiry: string };
const num = (s: string) => Number(s.replace(/[^\d.]/g, "")) || 0;

function PurchasesPage() {
  const qc = useQueryClient();
  const pc = usePrintCenter();
  const { data: sup } = useQuery({ queryKey: ["suppliers"], queryFn: () => listSuppliers() });
  const { data: prod } = useQuery({ queryKey: ["products-lite"], queryFn: () => listProductsLite(), staleTime: 60_000 });
  const { data: hist } = useQuery({ queryKey: ["purchases"], queryFn: () => listPurchases() });
  const [docType, setDocType] = useState<"purchase" | "return">("purchase");
  const [refId, setRefId] = useState<string | undefined>();
  const [supplierId, setSupplierId] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [term, setTerm] = useState("");
  const [discount, setDiscount] = useState("");
  const [paid, setPaid] = useState("");
  const [method, setMethod] = useState("Cash");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const products = prod?.products ?? [];
  const matches = useMemo(() => {
    const t = term.trim().toLowerCase();
    return t ? products.filter((p) => p.name.toLowerCase().includes(t)).slice(0, 8) : [];
  }, [products, term]);

  const lineTotal = (l: Line) => { const b = Math.max(0, num(l.qty) * num(l.rate) - num(l.discount)); return b + (b * num(l.tax)) / 100; };
  const total = Math.max(0, lines.reduce((s, l) => s + lineTotal(l), 0) - num(discount));
  const paidNum = paid.trim() ? Math.min(num(paid), total) : total;
  const set = (i: number, v: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...v } : l)));

  const addProduct = (p: (typeof products)[number]) => {
    setLines((ls) => [...ls, { productId: p.id, name: p.name, unit: p.unit, qty: "1", rate: String(p.purchasePrice ?? ""), discount: "", tax: "0", batch: "", expiry: "" }]);
    setTerm("");
  };
  const reset = () => { setLines([]); setDiscount(""); setPaid(""); setNotes(""); setRefId(undefined); setDocType("purchase"); };

  const startReturn = async (id: string) => {
    const r = await getPurchaseItems({ data: { id } });
    setDocType("return"); setRefId(id); setSupplierId(r.purchase?.supplier_id ?? "");
    setLines(r.items.map((i) => ({ productId: i.productId ?? undefined, name: i.name, unit: i.unit, qty: String(i.qty), rate: String(i.rate), discount: "", tax: String(i.taxPercent), batch: "", expiry: "" })));
    setNotes(`Return of ${r.purchase?.doc_number ?? ""}`);
    toast.message("Return ke liye quantity kam/zyada karein, phir save");
  };

  const lockRef = useRef(false);
  const opRef = useRef(newRef());
  const save = async () => {
    const valid = lines.filter((l) => l.name.trim() && num(l.qty) > 0);
    if (!valid.length) return toast.error("Kam az kam ek item likhein");
    if (paidNum < total && !supplierId) return toast.error("Credit purchase ke liye supplier chunein");
    if (lockRef.current) return;
    lockRef.current = true;
    setSaving(true);
    try {
      const r = await savePurchase({ data: {
        docType, supplierId: supplierId || undefined, paid: paidNum, method, discount: num(discount), notes: notes || undefined, refPurchaseId: refId, clientRef: opRef.current,
        items: valid.map((l) => ({ productId: l.productId, name: l.name, unit: l.unit, qty: num(l.qty), rate: num(l.rate), discount: num(l.discount), taxPercent: num(l.tax), batch: l.batch || undefined, expiry: l.expiry || undefined })),
      } });
      opRef.current = newRef();
      toast.success(`${docType === "purchase" ? "Purchase" : "Purchase return"} save: ${r.number} — ${rs(r.total)}`);
      const supName = sup?.suppliers.find((x) => x.id === supplierId)?.name;
      pc.afterSave({
        kind: "purchase", title: docType === "purchase" ? "Purchase Invoice" : "Purchase Return", number: r.number, date: new Date(),
        party: supName ? { label: "Supplier", name: supName } : undefined,
        lines: valid.map((l) => ({ name: l.name, unit: l.unit, qty: num(l.qty), rate: num(l.rate), discount: num(l.discount), taxPercent: num(l.tax), total: lineTotal(l), note: [l.batch && `Batch ${l.batch}`, l.expiry && `Exp ${l.expiry}`].filter(Boolean).join(" · ") || undefined })),
        totals: [...(num(discount) ? [{ label: "Discount", value: -num(discount) }] : []), { label: "Grand Total", value: r.total, bold: true }],
        payments: paidNum ? [{ method, amount: paidNum }] : [], paid: paidNum, balance: Math.max(0, r.total - paidNum), notes: notes || undefined,
      }, "purchase");
      reset();
      ["purchases", "suppliers", "products", "products-lite"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Purchase save nahi hui. Dobara try karein."); } finally { lockRef.current = false; setSaving(false); }
  };

  const cell = "h-8 rounded-md border border-border bg-background px-2 text-sm";
  return (
    <AppShell title="Purchases" subtitle="Stock khareed aur supplier credit" active="/pos">
      {pc.node}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-8 pt-3">
        <PosSubnav />
        <section className="space-y-3 rounded-xl border border-border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-foreground">{docType === "purchase" ? "Naya purchase invoice" : "Purchase return"}</p>
            {docType === "return" ? <Button size="sm" variant="ghost" onClick={reset}>Purchase pe wapas</Button> : null}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <select className={posInput} value={supplierId} onChange={(e) => setSupplierId(e.target.value)} aria-label="Supplier">
              <option value="">— Cash purchase (bina supplier) —</option>
              {(sup?.suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name} · baqaya {rs(s.balance)}</option>)}
            </select>
            <div className="relative">
              <input className={posInput} value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && matches[0]) { e.preventDefault(); addProduct(matches[0]); } }} placeholder="Product search karein + Enter" />
              {matches.length ? (
                <ul className="absolute inset-x-0 top-11 z-20 rounded-lg border border-border bg-popover p-1 shadow-lg">
                  {matches.map((p) => <li key={p.id}><button type="button" className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={() => addProduct(p)}>{p.name} <span className="text-xs text-muted-foreground">stock {p.stock}</span></button></li>)}
                </ul>
              ) : null}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th>Item</th><th>Qty</th><th>Rate</th><th>Disc</th><th>Tax %</th><th>Batch</th><th>Expiry</th><th className="text-right">Total</th><th /></tr></thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="py-1.5">{l.name} <span className="text-xs text-muted-foreground">{l.unit}</span></td>
                    <td><input className={`${cell} w-16`} value={l.qty} inputMode="decimal" onChange={(e) => set(i, { qty: e.target.value })} aria-label="Qty" /></td>
                    <td><input className={`${cell} w-20`} value={l.rate} inputMode="decimal" onChange={(e) => set(i, { rate: e.target.value })} aria-label="Rate" /></td>
                    <td><input className={`${cell} w-16`} value={l.discount} inputMode="decimal" onChange={(e) => set(i, { discount: e.target.value })} aria-label="Discount" /></td>
                    <td><input className={`${cell} w-14`} value={l.tax} inputMode="decimal" onChange={(e) => set(i, { tax: e.target.value })} aria-label="Tax" /></td>
                    <td><input className={`${cell} w-20`} value={l.batch} onChange={(e) => set(i, { batch: e.target.value })} aria-label="Batch" /></td>
                    <td><input className={`${cell} w-32`} type="date" value={l.expiry} onChange={(e) => set(i, { expiry: e.target.value })} aria-label="Expiry" /></td>
                    <td className="text-right font-semibold">{rs(lineTotal(l))}</td>
                    <td><Button size="icon-sm" variant="ghost" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="Hatayein"><Trash2 /></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!lines.length ? <p className="py-6 text-center text-xs text-muted-foreground">Upar se product search kar ke add karein.</p> : null}
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <input className={posInput} value={discount} inputMode="decimal" onChange={(e) => setDiscount(e.target.value)} placeholder="Bill discount" />
            <input className={posInput} value={paid} inputMode="decimal" onChange={(e) => setPaid(e.target.value)} placeholder={`${docType === "purchase" ? "Diya" : "Wapas mila"} (khali = poora ${rs(total)})`} />
            <select className={posInput} value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Method">{PAY_OPTS.map((m) => <option key={m}>{m}</option>)}</select>
            <input className={posInput} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Note" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-2 p-3 text-sm">
            <span>Total <b className="text-foreground">{rs(total)}</b> · Paid {rs(paidNum)} · <span className={total - paidNum > 0 ? "text-destructive" : ""}>Credit {rs(total - paidNum)}</span></span>
            <Button size="lg" disabled={saving || !lines.length} onClick={save}><PackagePlus /> {docType === "purchase" ? "Purchase save (stock +)" : "Return save (stock −)"}</Button>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-3">
          <p className="mb-2 text-sm font-bold text-foreground">Purchase history</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th>No.</th><th>Type</th><th>Supplier</th><th>Total</th><th>Paid</th><th>Baqaya</th><th>Date</th><th /></tr></thead>
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
            {hist && !hist.purchases.length ? <p className="py-3 text-center text-xs text-muted-foreground">Abhi koi purchase nahi.</p> : null}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
