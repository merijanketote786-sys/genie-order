import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { UnitSelect } from "@/components/unit-select";
import { posInput } from "@/components/pos-subnav";
import { useActiveStore } from "@/components/store-switcher";
import { bulkUpdateProducts, listInventory, type InvProduct } from "@/lib/inventory.functions";

type Form = Record<string, string>;
const FIELDS: { k: string; label: string; num?: boolean }[] = [
  { k: "name", label: "Product name" },
  { k: "sku", label: "SKU" },
  { k: "barcode", label: "Barcode" },
  { k: "category", label: "Category" },
  { k: "brand", label: "Brand" },
  { k: "sale_price", label: "Sale price", num: true },
  { k: "purchase_price", label: "Purchase price", num: true },
  { k: "wholesale_price", label: "Wholesale price", num: true },
  { k: "wholesale_min_qty", label: "Min wholesale qty", num: true },
  { k: "min_sale_price", label: "Min sale price", num: true },
  { k: "min_stock", label: "Min stock", num: true },
  { k: "tax_percent", label: "Tax %", num: true },
  { k: "stock", label: "Stock qty", num: true },
];
const s = (v: number | null | undefined) => (v == null ? "" : String(v));
function toForm(p: InvProduct, stock: number): Form {
  return {
    name: p.name, unit: p.unit || "Piece", sku: p.sku, barcode: p.barcode, category: p.category, brand: p.brand,
    sale_price: s(p.salePrice), purchase_price: s(p.purchasePrice), wholesale_price: s(p.wholesalePrice),
    wholesale_min_qty: s(p.wholesaleMinQty), min_sale_price: s(p.minSalePrice), min_stock: s(p.minStock),
    tax_percent: s(p.taxPercent), stock: s(stock),
  };
}

/** Edits every field of one POS item from the billing search list (same save path as Bulk update). */
export function ProductEditDialog({ name, onClose }: { name: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const store = useActiveStore();
  const { data, isLoading } = useQuery({ queryKey: ["inventory"], queryFn: () => listInventory(), enabled: !!name });
  const p = name ? [...(data?.products ?? []), ...(data?.inactive ?? [])].find((x) => x.name.toLowerCase() === name.toLowerCase()) : undefined;
  const stockNow = p ? (store.stock ? store.stock.byId[p.id] ?? 0 : p.stock) : 0;
  const [f, setF] = useState<Form | null>(null);
  const [orig, setOrig] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!p) { setF(null); setOrig(null); return; }
    const fm = toForm(p, stockNow);
    setF(fm); setOrig(fm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?.id, name]);

  const save = async () => {
    if (!p || !f || !orig) return;
    if (!f.name.trim()) return toast.error("Product name is required");
    for (const c of FIELDS) if (c.num && f[c.k] !== "" && (!isFinite(Number(f[c.k])) || (c.k !== "stock" && Number(f[c.k]) < 0))) return toast.error(`${c.label} is invalid`);
    const row: Record<string, string> = { id: p.id };
    for (const k of Object.keys(f)) if (f[k] !== orig[k]) row[k] = f[k].trim();
    if (Object.keys(row).length === 1) { onClose(); return; }
    if (row.stock !== undefined && store.isAllStores) return toast.error("Select a specific store before changing stock");
    setBusy(true);
    try {
      await bulkUpdateProducts({ data: { rows: [row] } });
      toast.success("Item saved");
      ["inventory", "pos-products", "products", "products-lite", "store-stock", "items-dialog"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save item");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!name} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit item</DialogTitle>
          <DialogDescription>{name}</DialogDescription>
        </DialogHeader>
        {!f ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{isLoading ? "Loading…" : "Item not found"}</p>
        ) : (
          <form className="grid grid-cols-2 gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); void save(); }}>
            {FIELDS.map((c) => (
              <label key={c.k} className={`block text-xs text-muted-foreground ${c.k === "name" ? "col-span-2 sm:col-span-3" : ""}`}>
                {c.label}{c.k === "stock" && store.isAllStores ? " (select a store to change)" : ""}
                <input
                  autoFocus={c.k === "name"}
                  className={`${posInput} mt-1 w-full ${c.num ? "text-right tabular-nums" : ""}`}
                  value={f[c.k]}
                  inputMode={c.num ? "decimal" : undefined}
                  disabled={c.k === "stock" && store.isAllStores}
                  onChange={(e) => setF({ ...f, [c.k]: e.target.value })}
                  aria-label={c.label}
                />
              </label>
            ))}
            <label className="block text-xs text-muted-foreground">Unit
              <div className="mt-1"><UnitSelect className={`${posInput} w-full`} value={f.unit} onChange={(v) => setF({ ...f, unit: v })} label="Unit" /></div>
            </label>
            <div className="col-span-2 flex justify-end gap-2 pt-2 sm:col-span-3">
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save item"}</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
