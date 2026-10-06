import { Button } from "@/components/ui/button";
import { posInput } from "@/components/pos-subnav";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
import { useMemo, useState } from "react";

export type CsvField = { k: string; label: string; num?: boolean };

// Minimal CSV parser with quote support; auto-detects comma / semicolon / tab
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^\uFEFF/, "");
  const first = t.split(/\r?\n/, 1)[0] ?? "";
  const sep = [",", ";", "\t"].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

export const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, " ").trim();
const cleanNum = (s: string) => s.replace(/[^0-9.\-]/g, "");

const GUESS: Record<string, RegExp> = {
  name: /^(product|item)?\s*name$|^product$|^item$|description/i,
  sale_price: /sale|selling|retail|^price$|^rate$/i,
  purchase_price: /purchase|cost|buy/i,
  stock: /stock\s*(qty|quantity)?$|^qty$|quantity|opening/i,
  sku: /sku|item\s*code|^code$/i,
  barcode: /barcode/i, category: /category|group/i, brand: /brand/i, unit: /^unit$/i,
  wholesale_price: /wholesale/i, min_stock: /min.*stock|reorder/i, tax_percent: /tax|gst/i, min_sale_price: /min.*sale/i,
};

export function BulkCsvImport({ headers, rows, fields, products, onApply, onClose }: {
  headers: string[]; rows: string[][]; fields: CsvField[];
  products: { id: string; name: string }[];
  onApply: (updates: { id: string; k: string; v: string }[], matched: number) => void; onClose: () => void;
}) {
  const guess = (k: string) => { const re = GUESS[k]; const i = re ? headers.findIndex((h) => re.test(h.trim())) : -1; return i; };
  const [nameCol, setNameCol] = useState(() => Math.max(0, guess("name")));
  const [map, setMap] = useState<Record<string, { on: boolean; col: number }>>(() =>
    Object.fromEntries(fields.map((f) => { const c = guess(f.k); return [f.k, { on: ["sale_price", "purchase_price"].includes(f.k) && c >= 0, col: c }]; })));
  const [more, setMore] = useState(false);
  const byName = useMemo(() => { const m = new Map<string, string>(); products.forEach((p) => m.set(normName(p.name), p.id)); return m; }, [products]);
  const squash = (s: string) => normName(s).replace(/ /g, "");
  const bySquash = useMemo(() => { const m = new Map<string, string>(); products.forEach((p) => m.set(squash(p.name), p.id)); return m; }, [products]);
  const result = useMemo(() => {
    const matched: { id: string; row: string[] }[] = []; const missing: string[] = [];
    rows.forEach((r) => { const n = (r[nameCol] ?? "").trim(); if (!n) return; const id = byName.get(normName(n)) ?? bySquash.get(squash(n)); id ? matched.push({ id, row: r }) : missing.push(n); });
    return { matched, missing };
  }, [rows, nameCol, byName]);
  const active = fields.filter((f) => map[f.k]?.on && map[f.k].col >= 0);

  const apply = () => {
    const ups: { id: string; k: string; v: string }[] = [];
    result.matched.forEach(({ id, row }) => active.forEach((f) => {
      let v = (row[map[f.k].col] ?? "").trim(); if (f.num) v = cleanNum(v);
      if (v !== "" && (!f.num || isFinite(Number(v)))) ups.push({ id, k: f.k, v });
    }));
    onApply(ups, result.matched.length);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-3" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-3 overflow-auto rounded-xl border border-border bg-card p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center"><p className="mr-auto font-bold text-foreground">Update prices from file</p><Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X /></Button></div>
        <label className="flex flex-wrap items-center gap-2 text-sm"><span className="w-40 font-medium">Match products by name</span>
          <select className={`${posInput} flex-1`} value={nameCol} onChange={(e) => setNameCol(Number(e.target.value))}>{headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}</select>
        </label>
        <p className="text-xs text-muted-foreground">Step 1: choose the column with product names. Step 2: tick what to update and pick its column. Step 3: press Update &amp; Save.</p>
        <div className="divide-y divide-border rounded-lg border border-border">
          {fields.filter((f) => more || ["sale_price", "purchase_price"].includes(f.k)).map((f) => { const m = map[f.k]; return (
            <div key={f.k} className="flex items-center gap-2 px-2 py-1.5 text-sm">
              <label className="flex w-44 items-center gap-2"><input type="checkbox" checked={m.on} onChange={(e) => setMap({ ...map, [f.k]: { ...m, on: e.target.checked, col: m.col < 0 ? 0 : m.col } })} />{f.label}</label>
              <select className={`${posInput} h-9 flex-1`} disabled={!m.on} value={m.col} onChange={(e) => setMap({ ...map, [f.k]: { ...m, col: Number(e.target.value) } })}>
                <option value={-1}>— Not mapped —</option>{headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
              </select>
            </div>); })}
        </div>
        <button type="button" className="self-start text-xs font-medium text-primary underline" onClick={() => setMore(!more)}>{more ? "Show only prices" : "Show more fields (stock, category, etc.)"}</button>
        <div className="rounded-lg bg-muted p-2 text-sm">
          <p><b>{result.matched.length}</b> products matched, <b className={result.missing.length ? "text-destructive" : ""}>{result.missing.length}</b> not found</p>
          {result.missing.length > 0 && <p className="mt-1 max-h-20 overflow-auto text-xs text-muted-foreground">{result.missing.slice(0, 50).join(", ")}{result.missing.length > 50 ? "…" : ""}</p>}
        </div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={apply} disabled={!active.length || !result.matched.length}>Update &amp; Save</Button></div>
      </div>
    </div>, document.body);
}
