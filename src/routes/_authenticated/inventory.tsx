import { AppShell } from "@/components/app-shell";
import { PosSubnav, posInput, rs } from "@/components/pos-subnav";
import { StoreSwitcher, useActiveStore } from "@/components/store-switcher";
import { Button } from "@/components/ui/button";
import { adjustStock, getStockLedger, listInventory, updateProductDetails, type InvProduct } from "@/lib/inventory.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { NewPosProduct } from "@/components/new-pos-product";
import { AlertTriangle, Download, Plus, Search, Table2 } from "lucide-react";
import { BulkUpdateProducts } from "@/components/bulk-update-products";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — HB Chemicals Pakistan Workspace" },
      { name: "description", content: "Stock, low-stock alerts, stock valuation, adjustments, stock ledger and product details." },
      { property: "og:title", content: "Inventory — HB Chemicals Pakistan Workspace" },
      { property: "og:description", content: "Stock and product management." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InventoryPage,
});

const KIND: Record<string, string> = { opening: "Opening", sale: "Sale", sale_return: "Sale return", purchase: "Purchase", purchase_return: "Purchase return", adjust_in: "Stock in", adjust_out: "Stock out", damage: "Damage", transfer_in: "Transfer in", transfer_out: "Transfer out", cancel: "Cancel" };
type Edit = Record<"salePrice" | "sku" | "barcode" | "category" | "brand" | "purchasePrice" | "wholesalePrice" | "wholesaleMinQty" | "minSalePrice" | "minStock" | "taxPercent", string>;
const toEdit = (p: InvProduct): Edit => ({ salePrice: String(p.salePrice ?? 0), sku: p.sku, barcode: p.barcode, category: p.category, brand: p.brand, purchasePrice: p.purchasePrice?.toString() ?? "", wholesalePrice: p.wholesalePrice?.toString() ?? "", wholesaleMinQty: p.wholesaleMinQty?.toString() ?? "", minSalePrice: p.minSalePrice?.toString() ?? "", minStock: p.minStock?.toString() ?? "", taxPercent: p.taxPercent?.toString() ?? "" });
const n = (s: string) => (s.trim() === "" ? null : Number(s) || 0);

function InventoryPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["inventory"], queryFn: () => listInventory() });
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "low" | "out">("all");
  const [cat, setCat] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [adj, setAdj] = useState({ qty: "", kind: "adjust_in", note: "" });
  const [adding, setAdding] = useState(false);
  const [bulk, setBulk] = useState(false);
  const { data: led } = useQuery({ queryKey: ["stock-ledger", sel], queryFn: () => getStockLedger({ data: { id: sel! } }), enabled: !!sel });

  const activeStore = useActiveStore();
  const all = useMemo(() => {
    const list = data?.products ?? [];
    const st = activeStore.stock;
    if (!st) return list;
    const vis = activeStore.commonProducts ? null : new Set(st.visibleIds);
    return list.filter((p) => !vis || vis.has(p.id)).map((p) => ({ ...p, stock: st.byId[p.id] ?? 0 }));
  }, [data, activeStore.stock, activeStore.commonProducts]);
  const cats = useMemo(() => [...new Set(all.map((p) => p.category).filter(Boolean))].sort(), [all]);
  const isLow = (p: InvProduct) => p.minStock != null && p.stock <= p.minStock;
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter((p) => (filter === "all" || (filter === "low" ? isLow(p) : p.stock <= 0)) && (!cat || p.category === cat) && (!t || [p.name, p.sku, p.barcode, p.category, p.brand].some((v) => v.toLowerCase().includes(t))));
  }, [all, q, filter, cat]);
  const cur = all.find((p) => p.id === sel);
  const value = all.reduce((s, p) => s + Math.max(0, p.stock) * (p.purchasePrice ?? 0), 0);
  const noCost = all.filter((p) => p.purchasePrice == null).length;

  const refresh = () => ["store-stock", "inventory", "stock-ledger", "products", "pos-products", "products-lite"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const saveEdit = async () => {
    if (!cur || !edit) return;
    try {
      await updateProductDetails({ data: { id: cur.id, salePrice: n(edit.salePrice), sku: edit.sku, barcode: edit.barcode, category: edit.category, brand: edit.brand, purchasePrice: n(edit.purchasePrice), wholesalePrice: n(edit.wholesalePrice), wholesaleMinQty: n(edit.wholesaleMinQty), minSalePrice: n(edit.minSalePrice), minStock: n(edit.minStock), taxPercent: n(edit.taxPercent) } });
      toast.success("Product saved"); refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not complete"); }
  };
  const doAdjust = async () => {
    if (activeStore.isAllStores) return toast.error("Select a specific store before adjusting stock");
    const qty = Number(adj.qty);
    if (!cur || !(qty > 0)) return toast.error("Enter a quantity");
    try {
      await adjustStock({ data: { id: cur.id, qty, kind: adj.kind as "adjust_in", note: adj.note } });
      toast.success("Stock updated"); setAdj({ qty: "", kind: adj.kind, note: "" }); refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not complete"); }
  };
  const exportCsv = () => {
    const head = ["Name", "SKU", "Barcode", "Category", "Unit", "Stock", "Min stock", "Purchase price", "Sale price", "Stock value"];
    const rows = list.map((p) => [p.name, p.sku, p.barcode, p.category, p.unit, p.stock, p.minStock ?? "", p.purchasePrice ?? "", p.salePrice, (Math.max(0, p.stock) * (p.purchasePrice ?? 0)).toFixed(2)]);
    const csv = [head, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "stock-report.csv"; a.click();
  };

  const F = ({ k, label, dec }: { k: keyof Edit; label: string; dec?: boolean }) => (
    <label className="text-xs text-muted-foreground">{label}<input className={posInput} value={edit?.[k] ?? ""} inputMode={dec ? "decimal" : undefined} onChange={(e) => setEdit((x) => (x ? { ...x, [k]: e.target.value } : x))} /></label>
  );

  return (
    <AppShell title="Inventory" subtitle="Stock and products" active="/pos">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pb-8 pt-3">
        <PosSubnav />
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[["Products", String(all.length)], ["Stock value (purchase)", rs(value)], ["Low stock", String(all.filter(isLow).length)], ["Out of stock", String(all.filter((p) => p.stock <= 0).length)]].map(([l, v]) => (
            <div key={l} className="rounded-lg border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="text-lg font-bold text-foreground">{v}</p></div>
          ))}
        </div>
        {noCost ? <p className="text-xs text-muted-foreground">{noCost} products have no purchase price set — select a product and enter the purchase price to show accurate stock value and profit (or it fills in automatically on purchase).</p> : null}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {activeStore.isAllStores ? <span className="text-xs text-muted-foreground">Combined stock · select a store to make stock changes</span> : null}
          <StoreSwitcher />
          <Button variant={adding ? "secondary" : "outline"} disabled={activeStore.isAllStores} onClick={() => setAdding((b) => !b)}><Plus /> New item</Button>
          <Button variant={bulk ? "secondary" : "default"} disabled={activeStore.isAllStores} onClick={() => setBulk((b) => !b)}><Table2 /> {bulk ? "Close bulk update" : "Bulk update items"}</Button>
        </div>
        {adding ? <NewPosProduct onClose={() => setAdding(false)} onSaved={() => { setAdding(false); refresh(); }} /> : null}
        {bulk ? <BulkUpdateProducts products={all} onClose={() => setBulk(false)} onSaved={refresh} /> : null}
        <div className={`grid gap-3 lg:grid-cols-[1.2fr_1fr] ${bulk ? "hidden" : ""}`}>
          <section className="space-y-2 rounded-xl border border-border bg-card p-3">
            <div className="flex flex-wrap gap-2">
              <label className="flex h-10 min-w-48 flex-1 items-center gap-2 rounded-lg border border-border px-3 focus-within:border-primary">
                <Search className="size-4 text-primary" /><input className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, SKU, barcode, category" />
              </label>
              <select className={`${posInput} w-36`} value={filter} onChange={(e) => setFilter(e.target.value as "all")} aria-label="Filter"><option value="all">All</option><option value="low">Low stock</option><option value="out">Out of stock</option></select>
              <select className={`${posInput} w-40`} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category"><option value="">Every category</option>{cats.map((c) => <option key={c}>{c}</option>)}</select>
              <Button variant="outline" onClick={exportCsv}><Download /> CSV</Button>
            </div>
            <div className="max-h-[32rem] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card"><tr className="text-left text-xs text-muted-foreground"><th>Product</th><th>Category</th><th className="text-right">Stock</th><th className="text-right">Cost</th><th className="text-right">Value</th></tr></thead>
                <tbody>
                  {list.slice(0, 500).map((p) => (
                    <tr key={p.id} onClick={() => { setSel(p.id); setEdit(toEdit(p)); }} className={`cursor-pointer border-t border-border hover:bg-accent ${sel === p.id ? "bg-accent" : ""}`}>
                      <td className="py-1.5">{isLow(p) || p.stock <= 0 ? <AlertTriangle className="mr-1 inline size-3.5 text-destructive" /> : null}{p.name}<span className="block text-xs text-muted-foreground">{[p.sku, p.barcode].filter(Boolean).join(" · ")}</span></td>
                      <td className="text-xs">{p.category}</td>
                      <td className={`text-right ${p.stock <= 0 ? "text-destructive" : ""}`}>{p.stock} <span className="text-xs text-muted-foreground">{p.unit}</span></td>
                      <td className="text-right">{p.purchasePrice ?? "—"}</td>
                      <td className="text-right">{rs(Math.max(0, p.stock) * (p.purchasePrice ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data && !list.length ? <p className="py-4 text-center text-xs text-muted-foreground">No products found.</p> : null}
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-card p-3">
            {!cur || !edit ? <p className="py-10 text-center text-sm text-muted-foreground">Select a product — details, stock adjustment and stock ledger here.</p> : (
              <>
                <div><p className="font-bold text-foreground">{cur.name}</p><p className="text-xs text-muted-foreground">Stock {cur.stock} {cur.unit} · Sale price {rs(cur.salePrice)}</p></div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  <F k="sku" label="SKU" /><F k="barcode" label="Barcode" /><F k="category" label="Category" /><F k="brand" label="Brand" />
                  <F k="salePrice" label="Sale price (POS rate)" dec /><F k="purchasePrice" label="Purchase price" dec /><F k="wholesalePrice" label="Wholesale price" dec /><F k="wholesaleMinQty" label="Min wholesale qty" dec /><F k="minSalePrice" label="Min sale price" dec />
                  <F k="minStock" label="Min stock (alert)" dec /><F k="taxPercent" label="Tax %" dec />
                </div>
                <Button onClick={saveEdit}>Details save</Button>
                <div className="grid gap-2 rounded-lg border border-border p-2 sm:grid-cols-[auto_1fr_1fr_auto]">
                  <select className={posInput} value={adj.kind} onChange={(e) => setAdj({ ...adj, kind: e.target.value })} aria-label="Adjustment type"><option value="adjust_in">Stock in (+)</option><option value="adjust_out">Stock out (−)</option><option value="damage">Damage (−)</option><option value="opening">Opening (+)</option></select>
                  <input className={posInput} value={adj.qty} inputMode="decimal" onChange={(e) => setAdj({ ...adj, qty: e.target.value })} placeholder={`Qty (${cur.unit})`} aria-label="Adjust qty" />
                  <input className={posInput} value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} placeholder="Reason" />
                  <Button onClick={doAdjust}>Update</Button>
                </div>
                <p className="text-sm font-bold text-foreground">Stock ledger</p>
                <div className="max-h-72 overflow-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="text-left text-xs text-muted-foreground"><th>Date</th><th>Type</th><th>Note</th><th className="text-right">Qty</th><th className="text-right">Balance</th></tr></thead>
                    <tbody>
                      {(led?.rows ?? []).map((r, i) => (
                        <tr key={i} className="border-t border-border"><td className="py-1 text-xs">{new Date(r.date).toLocaleString("en-PK")}</td><td>{KIND[r.kind] ?? r.kind}</td><td className="text-xs">{r.note}</td><td className={`text-right ${r.qty < 0 ? "text-destructive" : ""}`}>{r.qty > 0 ? "+" : ""}{r.qty}</td><td className="text-right font-semibold">{r.balance}</td></tr>
                      ))}
                    </tbody>
                  </table>
                  {led && !led.rows.length ? <p className="py-3 text-center text-xs text-muted-foreground">No movement yet.</p> : null}
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
