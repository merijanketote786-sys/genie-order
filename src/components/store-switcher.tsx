import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRightLeft, Plus, Settings2, Store, Trash2, Warehouse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { getStoreStock, listStores, saveStore, setCommonProducts, transferStock, type PosStore } from "@/lib/stores.functions";
import { listInventory } from "@/lib/inventory.functions";
import { setSelectedStoreId, useSelectedStoreId } from "@/lib/pos-store-client";

const inp = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground";

export function useStores() {
  return useQuery({ queryKey: ["pos-stores"], queryFn: () => listStores(), staleTime: 60_000 });
}

/** Selected store (falls back to default) + its stock, for the sale/estimate/inventory screens. */
export function useActiveStore() {
  const { data } = useStores();
  const sel = useSelectedStoreId();
  const stores = data?.stores ?? [];
  const store = stores.find((s) => s.id === sel && s.isActive) ?? stores.find((s) => s.isDefault) ?? null;
  const stock = useQuery({ queryKey: ["store-stock", store?.id], queryFn: () => getStoreStock({ data: { storeId: store!.id } }), enabled: !!store });
  return { store, stores, commonProducts: data?.commonProducts ?? true, stock: stock.data ?? null };
}

export function StoreSwitcher() {
  const { store, stores } = useActiveStore();
  const sel = useSelectedStoreId();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  // keep saved selection valid
  useEffect(() => { if (store && sel !== store.id) setSelectedStoreId(store.id); }, [store, sel]);
  const change = (id: string) => {
    setSelectedStoreId(id);
    qc.invalidateQueries({ queryKey: ["store-stock"] });
  };
  return (
    <div className="flex items-center gap-1.5">
      <label className="sr-only" htmlFor="pos-store-select">Store</label>
      <div className="flex items-center gap-1 rounded-md border border-border bg-card px-2">
        {store?.kind === "godown" ? <Warehouse className="size-4 text-muted-foreground" /> : <Store className="size-4 text-muted-foreground" />}
        <select id="pos-store-select" aria-label="Store" className="h-9 max-w-48 bg-transparent text-sm font-semibold text-foreground outline-none" value={store?.id ?? ""} onChange={(e) => change(e.target.value)}>
          {stores.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.name}{s.kind === "godown" ? " (Godown)" : ""}</option>)}
        </select>
      </div>
      <Button size="icon-sm" variant="outline" aria-label="Stores & transfer" title="Stores, godowns & stock transfer" onClick={() => setOpen(true)}><Settings2 /></Button>
      <StoresDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function StoresDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (b: boolean) => void }) {
  const [tab, setTab] = useState<"stores" | "transfer">("stores");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Stores & godowns</DialogTitle></DialogHeader>
        <div className="flex gap-2">
          <Button size="sm" variant={tab === "stores" ? "default" : "outline"} onClick={() => setTab("stores")}><Store /> Stores</Button>
          <Button size="sm" variant={tab === "transfer" ? "default" : "outline"} onClick={() => setTab("transfer")}><ArrowRightLeft /> Stock transfer</Button>
        </div>
        {tab === "stores" ? <StoresTab /> : <TransferTab onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function StoresTab() {
  const qc = useQueryClient();
  const { data } = useStores();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"store" | "godown">("store");
  const [busy, setBusy] = useState(false);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["pos-stores"] }); qc.invalidateQueries({ queryKey: ["store-stock"] }); };
  const add = async () => {
    if (!name.trim()) return toast.error("Store name likhein");
    setBusy(true);
    try { await saveStore({ data: { id: null, name, kind, active: true } }); setName(""); toast.success("Saved"); refresh(); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  const update = async (s: PosStore, patch: Partial<PosStore>) => {
    try { await saveStore({ data: { id: s.id, name: patch.name ?? s.name, kind: patch.kind ?? s.kind, active: patch.isActive ?? s.isActive } }); refresh(); }
    catch (e) { toast.error((e as Error).message); }
  };
  const toggleCommon = async (on: boolean) => {
    try { await setCommonProducts({ data: { on } }); toast.success(on ? "Products common in all stores" : "Each store has its own products"); refresh(); qc.invalidateQueries({ queryKey: ["pos-settings"] }); }
    catch (e) { toast.error((e as Error).message); }
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Common products between stores</p>
          <p className="text-xs text-muted-foreground">ON: every store shows the same product list. OFF: each store shows only its own products (new items belong to the selected store). Stock is always separate per store.</p>
        </div>
        <Switch checked={data?.commonProducts ?? true} onCheckedChange={toggleCommon} aria-label="Common products" />
      </div>
      <div className="flex flex-wrap gap-2">
        <input className={`${inp} flex-1`} placeholder="New store / godown name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} aria-label="New store name" />
        <select className={`${inp} w-32`} value={kind} onChange={(e) => setKind(e.target.value as "store")} aria-label="Type"><option value="store">Store</option><option value="godown">Godown</option></select>
        <Button onClick={add} disabled={busy}><Plus /> Add</Button>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {(data?.stores ?? []).map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-2 p-2">
            <input className={`${inp} flex-1`} defaultValue={s.name} aria-label="Store name" onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && update(s, { name: e.target.value })} />
            <select className={`${inp} w-28`} value={s.kind} onChange={(e) => update(s, { kind: e.target.value as "store" })} aria-label="Type"><option value="store">Store</option><option value="godown">Godown</option></select>
            {s.isDefault ? <span className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">Main</span> : (
              <label className="flex items-center gap-1 text-xs text-muted-foreground"><Switch checked={s.isActive} onCheckedChange={(b) => update(s, { isActive: b })} aria-label="Active" /> Active</label>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function TransferTab({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const { data } = useStores();
  const stores = (data?.stores ?? []).filter((s) => s.isActive);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<Array<{ id: string; name: string; unit: string; qty: string }>>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!from && stores.length) setFrom(stores[0].id);
    if (!to && stores.length > 1) setTo(stores[1].id);
  }, [stores, from, to]);
  const { data: inv } = useQuery({ queryKey: ["inventory"], queryFn: () => listInventory() });
  const { data: st } = useQuery({ queryKey: ["store-stock", from], queryFn: () => getStoreStock({ data: { storeId: from } }), enabled: !!from });
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return (inv?.products ?? []).filter((p) => [p.name, p.sku, p.barcode].some((v) => v.toLowerCase().includes(t))).slice(0, 8);
  }, [q, inv]);
  const have = (id: string) => st?.byId[id] ?? 0;
  const submit = async () => {
    const list = items.map((i) => ({ productId: i.id, qty: Number(i.qty) })).filter((i) => i.qty > 0);
    if (!from || !to || from === to) return toast.error("From aur To store alag select karein");
    if (!list.length) return toast.error("Items add karein");
    setBusy(true);
    try {
      const r = await transferStock({ data: { from, to, note, items: list } });
      toast.success(`${r.count} items transferred`);
      ["store-stock", "inventory", "stock-ledger"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      setItems([]); onDone();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  if (stores.length < 2) return <p className="py-6 text-center text-sm text-muted-foreground">Transfer ke liye pehle kam az kam 2 stores/godowns add karein.</p>;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-muted-foreground">From<select className={inp} value={from} onChange={(e) => setFrom(e.target.value)}>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="text-xs text-muted-foreground">To<select className={inp} value={to} onChange={(e) => setTo(e.target.value)}>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      </div>
      <div className="relative">
        <input className={inp} placeholder="Search product to transfer" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search product" />
        {matches.length ? (
          <ul className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow">
            {matches.map((p) => (
              <li key={p.id}><button type="button" className="flex w-full justify-between px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => { setItems((x) => x.some((i) => i.id === p.id) ? x : [...x, { id: p.id, name: p.name, unit: p.unit, qty: "" }]); setQ(""); }}>
                <span className="text-foreground">{p.name}</span><span className="text-xs text-muted-foreground">in stock {have(p.id)} {p.unit}</span>
              </button></li>
            ))}
          </ul>
        ) : null}
      </div>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-muted-foreground"><th>Item</th><th className="text-right">Available</th><th className="w-28 text-right">Qty</th><th className="w-8" /></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="border-t border-border">
              <td className="py-1 text-foreground">{i.name}</td>
              <td className="text-right text-muted-foreground">{have(i.id)} {i.unit}</td>
              <td><input className={`${inp} text-right`} inputMode="decimal" value={i.qty} aria-label={`Qty ${i.name}`} onChange={(e) => setItems((x) => x.map((y) => y.id === i.id ? { ...y, qty: e.target.value } : y))} /></td>
              <td><Button size="icon-sm" variant="ghost" aria-label="Remove" onClick={() => setItems((x) => x.filter((y) => y.id !== i.id))}><Trash2 /></Button></td>
            </tr>
          ))}
          {!items.length ? <tr><td colSpan={4} className="py-4 text-center text-xs text-muted-foreground">No items yet.</td></tr> : null}
        </tbody>
      </table>
      <input className={inp} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
      <Button className="w-full" onClick={submit} disabled={busy}><ArrowRightLeft /> Transfer stock</Button>
    </div>
  );
}
