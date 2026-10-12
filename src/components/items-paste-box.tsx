import { useState } from "react";
import { ListPlus, PackagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

export type PastedItem = { name: string; qty: number; unit?: string; price?: number };

export const ITEMS_FORMAT = "Product name, Qty, Rate\n";

/** Rule-based (no AI): one item per line → "Name, Qty [unit], Rate". Qty and rate optional. */
export function parseItemsText(text: string): PastedItem[] {
  const out: PastedItem[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^product name\s*,/i.test(line)) continue;
    const parts = line.split(/[,|\t]/).map((s) => s.trim()).filter(Boolean);
    const name = parts[0];
    if (!name) continue;
    let qty = 1;
    let unit: string | undefined;
    let price: number | undefined;
    if (parts[1]) {
      const m = parts[1].match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z.]*)$/);
      if (m) { qty = Number(m[1]) || 1; unit = m[2] || undefined; }
    }
    if (parts[2]) {
      const n = Number(parts[2].replace(/[^\d.]/g, ""));
      if (Number.isFinite(n) && parts[2].replace(/[^\d.]/g, "") !== "") price = n;
    }
    out.push({ name, qty, unit, price });
  }
  return out;
}

type Props = {
  /** Items already in inventory — added straight to the bill. */
  onApply: (items: PastedItem[]) => Promise<void> | void;
  /** True when the name already exists in inventory. */
  isKnown: (name: string) => boolean;
  /** Create the item in inventory, then add it to the bill. */
  onCreate: (item: PastedItem) => Promise<void> | void;
  /** Similar inventory names for a skipped (cancelled) new item. */
  findSimilar: (name: string) => string[];
  /** Add an existing inventory product to the bill in place of the new item. */
  onPickSimilar: (name: string, item: PastedItem) => void;
};

export function ItemsPasteBox({ onApply, isKnown, onCreate, findSimilar, onPickSimilar }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [unknowns, setUnknowns] = useState<PastedItem[]>([]);
  const [skipped, setSkipped] = useState<Record<string, string[]>>({});

  const apply = async () => {
    const items = parseItemsText(text);
    if (!items.length) return toast.error("No items found — use: Product name, Qty, Rate");
    setBusy(true);
    try {
      const known = items.filter((it) => isKnown(it.name));
      const fresh = items.filter((it) => !isKnown(it.name));
      if (known.length) await onApply(known);
      if (fresh.length) {
        setUnknowns(fresh);
        setSkipped({});
        toast.message(`${fresh.length} item(s) not in inventory — choose what to do`);
      } else {
        setText("");
      }
    } finally {
      setBusy(false);
    }
  };

  const closeDialog = (clearText: boolean) => {
    setUnknowns([]);
    setSkipped({});
    if (clearText) setText("");
  };

  const addToInventory = async (it: PastedItem) => {
    setBusy(true);
    try {
      await onCreate(it);
      setUnknowns((u) => u.filter((x) => x !== it));
      toast.success(`${it.name} saved to inventory and added to bill`);
    } catch (e) {
      toast.error(`${it.name}: ${e instanceof Error ? e.message : "save failed"}`);
    } finally {
      setBusy(false);
    }
  };

  const cancelItem = (it: PastedItem) => {
    const similar = findSimilar(it.name);
    setSkipped((s) => ({ ...s, [it.name]: similar }));
  };

  const pickSimilar = (name: string, it: PastedItem) => {
    onPickSimilar(name, it);
    setUnknowns((u) => u.filter((x) => x !== it));
    toast.success(`${name} added to bill`);
  };

  return (
    <>
      {!open ? (
        <div className="px-2 py-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}><ListPlus /> Paste items</Button>
        </div>
      ) : (
        <div className="m-2 rounded-lg border border-border bg-muted/40 p-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-foreground">Paste items (one per line)</p>
            <div className="flex gap-3">
              <button type="button" className="text-[11px] text-primary underline" onClick={() => setText(ITEMS_FORMAT)}>Insert format</button>
              <button type="button" className="text-[11px] text-muted-foreground underline" onClick={() => setOpen(false)}>Close</button>
            </div>
          </div>
          <textarea
            aria-label="Paste items"
            className="min-h-[6rem] w-full rounded-md border border-input bg-background p-2 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); void apply(); } }}
            placeholder={"Sorbitol, 2 kg, 450\nCocoa butter, 500 gram, 1200\nRose water, 3"}
          />
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="text-[11px] text-muted-foreground">Rate optional · new items ask before saving · Ctrl+Enter = add</p>
            <Button type="button" size="sm" onClick={() => void apply()} disabled={!text.trim() || busy}><ListPlus /> Add to bill</Button>
          </div>
        </div>
      )}

      <Dialog open={unknowns.length > 0} onOpenChange={(o) => { if (!o) closeDialog(true); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Not in inventory</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {unknowns.map((it) => (
              <div key={it.name} className="rounded-lg border border-border p-3">
                <p className="text-sm font-semibold text-foreground">{it.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Qty {it.qty}{it.unit ? ` ${it.unit}` : ""}{it.price != null ? ` · Rs ${it.price}` : " · no rate"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">This item is not in inventory. Do you want to add it?</p>
                <div className="mt-2 flex gap-2">
                  <Button type="button" size="sm" disabled={busy} onClick={() => void addToInventory(it)}>
                    <PackagePlus /> Add to inventory
                  </Button>
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => cancelItem(it)}>
                    <X /> Cancel
                  </Button>
                </div>
                {skipped[it.name] ? (
                  <div className="mt-2 border-t border-border pt-2">
                    {skipped[it.name].length ? (
                      <>
                        <p className="mb-1 text-xs font-semibold text-muted-foreground">Similar items in inventory:</p>
                        <div className="space-y-1">
                          {skipped[it.name].map((name) => (
                            <div key={name} className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1.5">
                              <span className="min-w-0 flex-1 truncate text-xs text-foreground">{name}</span>
                              <Button type="button" size="sm" variant="secondary" className="h-7 text-[11px]" onClick={() => pickSimilar(name, it)}>
                                Add to invoice
                              </Button>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">No similar items found — this item was skipped.</p>
                    )}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" onClick={() => closeDialog(true)}>Done</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
