import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Factory, Search } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StoreSwitcher, useActiveStore } from "@/components/store-switcher";
import { listInventory } from "@/lib/inventory.functions";
import { listRecipes, manufactureProduct } from "@/lib/manufacturing.functions";
import { rs } from "@/components/pos-subnav";

export function ManufactureDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const activeStore = useActiveStore();
  const { data: inv } = useQuery({ queryKey: ["inventory"], queryFn: () => listInventory(), enabled: open });
  const { data: rec } = useQuery({ queryKey: ["recipes"], queryFn: () => listRecipes(), enabled: open });
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const [pid, setPid] = useState<string | null>(null);
  const [qty, setQty] = useState("");
  const [busy, setBusy] = useState(false);

  const items = useMemo(() => {
    const ids = new Set((rec?.recipes ?? []).map((r) => r.productId));
    return ((inv as any)?.products ?? (inv as any) ?? []).filter?.((p: any) => ids.has(p.id)) ?? [];
  }, [inv, rec]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items.filter((p: any) => !s || p.name.toLowerCase().includes(s) || (p.sku ?? "").toLowerCase().includes(s)).slice(0, 50);
  }, [items, q]);
  const sel = items.find((p: any) => p.id === pid);
  const recipe = rec?.recipes.find((r) => r.productId === pid);
  const storeStock = (id: string) => {
    const s: any = activeStore.stock?.data;
    return s?.byId?.[id] ?? null;
  };

  const run = async () => {
    if (activeStore.isAllStores) return toast.error("Select a specific store before manufacturing");
    if (!pid) return toast.error("Select a product");
    const n = Number(qty);
    if (!(n > 0)) return toast.error("Enter quantity to manufacture");
    setBusy(true);
    try {
      const r = await manufactureProduct({ data: { productId: pid, qty: n, note: "" } });
      toast.success(`Manufactured ${r.qty} ${sel?.name ?? ""} — unit cost ${rs(r.unitCost)}`);
      ["store-stock", "inventory", "stock-ledger", "products", "pos-products", "products-lite", "pos-dashboard"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      setQty(""); setPid(null); setQ(""); onOpenChange(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Manufacturing failed"); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Factory className="size-5" /> Manufacture product</DialogTitle>
          <DialogDescription>Only products with a manufacturing setup are listed. Stock is added to the selected store.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-2 text-sm"><span className="text-muted-foreground">Store</span><StoreSwitcher /></div>
        {!sel ? (
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setHi(0); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, shown.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
                  else if (e.key === "Enter" && shown[hi]) { e.preventDefault(); setPid(shown[hi].id); }
                }}
                placeholder="Search product · ↑↓ select · Enter pick" className="h-10 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm" />
            </div>
            <div role="listbox" className="max-h-72 overflow-y-auto rounded-md border border-border">
              {shown.length === 0 ? <p className="p-3 text-sm text-muted-foreground">{items.length ? "No match" : "No product has a manufacturing setup yet. Create one in POS Settings → Item Manufacturing."}</p> :
                shown.map((p: any, i: number) => (
                  <button key={p.id} role="option" aria-selected={i === hi} ref={i === hi ? (el) => el?.scrollIntoView({ block: "nearest" }) : undefined}
                    onClick={() => setPid(p.id)} onMouseEnter={() => setHi(i)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${i === hi ? "bg-accent" : ""}`}>
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground">Stock {storeStock(p.id) ?? p.stock} {p.unit}</span>
                  </button>
                ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <p className="font-semibold">{sel.name}</p>
                <p className="text-xs text-muted-foreground">Setup makes {recipe?.outputQty} {sel.unit} · {recipe?.materials.length ?? 0} raw materials · Stock {storeStock(sel.id) ?? sel.stock}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setPid(null)}>Change</Button>
            </div>
            <label className="block text-sm">
              <span className="text-muted-foreground">Quantity to manufacture</span>
              <input autoFocus inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ""))}
                onKeyDown={(e) => { if (e.key === "Enter") run(); }} placeholder={`Qty (${sel.unit}) · Enter to manufacture`}
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm" />
            </label>
            <Button className="w-full" onClick={run} disabled={busy || activeStore.isAllStores}><Factory className="size-4" /> {busy ? "Manufacturing…" : "Manufacture"}</Button>
            {activeStore.isAllStores ? <p className="text-xs text-destructive">Select a specific store before manufacturing.</p> : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
