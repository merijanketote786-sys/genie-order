import { AppShell } from "@/components/app-shell";
import { usePosAccess } from "@/components/pos-access";
import { PosSubnav, posInput, rs } from "@/components/pos-subnav";
import { StoreSwitcher, useActiveStore } from "@/components/store-switcher";
import { Button } from "@/components/ui/button";
import { listInventory, type InvProduct } from "@/lib/inventory.functions";
import { deleteRecipe, listRecipes, manufactureProduct, saveRecipe } from "@/lib/manufacturing.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Factory, Plus, Save, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

type Search = { product?: string };

export const Route = createFileRoute("/_authenticated/item-manufacturing")({
  validateSearch: (s: Record<string, unknown>): Search => ({ product: typeof s.product === "string" ? s.product : undefined }),
  head: () => ({
    meta: [
      { title: "Item Manufacturing — HB Chemicals Pakistan Workspace" },
      { name: "description", content: "Set raw materials and manufacturing expenses per product, see total cost, and manufacture stock." },
      { property: "og:title", content: "Item Manufacturing — HB Chemicals Pakistan Workspace" },
      { property: "og:description", content: "Raw materials, expenses and manufacturing cost for each product." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManufacturingPage,
});

type MatRow = { productId: string; qty: string };
type ExpRow = { name: string; amount: string };
const num = (s: string) => { const n = Number(s); return Number.isFinite(n) ? n : 0; };

function ProductSearch({ products, value, onPick, placeholder, exclude }: { products: InvProduct[]; value: string; onPick: (id: string) => void; placeholder: string; exclude?: string }) {
  const cur = products.find((p) => p.id === value);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);
  const hits = useMemo(() => {
    const t = q.trim().toLowerCase();
    return products.filter((p) => p.id !== exclude && (!t || [p.name, p.sku, p.barcode, p.category].some((v) => v.toLowerCase().includes(t)))).slice(0, 50);
  }, [products, q, exclude]);
  useEffect(() => { listRef.current?.children[hi]?.scrollIntoView({ block: "nearest" }); }, [hi]);
  const pick = (id: string) => { onPick(id); setQ(""); setOpen(false); };
  return (
    <div className="relative">
      <label className="flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 focus-within:border-primary">
        <Search className="size-4 shrink-0 text-primary" />
        <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={open ? q : cur?.name ?? q} placeholder={placeholder}
          onFocus={() => { setOpen(true); setHi(0); }} onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, hits.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
            else if (e.key === "Enter" && hits[hi]) { e.preventDefault(); pick(hits[hi].id); }
          }} />
      </label>
      {open && hits.length ? (
        <ul ref={listRef} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-popover shadow-lg">
          {hits.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === hi} onMouseDown={(e) => { e.preventDefault(); pick(p.id); }}
              className={`flex cursor-pointer justify-between gap-2 px-3 py-2 text-sm ${i === hi ? "bg-accent text-accent-foreground" : "text-popover-foreground"}`}>
              <span className="truncate">{p.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">Stock {p.stock} {p.unit} · {p.purchasePrice != null ? rs(p.purchasePrice) : "no cost"}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ManufacturingPage() {
  const qc = useQueryClient();
  const { can } = usePosAccess();
  const search = Route.useSearch();
  const canEdit = can("edit_products");
  const { data: inv } = useQuery({ queryKey: ["inventory"], queryFn: () => listInventory() });
  const { data: rec } = useQuery({ queryKey: ["recipes"], queryFn: () => listRecipes() });
  const activeStore = useActiveStore();
  const products = useMemo(() => {
    const list = inv?.products ?? [];
    const st = activeStore.stock;
    return st ? list.map((p) => ({ ...p, stock: st.byId[p.id] ?? 0 })) : list;
  }, [inv, activeStore.stock]);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const [productId, setProductId] = useState(search.product ?? "");
  const [outputQty, setOutputQty] = useState("1");
  const [mats, setMats] = useState<MatRow[]>([{ productId: "", qty: "" }]);
  const [exps, setExps] = useState<ExpRow[]>([{ name: "", amount: "" }]);
  const [makeQty, setMakeQty] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (search.product) setProductId(search.product); }, [search.product]);
  const saved = rec?.recipes.find((r) => r.productId === productId);
  useEffect(() => {
    if (!productId) return;
    if (saved) {
      setOutputQty(String(saved.outputQty));
      setMats(saved.materials.length ? saved.materials.map((m) => ({ productId: m.product_id, qty: String(m.qty) })) : [{ productId: "", qty: "" }]);
      setExps(saved.expenses.length ? saved.expenses.map((e) => ({ name: e.name, amount: String(e.amount) })) : [{ name: "", amount: "" }]);
    } else { setOutputQty("1"); setMats([{ productId: "", qty: "" }]); setExps([{ name: "", amount: "" }]); }
    setMakeQty("");
  }, [productId, saved]);

  const product = byId.get(productId);
  const matCost = mats.reduce((s, m) => s + num(m.qty) * (byId.get(m.productId)?.purchasePrice ?? 0), 0);
  const expCost = exps.reduce((s, e) => s + num(e.amount), 0);
  const total = matCost + expCost;
  const oq = num(outputQty);
  const unitCost = oq > 0 ? total / oq : 0;
  const factor = oq > 0 ? num(makeQty) / oq : 0;

  const save = async () => {
    if (!productId) return toast.error("Select a product first");
    if (!(oq > 0)) return toast.error("Enter the total quantity produced");
    const materials = mats.filter((m) => m.productId).map((m) => ({ product_id: m.productId, qty: num(m.qty) }));
    if (!materials.length) return toast.error("Add at least one raw material");
    if (materials.some((m) => !(m.qty > 0))) return toast.error("Enter quantity for every raw material");
    const expenses = exps.filter((e) => e.name.trim() || num(e.amount)).map((e) => ({ name: e.name.trim() || "Expense", amount: num(e.amount) }));
    setBusy(true);
    try { await saveRecipe({ data: { productId, outputQty: oq, materials, expenses } }); toast.success("Manufacturing setup saved"); qc.invalidateQueries({ queryKey: ["recipes"] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!saved || !confirm("Remove the manufacturing setup for this product?")) return;
    try { await deleteRecipe({ data: { productId } }); toast.success("Setup removed"); qc.invalidateQueries({ queryKey: ["recipes"] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
  };
  const manufacture = async () => {
    if (activeStore.isAllStores) return toast.error("Select a specific store before manufacturing");
    if (!saved) return toast.error("Save the setup first");
    const q = num(makeQty);
    if (!(q > 0)) return toast.error("Enter quantity to manufacture");
    setBusy(true);
    try {
      const r = await manufactureProduct({ data: { productId, qty: q, note: "" } });
      toast.success(`Manufactured ${r.qty} — unit cost ${rs(r.unitCost)}`); setMakeQty("");
      ["store-stock", "inventory", "stock-ledger", "products", "pos-products", "products-lite"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Manufacturing failed"); } finally { setBusy(false); }
  };

  return (
    <AppShell title="Item Manufacturing" subtitle="Raw materials, expenses and cost" active="/pos">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-10 pt-3">
        <PosSubnav />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" asChild><Link to="/pos-settings"><ArrowLeft /> Settings</Link></Button>
          <h1 className="mr-auto flex items-center gap-2 text-lg font-bold text-foreground"><Factory className="size-5 text-primary" /> Item Manufacturing</h1>
          <StoreSwitcher />
        </div>
        {!canEdit ? <p className="rounded-lg border border-border bg-muted/40 p-2 text-xs text-muted-foreground">You can view setups; only Admin/Manager can change them.</p> : null}

        <section className="space-y-2 rounded-xl border border-border bg-card p-3">
          <p className="text-sm font-semibold text-foreground">Product to manufacture</p>
          <ProductSearch products={products} value={productId} onPick={setProductId} placeholder="Search product · ↑↓ select · Enter pick" />
          {product ? <p className="text-xs text-muted-foreground">Current stock {product.stock} {product.unit}{saved ? " · setup saved" : " · no setup yet"}</p> : null}
          {rec?.recipes.length ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {rec.recipes.map((r) => byId.get(r.productId) ? (
                <button key={r.productId} type="button" onClick={() => setProductId(r.productId)} className={`rounded-full border px-2.5 py-1 text-xs ${r.productId === productId ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:bg-muted"}`}>{byId.get(r.productId)!.name}</button>
              ) : null)}
            </div>
          ) : null}
        </section>

        {productId ? (
          <>
            <section className="space-y-2 rounded-xl border border-border bg-card p-3">
              <p className="text-sm font-semibold text-foreground">Raw materials</p>
              {mats.map((m, i) => {
                const p = byId.get(m.productId);
                return (
                  <div key={i} className="grid gap-2 sm:grid-cols-[1fr_8rem_8rem_auto] sm:items-center">
                    <ProductSearch products={products} value={m.productId} exclude={productId} placeholder="Select raw material from stock" onPick={(id) => setMats((x) => x.map((r, j) => (j === i ? { ...r, productId: id } : r)))} />
                    <input className={posInput} inputMode="decimal" placeholder={`Qty${p ? ` (${p.unit})` : ""}`} value={m.qty} disabled={!canEdit} onChange={(e) => setMats((x) => x.map((r, j) => (j === i ? { ...r, qty: e.target.value } : r)))} aria-label="Raw material quantity" />
                    <span className="text-right text-sm text-muted-foreground">{rs(num(m.qty) * (p?.purchasePrice ?? 0))}</span>
                    <Button variant="ghost" size="icon" disabled={!canEdit} onClick={() => setMats((x) => (x.length > 1 ? x.filter((_, j) => j !== i) : [{ productId: "", qty: "" }]))} aria-label="Remove raw material"><Trash2 /></Button>
                  </div>
                );
              })}
              <Button variant="outline" size="sm" disabled={!canEdit} onClick={() => setMats((x) => [...x, { productId: "", qty: "" }])}><Plus /> Add raw material</Button>
            </section>

            <section className="space-y-2 rounded-xl border border-border bg-card p-3">
              <p className="text-sm font-semibold text-foreground">Manufacturing expenses</p>
              {exps.map((e, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_10rem_auto] sm:items-center">
                  <input className={posInput} placeholder="Expense name (e.g. Labour, Packing, Electricity)" value={e.name} disabled={!canEdit} onChange={(ev) => setExps((x) => x.map((r, j) => (j === i ? { ...r, name: ev.target.value } : r)))} aria-label="Expense name" />
                  <input className={posInput} inputMode="decimal" placeholder="Amount" value={e.amount} disabled={!canEdit} onChange={(ev) => setExps((x) => x.map((r, j) => (j === i ? { ...r, amount: ev.target.value } : r)))} aria-label="Expense amount" />
                  <Button variant="ghost" size="icon" disabled={!canEdit} onClick={() => setExps((x) => (x.length > 1 ? x.filter((_, j) => j !== i) : [{ name: "", amount: "" }]))} aria-label="Remove expense"><Trash2 /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" disabled={!canEdit} onClick={() => setExps((x) => [...x, { name: "", amount: "" }])}><Plus /> Add expense</Button>
            </section>

            <section className="space-y-3 rounded-xl border-2 border-primary/40 bg-card p-3">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <label className="text-xs text-muted-foreground">Total quantity produced ({product?.unit ?? "unit"})
                  <input className={posInput} inputMode="decimal" value={outputQty} disabled={!canEdit} onChange={(e) => setOutputQty(e.target.value)} />
                </label>
                {[["Raw material cost", rs(matCost)], ["Expenses", rs(expCost)], ["Total cost", rs(total)], ["Cost per unit", rs(unitCost)]].map(([l, v]) => (
                  <div key={l} className="rounded-lg bg-muted/40 p-2"><p className="text-xs text-muted-foreground">{l}</p><p className="text-base font-bold text-foreground">{v}</p></div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={!canEdit || busy} onClick={save}><Save /> Save setup</Button>
                {saved ? <Button variant="ghost" disabled={!canEdit || busy} onClick={remove}><Trash2 /> Remove setup</Button> : null}
              </div>
              <p className="text-[11px] text-muted-foreground">Raw material cost uses each item's purchase price.</p>
            </section>

            <section className="space-y-2 rounded-xl border border-border bg-card p-3">
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground"><Factory className="size-4 text-primary" /> Manufacture now</p>
              <div className="flex flex-wrap items-center gap-2">
                <input className={`${posInput} w-40`} inputMode="decimal" placeholder={`Qty (${product?.unit ?? "unit"})`} value={makeQty} onChange={(e) => setMakeQty(e.target.value)} aria-label="Quantity to manufacture" />
                <Button disabled={busy || !saved || !can("edit_stock")} onClick={manufacture}><Factory /> Manufacture</Button>
              </div>
              {factor > 0 && saved ? (
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {saved.materials.map((m) => { const p = byId.get(m.product_id); const need = Math.round(m.qty * factor * 10000) / 10000; return (
                    <li key={m.product_id} className={p && p.stock < need ? "text-destructive" : ""}>− {need} {p?.unit} {p?.name ?? "?"} (stock {p?.stock ?? 0})</li>
                  ); })}
                  <li>Estimated cost {rs(unitCost * num(makeQty))}</li>
                </ul>
              ) : null}
            </section>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
