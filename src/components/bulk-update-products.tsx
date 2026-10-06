import { Button } from "@/components/ui/button";
import { posInput, rs } from "@/components/pos-subnav";
import { bulkUpdateProducts, deletePosProducts, type InvProduct } from "@/lib/inventory.functions";
import { UnitSelect } from "@/components/unit-select";
import { Search, Trash2, Upload, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useUnsavedGuard } from "@/hooks/use-unsaved-guard";
import { BulkCsvImport, parseCsv, detectTable } from "@/components/bulk-csv-import";

const TINTS = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5", "--primary", "--success", "--warning"];
const tint = (i: number, pct: number) => ({ backgroundColor: `color-mix(in oklab, var(${TINTS[i % TINTS.length]}) ${pct}%, var(--card))` });

type Col = { k: string; label: string; w: string; num?: boolean };
const COLS: Col[] = [
  { k: "name", label: "Product name", w: "w-64" },
  { k: "sku", label: "Item code", w: "w-28" },
  { k: "barcode", label: "Barcode", w: "w-32" },
  { k: "category", label: "Category", w: "w-32" },
  { k: "brand", label: "Brand", w: "w-28" },
  { k: "unit", label: "Unit", w: "w-36" },
  { k: "purchase_price", label: "Purchase price", w: "w-32", num: true },
  { k: "sale_price", label: "Sale price", w: "w-32", num: true },
  { k: "wholesale_price", label: "Wholesale price", w: "w-32", num: true },
  { k: "wholesale_min_qty", label: "Min wholesale qty", w: "w-32", num: true },
  { k: "min_sale_price", label: "Min sale price", w: "w-32", num: true },
  { k: "stock", label: "Stock qty", w: "w-24", num: true },
  { k: "stock_value", label: "Stock value", w: "w-32", num: true },
  { k: "min_stock", label: "Min stock", w: "w-24", num: true },
  { k: "tax_percent", label: "Tax %", w: "w-20", num: true },
];
type Row = Record<string, string>;
const base = (p: InvProduct): Row => ({
  name: p.name, sku: p.sku, barcode: p.barcode, category: p.category, brand: p.brand, unit: p.unit,
  purchase_price: p.purchasePrice?.toString() ?? "", sale_price: String(p.salePrice ?? 0), wholesale_price: p.wholesalePrice?.toString() ?? "",
  wholesale_min_qty: p.wholesaleMinQty?.toString() ?? "",
  min_sale_price: p.minSalePrice?.toString() ?? "", stock: String(p.stock), min_stock: p.minStock?.toString() ?? "", tax_percent: p.taxPercent?.toString() ?? "",
});
const val = (r: Row) => { const s = Number(r.stock) || 0, c = Number(r.purchase_price) || 0; return r.purchase_price === "" ? "" : String(Math.round(Math.max(0, s) * c * 100) / 100); };

export function BulkUpdateProducts({ products, onClose, onSaved }: { products: InvProduct[]; onClose: () => void; onSaved: () => void }) {
  const orig = useMemo(() => Object.fromEntries(products.map((p) => [p.id, base(p)])), [products]);
  const [edits, setEdits] = useState<Record<string, Row>>({});
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [applyCol, setApplyCol] = useState("sale_price");
  const [applyMode, setApplyMode] = useState<"set" | "pct" | "add">("set");
  const [applyVal, setApplyVal] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeCol, setActiveCol] = useState<string | null>(null);
  const [csv, setCsv] = useState<{ headers: string[]; rows: string[][] } | null>(null);

  const list = useMemo(() => { const t = q.trim().toLowerCase(); return products.filter((p) => !t || [p.name, p.sku, p.barcode, p.category, p.brand].some((v) => v.toLowerCase().includes(t))); }, [products, q]);
  const rowOf = (id: string): Row => { const r = { ...orig[id], ...edits[id] }; return { ...r, stock_value: edits[id]?.stock_value ?? val(r) }; };
  const set = (id: string, k: string, v: string) => setEdits((e) => {
    const cur = { ...orig[id], ...e[id], [k]: v };
    if (k === "stock_value") { const s = Number(cur.stock) || 0; if (s > 0 && v !== "") cur.purchase_price = String(Math.round((Number(v) / s) * 100) / 100); }
    else delete cur.stock_value;
    return { ...e, [id]: cur };
  });
  const dirtyIds = Object.keys(edits).filter((id) => COLS.some((c) => c.k !== "stock_value" && (edits[id][c.k] ?? orig[id][c.k]) !== orig[id][c.k]));

  const applyAll = () => {
    const ids = picked.size ? [...picked] : list.map((p) => p.id);
    const col = COLS.find((c) => c.k === applyCol)!;
    if (col.num && applyMode !== "set" && applyVal.trim() === "") return toast.error("Enter a value");
    ids.forEach((id) => {
      const r = rowOf(id); let v = applyVal;
      if (col.num && applyMode !== "set") { const cur = Number(r[applyCol]) || 0, x = Number(applyVal) || 0; v = String(Math.round((applyMode === "pct" ? cur * (1 + x / 100) : cur + x) * 100) / 100); }
      set(id, applyCol, v);
    });
    toast.success(`Applied to ${ids.length} products — press Save`);
  };

  const save = async () => {
    if (!dirtyIds.length) return toast.info("No changes");
    for (const id of dirtyIds) {
      const r = rowOf(id);
      if (!r.name.trim()) return toast.error("Product name cannot be empty");
      for (const c of COLS) if (c.num && c.k !== "stock_value" && r[c.k] !== "" && (!isFinite(Number(r[c.k])) || (c.k !== "stock" && Number(r[c.k]) < 0))) return toast.error(`${r.name}: ${c.label} is invalid`);
    }
    const rows = dirtyIds.map((id) => { const r = rowOf(id); const o: Record<string, string> = { id }; COLS.forEach((c) => { if (c.k !== "stock_value" && r[c.k] !== orig[id][c.k]) o[c.k] = r[c.k].trim(); }); return o; });
    setSaving(true);
    try {
      for (let i = 0; i < rows.length; i += 500) await bulkUpdateProducts({ data: { rows: rows.slice(i, i + 500) } });
      toast.success(`${rows.length} products updated`); setEdits({}); onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); } finally { setSaving(false); }
  };

  const del = async (ids: string[]) => {
    if (!ids.length) return toast.info("Select products first");
    if (!confirm(`Delete ${ids.length} product(s)? They will still appear on past bills.`)) return;
    try { const r = await deletePosProducts({ data: { ids } }); toast.success(`${r.deleted} product(s) deleted`); setPicked(new Set()); setEdits((e) => { const n = { ...e }; ids.forEach((i) => delete n[i]); return n; }); onSaved(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
  };

  const guardNode = useUnsavedGuard(dirtyIds.length > 0, save);
  const allPicked = list.length > 0 && list.every((p) => picked.has(p.id));

  // Arrow keys move the cursor between editable fields (up/down/left/right)
  const gridKeys = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(k)) return;
    const t = e.target as HTMLElement;
    if (t.tagName !== "INPUT" && t.tagName !== "SELECT") return;
    const td = t.closest("td"), tr = t.closest("tr"), body = tr?.parentElement;
    if (!td || !tr || !body) return;
    // In text inputs, left/right should still edit text unless the cursor is at the edge
    if (t.tagName === "INPUT" && (t as HTMLInputElement).type !== "checkbox") {
      const inp = t as HTMLInputElement;
      const atStart = inp.selectionStart === 0, atEnd = inp.selectionEnd === inp.value.length;
      if (k === "ArrowLeft" && !atStart) return;
      if (k === "ArrowRight" && !atEnd) return;
    }
    const rows = [...body.querySelectorAll(":scope > tr")];
    const ri = rows.indexOf(tr), ci = [...tr.children].indexOf(td);
    const nri = k === "ArrowUp" ? ri - 1 : k === "ArrowDown" ? ri + 1 : ri;
    const nci = k === "ArrowLeft" ? ci - 1 : k === "ArrowRight" ? ci + 1 : ci;
    const target = rows[nri]?.children[nci]?.querySelector<HTMLElement>("input, select, button");
    if (target) { e.preventDefault(); target.focus(); if (target.tagName === "INPUT") (target as HTMLInputElement).select(); }
  };
  return (
    <section className="space-y-2 rounded-xl border border-border bg-card p-3">
      {guardNode}
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto font-bold text-foreground">Bulk update items <span className="text-xs font-normal text-muted-foreground">{dirtyIds.length} changed</span></p>
        <Button variant="destructive" onClick={() => del([...picked])} disabled={!picked.size || saving}><Trash2 /> Delete ({picked.size})</Button>
        <Button variant="outline" onClick={() => setEdits({})} disabled={!dirtyIds.length || saving}>Reset</Button>
        <Button onClick={save} disabled={saving || !dirtyIds.length}>{saving ? "Saving..." : `Save (${dirtyIds.length})`}</Button>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X /></Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2 text-sm">
        <span className="text-xs text-muted-foreground">{picked.size ? `${picked.size} selected` : "All visible"} products:</span>
        <select className={`${posInput} w-40`} value={applyCol} onChange={(e) => setApplyCol(e.target.value)} aria-label="Field">{COLS.filter((c) => !["name", "sku", "barcode", "stock_value"].includes(c.k)).map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}</select>
        {COLS.find((c) => c.k === applyCol)?.num ? <select className={`${posInput} w-32`} value={applyMode} onChange={(e) => setApplyMode(e.target.value as "set")} aria-label="Method"><option value="set">This value</option><option value="pct">% increase/decrease</option><option value="add">+/− amount</option></select> : null}
        {applyCol === "unit" ? <UnitSelect className={`${posInput} w-40`} value={applyVal} onChange={setApplyVal} /> : <input className={`${posInput} w-28`} value={applyVal} onChange={(e) => setApplyVal(e.target.value)} placeholder="Value" />}
        <Button variant="outline" onClick={applyAll}>Apply</Button>
        <label className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-accent"><Upload className="size-4" /> Upload Excel / CSV
          <input type="file" accept=".csv,text/csv,.xlsx,.xls" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
            let all: string[][];
            try {
              if (/\.xlsx?$/i.test(f.name)) { const X = await import("xlsx"); const wb = X.read(await f.arrayBuffer()); all = (X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" }) as unknown[][]).map((r) => r.map((v) => String(v ?? ""))).filter((r) => r.some((v) => v.trim() !== "")); }
              else all = parseCsv(await f.text());
            } catch { return toast.error("Could not read this file"); } if (all.length < 2) return toast.error("CSV has no data rows");
            setCsv(detectTable(all));
          }} />
        </label>
      </div>
      {csv && <BulkCsvImport headers={csv.headers} rows={csv.rows} products={products} onClose={() => setCsv(null)}
        fields={COLS.filter((c) => !["name", "stock_value"].includes(c.k)).map((c) => ({ k: c.k, label: c.label, num: c.num }))}
        onApply={async (ups) => {
          const by = new Map<string, Record<string, string>>();
          ups.forEach((u) => { if (u.v !== orig[u.id]?.[u.k]) { const o = by.get(u.id) ?? { id: u.id }; o[u.k] = u.v; by.set(u.id, o); } });
          const rows = [...by.values()]; setCsv(null);
          if (!rows.length) return toast.info("Prices are already the same — nothing to update");
          setSaving(true);
          try { for (let i = 0; i < rows.length; i += 500) await bulkUpdateProducts({ data: { rows: rows.slice(i, i + 500) } }); toast.success(`${rows.length} products updated`); onSaved(); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); } finally { setSaving(false); }
        }} />}
      <label className="flex h-10 items-center gap-2 rounded-lg border border-border px-3 focus-within:border-primary">
        <Search className="size-4 text-primary" /><input className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product" />
      </label>
      <div className="max-h-[60vh] overflow-auto rounded-lg border border-border">
        <table className="w-full min-w-[2050px] table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-12" />
            {COLS.map((c) => <col key={c.k} className={c.w} />)}
            <col className="w-14" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0] shadow-border"><tr className="text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <th className="sticky left-0 z-20 bg-card px-2 py-2"><input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(list.map((p) => p.id)))} aria-label="Select all" /></th>
            {COLS.map((c, i) => <th key={c.k} style={c.k === "name" ? undefined : tint(i, activeCol === c.k ? 45 : 18)} className={`truncate px-2 py-2 transition-colors ${activeCol === c.k ? "text-foreground" : ""} ${c.k === "name" ? "sticky left-12 z-20 border-r border-border bg-card" : ""}`} title={c.label}>{c.label}</th>)}
            <th className="px-2 py-2">Delete</th>
          </tr></thead>
          <tbody onKeyDown={gridKeys} onMouseLeave={() => setActiveCol(null)} onBlur={() => setActiveCol(null)}>
            {list.slice(0, 1000).map((p) => { const r = rowOf(p.id); return (
              <tr key={p.id} className={`border-t border-border ${dirtyIds.includes(p.id) ? "bg-accent" : ""}`}>
                <td className={`sticky left-0 z-10 px-2 py-1 ${dirtyIds.includes(p.id) ? "bg-accent" : "bg-card"}`}><input type="checkbox" checked={picked.has(p.id)} onChange={() => setPicked((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })} aria-label={`Select ${p.name}`} /></td>
                {COLS.map((c, i) => (
                  <td key={c.k} onMouseEnter={() => setActiveCol(c.k)} onFocus={() => setActiveCol(c.k)} style={c.k === "name" || dirtyIds.includes(p.id) && activeCol !== c.k ? undefined : tint(i, activeCol === c.k ? 32 : 8)} className={`px-1 py-1 transition-colors ${c.k === "name" ? `sticky left-12 z-10 border-r border-border ${dirtyIds.includes(p.id) ? "bg-accent" : "bg-card"}` : ""}`}>
                    {c.k === "unit" ? <UnitSelect className={`${posInput} h-9 w-full px-1 ${r.unit !== orig[p.id].unit ? "border-primary" : ""}`} value={r.unit} onChange={(v) => set(p.id, "unit", v)} label={`Unit ${p.name}`} /> : <input className={`${posInput} h-9 w-full px-2 ${c.num ? "text-right" : ""} ${c.k !== "stock_value" && r[c.k] !== orig[p.id][c.k] ? "border-primary" : ""}`} value={r[c.k]} inputMode={c.num ? "decimal" : undefined}
                      title={c.k === "stock_value" ? "Changing stock value will auto-calculate the purchase price" : undefined} onChange={(e) => set(p.id, c.k, e.target.value)} aria-label={`${c.label} ${p.name}`} />}
                  </td>
                ))}
                <td className="px-1 py-1 text-center"><Button variant="ghost" size="icon" onClick={() => del([p.id])} aria-label={`Delete ${p.name}`}><Trash2 className="text-destructive" /></Button></td>
              </tr>
            ); })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Changing stock qty records the difference in the stock ledger as "Bulk update". Stock value = stock × purchase price; changing the value auto-derives the purchase price. Total value: {rs(list.reduce((s, p) => s + (Number(rowOf(p.id).stock_value) || 0), 0))}</p>
    </section>
  );
}
