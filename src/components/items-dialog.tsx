import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listInventory, getItemHistory, adjustStock, type InvProduct } from "@/lib/inventory.functions";
import { getAllStoresStock, getStoreStock, listStores } from "@/lib/stores.functions";
import { ALL_STORES_ID, useSelectedStoreId } from "@/lib/pos-store-client";
import { rs } from "@/components/pos-subnav";
import { Search, Store, SlidersHorizontal } from "lucide-react";

type StoreOpt = { id: string; name: string; kind: string };

/** Items list with stock + search; clicking an item opens its date-wise history. */
export function ItemsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const initialStore = useSelectedStoreId();
  const [term, setTerm] = useState("");
  const [item, setItem] = useState<InvProduct | null>(null);
  // Store selection lives only inside this popup; defaults to the store already chosen in POS.
  const [storeSel, setStoreSel] = useState<string>(initialStore || ALL_STORES_ID);
  const storesQ = useQuery({ queryKey: ["pos-stores"], queryFn: () => listStores(), enabled: open, staleTime: 60_000 });
  const q = useQuery({ queryKey: ["items-dialog"], queryFn: () => listInventory(), enabled: open, staleTime: 30_000 });
  const isAll = storeSel === ALL_STORES_ID;
  // Snap to All stores if the saved selection is no longer an active store.
  useEffect(() => {
    const stores = storesQ.data?.stores ?? [];
    if (!isAll && stores.length && !stores.some((s) => s.id === storeSel && s.isActive)) setStoreSel(ALL_STORES_ID);
  }, [storesQ.data, isAll, storeSel]);
  const stockQ = useQuery({
    queryKey: ["items-dialog-stock", isAll ? ALL_STORES_ID : storeSel],
    queryFn: () => (isAll ? getAllStoresStock() : getStoreStock({ data: { storeId: storeSel } })),
    enabled: open && (isAll || storeSel !== ""),
    staleTime: 30_000,
  });
  const stockOf = (p: InvProduct) => {
    const m = stockQ.data?.byId;
    if (m && Object.prototype.hasOwnProperty.call(m, p.id)) return m[p.id];
    return p.stock;
  };
  const list = useMemo(() => {
    const t = term.trim().toLowerCase();
    const all = q.data?.products ?? [];
    return t ? all.filter((p) => `${p.name} ${p.sku} ${p.barcode} ${p.category}`.toLowerCase().includes(t)) : all;
  }, [q.data, term]);
  const stores = (storesQ.data?.stores ?? []).filter((s) => s.isActive);
  const storeName = isAll ? "All stores" : stores.find((s) => s.id === storeSel)?.name ?? "";
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[92vh] w-[92vw] max-w-xl flex-col">
          <DialogHeader><DialogTitle>Items — all items</DialogTitle></DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[180px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search item" aria-label="Search item"
                className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-ring" />
            </div>
            <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2">
              <Store className="size-4 shrink-0 text-muted-foreground" />
              <label className="sr-only" htmlFor="items-store-select">Store</label>
              <select id="items-store-select" aria-label="Store" className="h-10 max-w-40 bg-transparent text-sm font-semibold text-foreground outline-none"
                value={storeSel} onChange={(e) => setStoreSel(e.target.value)}>
                <option value={ALL_STORES_ID}>All stores</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}{s.kind === "godown" ? " (Godown)" : ""}</option>)}
              </select>
            </div>
          </div>
          <ul className="max-h-[58vh] min-h-[180px] w-full flex-1 divide-y divide-border overflow-y-auto overscroll-contain rounded-lg border border-border">
            {q.isLoading ? <li className="p-4 text-center text-sm text-muted-foreground">Loading items…</li> : null}
            {!q.isLoading && !list.length ? <li className="p-4 text-center text-sm text-muted-foreground">No item found.</li> : null}
            {list.map((p) => {
              const stock = stockOf(p);
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => setItem(p)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted">
                    <span className="truncate font-medium text-foreground">{p.name}</span>
                    <span className={`shrink-0 font-semibold ${stock < 0 ? "text-destructive" : stock === 0 ? "text-muted-foreground" : "text-success"}`}>{stock} {p.unit}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-center text-[11px] text-muted-foreground">
            {storeName ? `Stock shown for ${storeName}` : "Stock"} — scroll to see every item
          </p>
        </DialogContent>
      </Dialog>
      <ItemHistoryDialog item={item} onClose={() => setItem(null)} storeSel={storeSel} setStoreSel={setStoreSel} stores={stores} stockOf={stockOf} />
    </>
  );
}

function StoreSelect({ value, onChange, stores, all = true, id }: { value: string; onChange: (v: string) => void; stores: StoreOpt[]; all?: boolean; id: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border bg-card px-2">
      <Store className="size-4 shrink-0 text-muted-foreground" />
      <label className="sr-only" htmlFor={id}>Store</label>
      <select id={id} aria-label="Store" className="h-10 max-w-44 bg-transparent text-sm font-semibold text-foreground outline-none" value={value} onChange={(e) => onChange(e.target.value)}>
        {all ? <option value={ALL_STORES_ID}>All stores</option> : <option value="">Select store</option>}
        {stores.map((s) => <option key={s.id} value={s.id}>{s.name}{s.kind === "godown" ? " (Godown)" : ""}</option>)}
      </select>
    </div>
  );
}

function AdjustStockDialog({ item, stores, defaultStore, onClose }: { item: InvProduct | null; stores: StoreOpt[]; defaultStore: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [store, setStore] = useState("");
  const [mode, setMode] = useState<"adjust_in" | "adjust_out">("adjust_in");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (item) { setStore(defaultStore === ALL_STORES_ID ? "" : defaultStore); setQty(""); setPrice(item.purchasePrice ? String(item.purchasePrice) : ""); setNote(""); setMode("adjust_in"); }
  }, [item, defaultStore]);
  const save = async () => {
    if (!item) return;
    if (!store) return toast.error("Select a store");
    const q = Number(qty);
    if (!(q > 0)) return toast.error("Enter a quantity");
    const p = price.trim() === "" ? null : Number(price);
    if (p != null && !(p >= 0)) return toast.error("Enter a valid price");
    const full = [p != null ? `@ Rs ${p}/${item.unit} (total Rs ${Math.round(p * q * 100) / 100})` : "", note.trim()].filter(Boolean).join(" — ").slice(0, 300);
    setBusy(true);
    try {
      await adjustStock({ data: { id: item.id, qty: q, kind: mode, note: full, storeId: store } });
      toast.success(mode === "adjust_in" ? "Stock added" : "Stock reduced");
      void qc.invalidateQueries({ queryKey: ["items-dialog"] });
      void qc.invalidateQueries({ queryKey: ["items-dialog-stock"] });
      void qc.invalidateQueries({ queryKey: ["item-history", item.id] });
      onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not adjust stock"); } finally { setBusy(false); }
  };
  const inp = "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-ring";
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Adjust stock — {item?.name}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <StoreSelect id="adj-store" value={store} onChange={setStore} stores={stores} all={false} />
          <div className="grid grid-cols-2 gap-2">
            {(["adjust_in", "adjust_out"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)}
                className={`h-10 rounded-lg border text-sm font-semibold ${mode === m ? (m === "adjust_in" ? "border-success bg-success text-success-foreground" : "border-destructive bg-destructive text-destructive-foreground") : "border-border bg-card text-foreground"}`}>
                {m === "adjust_in" ? "Add stock" : "Reduce stock"}
              </button>
            ))}
          </div>
          <label className="grid gap-1 text-xs text-muted-foreground">Quantity ({item?.unit})<input className={inp} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" /></label>
          <label className="grid gap-1 text-xs text-muted-foreground">Price per unit (Rs)<input className={inp} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0" /></label>
          <label className="grid gap-1 text-xs text-muted-foreground">Note (optional)<input className={inp} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason" /></label>
          {Number(qty) > 0 && Number(price) > 0 ? <p className="text-sm text-muted-foreground">Total value: <b className="text-foreground">{rs(Number(qty) * Number(price))}</b></p> : null}
          <button type="button" disabled={busy} onClick={save} className="h-11 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60">{busy ? "Saving…" : "Save"}</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ItemHistoryDialog({ item, onClose, storeSel, setStoreSel, stores, stockOf }: { item: InvProduct | null; onClose: () => void; storeSel: string; setStoreSel: (v: string) => void; stores: StoreOpt[]; stockOf: (p: InvProduct) => number }) {
  const [adjOpen, setAdjOpen] = useState(false);
  const q = useQuery({ queryKey: ["item-history", item?.id], queryFn: () => getItemHistory({ data: { productId: item!.id } }), enabled: !!item });
  const rows = q.data?.rows ?? [];
  const sum = (k: (r: (typeof rows)[number]) => boolean) => rows.filter((r) => k(r) && !r.label.includes("cancelled")).reduce((a, r) => a + r.qty, 0);
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92vh] max-w-4xl flex-col">
        <DialogHeader><DialogTitle>{item?.name} — history</DialogTitle></DialogHeader>
        <div className="flex flex-wrap items-center gap-2">
          <StoreSelect id="hist-store" value={storeSel} onChange={setStoreSel} stores={stores} />
          <button type="button" onClick={() => setAdjOpen(true)} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground">
            <SlidersHorizontal className="size-4" /> Adjust stock
          </button>
        </div>
        {item ? (
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
            {[["In stock", stockOf(item)], ["Sold", sum((r) => r.kind === "sale")], ["Purchased", sum((r) => r.kind === "purchase")],
              ["Manufactured", sum((r) => r.kind === "manufacture_in")], ["In estimates", sum((r) => r.kind === "quotation")]].map(([l, v]) => (
              <div key={l as string} className="rounded-lg border border-border bg-card p-2"><p className="text-[11px] text-muted-foreground">{l}</p><p className={`font-bold ${Number(v) < 0 ? "text-destructive" : ""}`}>{v} {item.unit}</p></div>
            ))}
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
              <tr><th className="p-2">Date</th><th className="p-2">Type</th><th className="p-2">Doc #</th><th className="p-2">Party / note</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Rate</th><th className="p-2 text-right">Amount</th></tr>
            </thead>
            <tbody>
              {q.isLoading ? <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Loading history…</td></tr> : null}
              {!q.isLoading && !rows.length ? <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">No history yet.</td></tr> : null}
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="whitespace-nowrap p-2 text-xs">{new Date(r.date).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short" })}</td>
                  <td className="p-2">{r.label}{r.store ? <span className="block text-[11px] text-muted-foreground">{r.store}</span> : null}</td>
                  <td className="p-2">{r.doc || "—"}</td>
                  <td className="max-w-[200px] truncate p-2">{r.party || "—"}</td>
                  <td className="p-2 text-right font-semibold">{r.qty}</td>
                  <td className="p-2 text-right">{r.rate == null ? "—" : rs(r.rate)}</td>
                  <td className="p-2 text-right">{r.rate == null ? "—" : rs(r.rate * r.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
      <AdjustStockDialog item={adjOpen ? item : null} stores={stores} defaultStore={storeSel} onClose={() => setAdjOpen(false)} />
    </Dialog>
  );
}
