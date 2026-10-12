import { useState } from "react";
import { ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
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

export function ItemsPasteBox({ onApply }: { onApply: (items: PastedItem[]) => Promise<void> | void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const apply = async () => {
    const items = parseItemsText(text);
    if (!items.length) return toast.error("No items found — use: Product name, Qty, Rate");
    setBusy(true);
    try { await onApply(items); setText(""); } finally { setBusy(false); }
  };
  if (!open) {
    return (
      <div className="px-2 py-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}><ListPlus /> Paste items</Button>
      </div>
    );
  }
  return (
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
        <p className="text-[11px] text-muted-foreground">Rate optional · new items auto-save to inventory · Ctrl+Enter = add</p>
        <Button type="button" size="sm" onClick={() => void apply()} disabled={!text.trim() || busy}><ListPlus /> Add to bill</Button>
      </div>
    </div>
  );
}
