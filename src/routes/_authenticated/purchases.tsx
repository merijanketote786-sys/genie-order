import { useUnsavedGuard } from "@/hooks/use-unsaved-guard";
import { AppShell } from "@/components/app-shell";
import { PAY_OPTS, PosSubnav, posInput, rs } from "@/components/pos-subnav";
import { Button } from "@/components/ui/button";
import { cancelPurchase, ensurePurchaseParty, saveSupplier, getPurchaseItems, listProductsLite, listPurchases, listSuppliers, savePurchase } from "@/lib/business.functions";
import { listCustomerBalances } from "@/lib/ledger.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PackagePlus, Trash2, Undo2, Zap, MoreVertical, ReceiptText, Printer, Download, Share2, Pencil, Ban } from "lucide-react";
import { ShareDialog } from "@/components/share-dialog";
import type { PrintDoc } from "@/lib/print/render";
import { UnitSelect } from "@/components/unit-select";
import { createPosProduct } from "@/lib/inventory.functions";
import { useEffect, useMemo, useState, useRef } from "react";
import { toast } from "sonner";
import { newRef } from "@/lib/pos-errors";
import { usePrintCenter } from "@/components/print-center";
import { StoreSwitcher, useActiveStore } from "@/components/store-switcher";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UserPlus } from "lucide-react";

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
const GRID = "mgrid grid grid-cols-[36px_minmax(200px,2.4fr)_minmax(80px,0.8fr)_minmax(110px,1fr)_minmax(100px,1fr)_minmax(80px,0.8fr)_minmax(70px,0.7fr)_minmax(110px,1fr)_52px] items-center gap-2";

export function PurchasesPage({ embedded, startDocType }: { embedded?: boolean; startDocType?: "purchase" | "return" } = {}) {
  const qc = useQueryClient();
  const pc = usePrintCenter();
  const activeStore = useActiveStore();
  const [np, setNp] = useState<{ name: string; phone: string; address: string } | null>(null);
  const [npBusy, setNpBusy] = useState(false);
  const addNewParty = async () => {
    if (!np?.name.trim()) return toast.error("Party name is required");
    setNpBusy(true);
    try {
      const r = await saveSupplier({ data: { name: np.name.trim(), phone: np.phone.trim() || undefined, address: np.address.trim() || undefined } });
      await qc.invalidateQueries({ queryKey: ["suppliers"] });
      setSelectedParty({ id: r.id, source: "supplier", name: np.name.trim() }); setPartySearch(np.name.trim()); setNp(null);
      toast.success("Party added");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not add party"); } finally { setNpBusy(false); }
  };
  const { data: sup } = useQuery({ queryKey: ["suppliers"], queryFn: () => listSuppliers() });
   const { data: parties } = useQuery({ queryKey: ["customer-balances", "pos"], queryFn: () => listCustomerBalances({ data: { posOnly: true } }) });
  const { data: prod } = useQuery({ queryKey: ["products-lite"], queryFn: () => listProductsLite(), staleTime: 60_000 });
  const { data: hist } = useQuery({ queryKey: ["purchases"], queryFn: () => listPurchases() });
  const [docType, setDocType] = useState<"purchase" | "return">(startDocType ?? "purchase");
  const [refId, setRefId] = useState<string | undefined>();
  const [partySearch, setPartySearch] = useState("");
  const [partyOpen, setPartyOpen] = useState(false);
  const [partyIndex, setPartyIndex] = useState(0);
  const [selectedParty, setSelectedParty] = useState<{ id: string; source: "customer" | "supplier"; name: string } | null>(null);
  const partyRef = useRef<HTMLUListElement>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const guardNode = useUnsavedGuard(lines.length > 0, () => save());
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
  const [editId, setEditId] = useState<{ id: string; number: string } | undefined>();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const [share, setShare] = useState<{ title: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const today = new Date().toLocaleDateString("en-PK");

  const products = prod?.products ?? [];
  const partyOptions = useMemo(() => {
    const map = new Map<string, { id: string; source: "customer" | "supplier"; name: string; phone: string }>();
    const key = (phone: string, prefix: string) => { const digits = phone.replace(/\D/g, ""); return digits.length >= 7 ? `p${digits.slice(-10)}` : prefix; };
    for (const c of parties?.customers ?? []) map.set(key(c.phone, `c${c.id}`), { id: c.id, source: "customer", name: c.name || c.phone, phone: c.phone });
     const counts = new Map<string, number>();
     for (const s of sup?.suppliers ?? []) { const k = key(s.phone, `s${s.id}`); counts.set(k, (counts.get(k) ?? 0) + 1); }
     for (const s of sup?.suppliers ?? []) { const k = key(s.phone, `s${s.id}`); if ((counts.get(k) ?? 0) > 1) map.set(`s${s.id}`, { id: s.id, source: "supplier", name: s.name, phone: s.phone }); else map.set(k, { id: s.id, source: "supplier", name: map.get(k)?.name || s.name, phone: s.phone }); }
    const q = partySearch.trim().toLowerCase();
    return [...map.values()].filter((p) => !q || p.name.toLowerCase().includes(q) || p.phone.includes(q)).sort((a, b) => a.name.localeCompare(b.name));
  }, [parties, sup, partySearch]);
  useEffect(() => { partyRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }); }, [partyIndex]);
  const pickParty = (p: (typeof partyOptions)[number]) => { setSelectedParty(p); setPartySearch(p.name); setPartyOpen(false); };
  const matches = useMemo(() => {
    const t = term.trim().toLowerCase();
    return t && !staged ? products.filter((p) => p.name.toLowerCase().includes(t)).slice(0, 8) : [];
  }, [products, term, staged]);

  const lineTotal = (l: Line) => { const b = Math.max(0, num(l.qty) * num(l.rate) - num(l.discount)); return b + (b * num(l.tax)) / 100; };
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0);
  const total = Math.max(0, subtotal - num(discount));
  const isCredit = method === "Credit";
  const paidNum = isCredit ? 0 : paid.trim() ? Math.min(num(paid), total) : total;
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

  const reset = () => { setLines([]); setDiscount(""); setPaid(""); setNotes(""); setRefId(undefined); setEditId(undefined); setDocType("purchase"); setSelectedParty(null); setPartySearch(""); clearEntry(); };

  const startReturn = async (id: string) => {
    const r = await getPurchaseItems({ data: { id } });
    setDocType("return"); setRefId(id); setSelectedParty(r.purchase?.supplier_id ? { id: r.purchase.supplier_id, source: "supplier", name: r.purchase.supplier_name || "Party" } : null); setPartySearch(r.purchase?.supplier_name ?? "");
    setLines(r.items.map((i) => ({ productId: i.productId ?? undefined, name: i.name, unit: i.unit, qty: String(i.qty), rate: String(i.rate), discount: "", tax: String(i.taxPercent), batch: "", expiry: "" })));
    setNotes(`Return of ${r.purchase?.doc_number ?? ""}`);
    toast.message("Adjust the quantity for the return, then save");
  };

  type Hist = NonNullable<typeof hist>["purchases"][number];
  const loadDoc = async (p: Hist): Promise<PrintDoc> => {
    const r = await getPurchaseItems({ data: { id: p.id } });
    return {
      kind: "purchase", id: p.id, title: p.doc_type === "purchase" ? "Purchase Invoice" : "Purchase Return", number: p.doc_number, date: p.created_at,
       party: p.supplier_name ? { label: "Party", name: p.supplier_name } : undefined,
      lines: r.items.map((i) => ({ name: i.name, unit: i.unit, qty: i.qty, rate: i.rate, discount: i.discount, taxPct: i.taxPercent, total: i.lineTotal })),
      totals: [...(p.discount_total ? [{ label: "Discount", value: -p.discount_total }] : []), { label: "Grand Total", value: p.grand_total, bold: true }],
      payments: p.paid_total ? [{ method: "Paid", amount: p.paid_total }] : [], paid: p.paid_total, balance: p.balance, notes: p.notes ?? undefined,
    } as PrintDoc;
  };
  const run = async (f: () => Promise<void>) => { setBusy(true); try { await f(); } catch (e) { toast.error(e instanceof Error ? e.message : "Action failed"); } finally { setBusy(false); } };
  const refreshAll = () => ["purchases", "suppliers", "products", "products-lite"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const doShare = (p: Hist) => run(async () => {
    const d = await loadDoc(p);
     const text = [`*${d.title} ${p.doc_number}*`, new Date(p.created_at).toLocaleString("en-PK"), p.supplier_name ? `Party: ${p.supplier_name}` : "", "",
      ...(d.lines ?? []).map((l) => `${l.name} — ${l.qty} x ${rs(l.rate)} = ${rs(l.total)}`), "", `Total: ${rs(p.grand_total)}`, `Paid: ${rs(p.paid_total)}`, p.balance > 0 ? `Balance: ${rs(p.balance)}` : ""].filter((x) => x !== "").join("\n");
    setShare({ title: p.doc_number, text });
  });
  const doEdit = (p: Hist) => run(async () => {
    const r = await getPurchaseItems({ data: { id: p.id } });
    setDocType(p.doc_type === "return" ? "return" : "purchase"); setSelectedParty(p.supplier_id ? { id: p.supplier_id, source: "supplier", name: p.supplier_name || "Party" } : null); setPartySearch(p.supplier_name ?? ""); setRefId(p.doc_type === "return" ? p.ref_purchase_id ?? undefined : undefined);
    setLines(r.items.map((i) => ({ productId: i.productId ?? undefined, name: i.name, unit: i.unit, qty: String(i.qty), rate: String(i.rate), discount: i.discount ? String(i.discount) : "", tax: String(i.taxPercent), batch: "", expiry: "" })));
    setDiscount(p.discount_total ? String(p.discount_total) : ""); setPaid(String(p.paid_total)); setNotes(p.notes ?? "");
    setEditId({ id: p.id, number: p.doc_number });
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast.message(`Editing ${p.doc_number} — saving will replace the old entry`);
  });
  const doCancel = (p: Hist) => {
    const reason = window.prompt(`Cancel ${p.doc_number}? Reason (optional):`);
    if (reason === null) return;
    void run(async () => { await cancelPurchase({ data: { id: p.id, reason } }); toast.success(`${p.doc_number} cancelled`); if (editId?.id === p.id) reset(); refreshAll(); });
  };

  const lockRef = useRef(false);
  const opRef = useRef(newRef());
  const save = async () => {
    const valid = lines.filter((l) => l.name.trim() && num(l.qty) > 0);
    if (!valid.length) return toast.error("Enter at least one item");
    if (activeStore.isAllStores) return toast.error("Select a specific store before saving a purchase");
    if (paidNum < total && !selectedParty) return toast.error("Select a party for a credit purchase");
    if (lockRef.current) return;
    lockRef.current = true;
    setSaving(true);
    try {
      // Edit: cancel the old entry first so a refused cancel never leaves two live entries.
      if (editId) await cancelPurchase({ data: { id: editId.id, reason: "Edited — replaced by a new entry" } });
      const resolved = selectedParty ? await ensurePurchaseParty({ data: selectedParty.source === "customer" ? { customerId: selectedParty.id } : { supplierId: selectedParty.id } }) : null;
      const r = await savePurchase({ data: {
        docType, supplierId: resolved?.id, paid: paidNum, method, discount: num(discount), notes: notes || undefined, refPurchaseId: refId, clientRef: opRef.current,
        items: valid.map((l) => ({ productId: l.productId, name: l.name, unit: l.unit, qty: num(l.qty), rate: num(l.rate), discount: num(l.discount), taxPercent: num(l.tax), batch: l.batch || undefined, expiry: l.expiry || undefined })),
      } });
      opRef.current = newRef();
      setEditId(undefined);
      toast.success(`${docType === "purchase" ? "Purchase" : "Purchase return"} saved: ${r.number} — ${rs(r.total)}`);
      const supName = selectedParty?.name ?? resolved?.name;
      pc.afterSave({
        kind: "purchase", title: docType === "purchase" ? "Purchase Invoice" : "Purchase Return", number: r.number, date: new Date(),
         party: supName ? { label: "Party", name: supName } : undefined,
        lines: valid.map((l) => ({ name: l.name, unit: l.unit, qty: num(l.qty), rate: num(l.rate), discount: num(l.discount), taxPercent: num(l.tax), total: lineTotal(l) })),
        totals: [...(num(discount) ? [{ label: "Discount", value: -num(discount) }] : []), { label: "Grand Total", value: r.total, bold: true }],
        payments: paidNum ? [{ method, amount: paidNum }] : [], paid: paidNum, balance: Math.max(0, r.total - paidNum), notes: notes || undefined,
      }, "purchase");
      reset();
      ["purchases", "suppliers", "customer-balances", "products", "products-lite"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    } catch (e) { if (editId) { setEditId(undefined); qc.invalidateQueries({ queryKey: ["purchases"] }); } toast.error(e instanceof Error ? e.message : "Purchase could not be saved. Please try again."); } finally { lockRef.current = false; setSaving(false); }
  };

  const onKeys = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void save(); }
  };

  const cell = "h-9 w-full rounded-sm border border-border bg-background px-2 text-sm";
  const head = "text-[11px] font-bold uppercase tracking-wide text-muted-foreground";
  const body = (
      <div className={embedded ? "space-y-3" : "min-h-0 flex-1 space-y-3 overflow-y-auto pb-8 pt-3"} onKeyDown={onKeys}>
        {embedded ? null : <PosSubnav />}
          <section className="rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex items-center gap-3">
              <p className="text-lg font-bold text-foreground">{docType === "purchase" ? "Purchase" : "Purchase Return"}</p>
              <div className="inline-flex rounded-full border-2 border-primary p-0.5" role="tablist" aria-label="Document type">
                <button type="button" role="tab" aria-selected={docType === "purchase"} onClick={() => { if (docType !== "purchase") reset(); }} className={`rounded-full px-4 py-1.5 text-sm font-bold ${docType === "purchase" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Purchase</button>
                <button type="button" role="tab" aria-selected={docType === "return"} onClick={() => { setDocType("return"); setRefId(undefined); }} className={`rounded-full px-4 py-1.5 text-sm font-bold ${docType === "return" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Return</button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3"><StoreSwitcher /><div className="text-right text-sm text-muted-foreground">Bill date <b className="text-foreground">{today}</b></div></div>
          </div>

          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            <div className="relative min-w-0 flex-1 sm:min-w-[260px]">
               <input className={posInput} value={partySearch} aria-label="Party" placeholder="Search party by name or phone (optional for cash)" autoComplete="off" onFocus={() => setPartyOpen(true)} onBlur={() => setTimeout(() => setPartyOpen(false), 150)} onChange={(e) => { setPartySearch(e.target.value); setSelectedParty(null); setPartyIndex(0); setPartyOpen(true); }} onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setPartyIndex((i) => Math.max(0, Math.min(i + 1, partyOptions.length - 1))); } else if (e.key === "ArrowUp") { e.preventDefault(); setPartyIndex((i) => Math.max(i - 1, 0)); } else if (e.key === "Enter" && partyOptions[partyIndex]) { e.preventDefault(); pickParty(partyOptions[partyIndex]); } else if (e.key === "Escape") setPartyOpen(false); }} />
              {partyOpen && partyOptions.length > 0 ? <ul ref={partyRef} role="listbox" className="absolute left-0 right-0 top-full z-40 mt-1 max-h-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg">{partyOptions.map((p, i) => <li key={`${p.source}-${p.id}`} role="option" aria-selected={partyIndex === i}><button type="button" className={`w-full rounded px-2 py-2 text-left text-sm ${partyIndex === i ? "bg-accent" : "hover:bg-accent"}`} onMouseDown={(e) => { e.preventDefault(); pickParty(p); }}>{p.name}{p.phone ? <span className="ml-2 text-xs text-muted-foreground">{p.phone}</span> : null}</button></li>)}</ul> : null}
            </div>
             {selectedParty ? <Button type="button" size="sm" variant="outline" onClick={() => { setSelectedParty(null); setPartySearch(""); }}>Clear</Button> : null}
             <Button type="button" size="sm" variant="outline" onClick={() => setNp({ name: selectedParty ? "" : partySearch, phone: "", address: "" })}><UserPlus /> Add party</Button>
             <Dialog open={!!np} onOpenChange={(o) => { if (!o) setNp(null); }}>
               <DialogContent className="max-w-md">
                 <DialogHeader><DialogTitle>Add party</DialogTitle></DialogHeader>
                 <div className="space-y-2">
                   <input className={posInput} autoFocus placeholder="Party name *" value={np?.name ?? ""} onChange={(e) => setNp((x) => x && { ...x, name: e.target.value })} />
                   <input className={posInput} placeholder="Phone (optional)" inputMode="tel" value={np?.phone ?? ""} onChange={(e) => setNp((x) => x && { ...x, phone: e.target.value.replace(/[^\d+\s-]/g, "") })} />
                   <input className={posInput} placeholder="Address (optional)" value={np?.address ?? ""} onChange={(e) => setNp((x) => x && { ...x, address: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addNewParty(); } }} />
                   <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setNp(null)}>Cancel</Button><Button disabled={npBusy} onClick={() => void addNewParty()}>{npBusy ? "Saving..." : "Save party"}</Button></div>
                 </div>
               </DialogContent>
             </Dialog>
          </div>

          <div className="overflow-x-auto">
            <div className="md:min-w-[900px]">
              <div className={`mhead ${GRID} border-y border-border bg-surface-2 px-2 py-2`}>
                <span className={head}>#</span><span className={head}>Item</span><span className={head}>Qty</span><span className={head}>Unit</span><span className={head}>Price/Unit</span><span className={head}>Disc</span><span className={head}>Tax %</span><span className={`${head} text-right`}>Amount</span><span />
              </div>

              <div className="entry-bar relative px-2 py-2.5"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.ctrlKey && !e.altKey && !e.metaKey && (e.target as HTMLElement).tagName !== "BUTTON") { e.preventDefault(); void confirm(); } else if (e.key === "Escape") clearEntry(); }}>
                <div className={GRID}>
                  <span className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground"><Zap className="size-4" /></span>
                  <input ref={searchRef} className={`${cell} font-medium`} value={term} autoFocus aria-label="Search product"
                    onChange={(e) => { setTerm(e.target.value); setStaged(null); setHi(0); }}
                    onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, matches.length - 1)); } else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); } }}
                    placeholder="Search or type new product · ↑↓ select · Enter add" />
                  <input className={cell} value={sf.qty} inputMode="decimal" aria-label="Qty" placeholder="Qty · Tab next" onChange={(e) => setSf({ ...sf, qty: e.target.value })} />
                  <UnitSelect value={sf.unit} onChange={(v) => setSf({ ...sf, unit: v })} className={cell} label="Unit" />
                  <input className={cell} value={sf.rate} inputMode="decimal" aria-label="Price/Unit" placeholder="Rate · Enter adds" onChange={(e) => setSf({ ...sf, rate: e.target.value })} />
                  <input className={cell} value={sf.discount} inputMode="decimal" aria-label="Discount" placeholder="Disc" onChange={(e) => setSf({ ...sf, discount: e.target.value })} />
                  <input className={cell} value={sf.tax} inputMode="decimal" aria-label="Tax" placeholder="Tax %" onChange={(e) => setSf({ ...sf, tax: e.target.value })} />
                  <span className="text-right text-sm font-semibold">{rs(stagedAmount)}</span>
                  <Button size="icon-sm" className="entry-add h-11 w-full shrink-0 px-0" onClick={() => void confirm()} disabled={savingNew || !term.trim()} aria-label="Add to bill"><Zap className="size-5" /></Button>
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

              <div className={`mtotal ${GRID} bg-surface-2 px-2 py-2`}>
                <span />
                <button type="button" className="w-fit rounded-md border border-primary px-3 py-1 text-xs font-bold text-primary" onClick={() => searchRef.current?.focus()}>ADD ROW</button>
                <span className="text-sm font-bold">{totalQty}</span><span /><span /><span /><span className="text-xs font-bold text-muted-foreground">TOTAL</span>
                <span className="text-right text-sm font-bold">{rs(subtotal)}</span><span />
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-4 md:grid-cols-2">
            <div className="space-y-2">
              <select className={posInput} value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Payment type">{[...PAY_OPTS, "Credit"].map((m) => <option key={m}>{m}</option>)}</select>
               {isCredit && <p className="text-xs text-muted-foreground">Full amount will be added to the party's balance (payable).</p>}
              <textarea className={`${posInput} min-h-20 py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Description / note" />
            </div>
            <div className="space-y-2 text-sm">
              <label className="flex items-center justify-between gap-3"><span className="text-muted-foreground">Discount (Rs)</span><input className={`${cell} max-w-40 text-right`} value={discount} inputMode="decimal" onChange={(e) => setDiscount(e.target.value)} /></label>
              <div className="flex items-center justify-between border-t border-border pt-2 text-base"><span className="font-bold">Total</span><b className="text-foreground">{rs(total)}</b></div>
              <label className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{docType === "purchase" ? "Paid" : "Refunded"}</span><input className={`${cell} max-w-40 text-right`} value={isCredit ? "0" : paid} disabled={isCredit} inputMode="decimal" placeholder={String(total)} onChange={(e) => setPaid(e.target.value)} /></label>
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
               <thead><tr className="text-left text-xs text-muted-foreground"><th>No.</th><th>Type</th><th>Party</th><th>Total</th><th>Paid</th><th>Balance</th><th>Date</th><th /></tr></thead>
              <tbody>
                {(hist?.purchases ?? []).map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="py-1.5 font-semibold">{p.doc_number}</td><td>{p.doc_type === "purchase" ? "Purchase" : "Return"}</td><td>{p.supplier_name}</td>
                    <td>{rs(p.grand_total)}</td><td>{rs(p.paid_total)}</td><td>{rs(p.balance)}</td><td className="text-xs">{new Date(p.created_at).toLocaleString("en-PK")}</td>
                    <td className="relative text-right">
                      <button type="button" title="Actions" aria-label={`Actions for ${p.doc_number}`} disabled={busy} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); const h = 330; setMenuPos({ top: r.bottom + h > window.innerHeight ? Math.max(8, r.top - h) : r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) }); setMenuFor(menuFor === p.id ? null : p.id); }} className="rounded-lg border border-border p-1.5 hover:bg-accent disabled:opacity-50"><MoreVertical className="size-4" /></button>
                      {menuFor === p.id ? (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setMenuFor(null)} />
                          <div style={{ top: menuPos.top, right: menuPos.right }} className="fixed z-50 w-52 overflow-hidden rounded-xl border border-border bg-popover py-1 text-left shadow-xl">
                            {([
                              [<ReceiptText key="a" className="size-4" />, "Preview", () => run(async () => pc.preview(await loadDoc(p), true))],
                              [<Printer key="b" className="size-4" />, "Reprint", () => run(async () => { await pc.print(await loadDoc(p), { reprint: true }); })],
                              [<Download key="c" className="size-4" />, "PDF", () => run(async () => { await pc.pdf(await loadDoc(p)); })],
                              [<Share2 key="d" className="size-4" />, "Share", () => doShare(p)],
                              [<Pencil key="e" className="size-4" />, "Edit", () => doEdit(p)],
                              ...(p.doc_type === "purchase" ? [[<Undo2 key="f" className="size-4" />, "Return", () => startReturn(p.id)]] : []),
                              [<Ban key="g" className="size-4" />, "Cancel", () => doCancel(p), true],
                            ] as [React.ReactNode, string, () => void, boolean?][]).map(([icon, label, fn, danger]) => (
                              <button key={label} type="button" onClick={() => { setMenuFor(null); fn(); }} className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent ${danger ? "text-destructive" : "text-foreground"}`}>{icon} {label}</button>
                            ))}
                          </div>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hist && !hist.purchases.length ? <p className="py-3 text-center text-xs text-muted-foreground">No purchases yet.</p> : null}
          </div>
        </section>
      </div>
  );
  const shareNode = share ? <ShareDialog title={share.title} text={share.text} onClose={() => setShare(null)} /> : null;
  if (embedded) return <>{pc.node}{guardNode}{shareNode}{body}</>;
  return (
    <AppShell title="Purchases" subtitle="Stock purchases and party credit" active="/pos" wide>
      {pc.node}
      {guardNode}
      {shareNode}
      {body}
    </AppShell>
  );
}
