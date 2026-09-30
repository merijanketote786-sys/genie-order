import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { listInventory, getItemHistory, type InvProduct } from "@/lib/inventory.functions";
import { rs } from "@/components/pos-subnav";
import { Search } from "lucide-react";

/** Items list with stock + search; clicking an item opens its date-wise history. */
export function ItemsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [term, setTerm] = useState("");
  const [item, setItem] = useState<InvProduct | null>(null);
  const q = useQuery({ queryKey: ["items-dialog"], queryFn: () => listInventory(), enabled: open, staleTime: 30_000 });
  const list = useMemo(() => {
    const t = term.trim().toLowerCase();
    const all = q.data?.products ?? [];
    return t ? all.filter((p) => `${p.name} ${p.sku} ${p.barcode} ${p.category}`.toLowerCase().includes(t)) : all;
  }, [q.data, term]);
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[90vh] max-w-lg flex-col">
          <DialogHeader><DialogTitle>Items</DialogTitle></DialogHeader>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input autoFocus value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search item" aria-label="Search item"
              className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-ring" />
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto rounded-lg border border-border">
            {q.isLoading ? <li className="p-4 text-center text-sm text-muted-foreground">Loading items…</li> : null}
            {!q.isLoading && !list.length ? <li className="p-4 text-center text-sm text-muted-foreground">No item found.</li> : null}
            {list.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setItem(p)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted">
                  <span className="truncate font-medium text-foreground">{p.name}</span>
                  <span className={`shrink-0 font-semibold ${p.stock < 0 ? "text-destructive" : p.stock === 0 ? "text-muted-foreground" : "text-success"}`}>{p.stock} {p.unit}</span>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
      <ItemHistoryDialog item={item} onClose={() => setItem(null)} />
    </>
  );
}

function ItemHistoryDialog({ item, onClose }: { item: InvProduct | null; onClose: () => void }) {
  const q = useQuery({ queryKey: ["item-history", item?.id], queryFn: () => getItemHistory({ data: { productId: item!.id } }), enabled: !!item });
  const rows = q.data?.rows ?? [];
  const sum = (k: (r: (typeof rows)[number]) => boolean) => rows.filter((r) => k(r) && !r.label.includes("cancelled")).reduce((a, r) => a + r.qty, 0);
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92vh] max-w-4xl flex-col">
        <DialogHeader><DialogTitle>{item?.name} — history</DialogTitle></DialogHeader>
        {item ? (
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
            {[["In stock", item.stock], ["Sold", sum((r) => r.kind === "sale")], ["Purchased", sum((r) => r.kind === "purchase")],
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
    </Dialog>
  );
}
