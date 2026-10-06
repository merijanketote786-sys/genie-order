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

// Header row = the row (within the first 15) with the most non-empty, mostly non-numeric cells
export function detectTable(all: string[][]): { headers: string[]; rows: string[][] } {
  let best = 0, score = -1;
  all.slice(0, 15).forEach((r, i) => { const sc = r.filter((v) => v.trim() && !isFinite(Number(cleanNum(v) || "x"))).length; if (sc > score) { score = sc; best = i; } });
  const width = Math.max(0, ...all.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => (all[best]?.[i] ?? "").trim() || `Column ${i + 1}`);
  return { headers, rows: all.slice(best + 1) };
}

export function BulkCsvImport({ headers, rows, fields, products, onApply, onClose }: {
  headers: string[]; rows: string[][]; fields: CsvField[];
  products: { id: string; name: string }[];
  onApply: (updates: { id: string; k: string; v: string }[], matched: number) => void; onClose: () => void;
}) {
  const cols = useMemo(() => headers.map((h, i) => ({ i, h, samples: rows.map((r) => (r[i] ?? "").trim()).filter(Boolean) })).filter((c) => c.samples.length), [headers, rows]);
  const [use, setUse] = useState<Record<number, string>>(() => {
    const m: Record<number, string> = {}; const taken = new Set<string>();
    const order = ["name", "min_sale_price", "wholesale_price", "min_stock", "purchase_price", "sale_price", "stock", ...Object.keys(GUESS)];
    for (const k of order) { if (taken.has(k) || (k !== "name" && !fields.some((f) => f.k === k))) continue;
      const c = cols.find((c) => m[c.i] === undefined && GUESS[k]?.test(c.h.trim())); if (c) { m[c.i] = k; taken.add(k); } }
    if (!taken.has("name")) { const c = cols.find((c) => m[c.i] === undefined && c.samples.some((v) => !isFinite(Number(v)))); if (c) m[c.i] = "name"; }
    return m;
  });
  const nameCol = Number(Object.keys(use).find((k) => use[Number(k)] === "name") ?? -1);
  const squash = (s: string) => normName(s).replace(/ /g, "");
  const byName = useMemo(() => { const m = new Map<string, string>(); products.forEach((p) => { m.set(normName(p.name), p.id); m.set(squash(p.name), p.id); }); return m; }, [products]);
  const result = useMemo(() => {
    const matched: { id: string; row: string[] }[] = []; const missing: string[] = [];
    if (nameCol < 0) return { matched, missing };
    rows.forEach((r) => { const n = (r[nameCol] ?? "").trim(); if (!n) return; const id = byName.get(normName(n)) ?? byName.get(squash(n)); id ? matched.push({ id, row: r }) : missing.push(n); });
    return { matched, missing };
  }, [rows, nameCol, byName]);
  const active = Object.entries(use).filter(([, k]) => k && k !== "name").map(([c, k]) => ({ col: Number(c), f: fields.find((f) => f.k === k)! })).filter((a) => a.f);
  const setCol = (i: number, k: string) => setUse((u) => { const n = { ...u }; if (k) for (const c in n) if (n[c] === k) delete n[c]; if (k) n[i] = k; else delete n[i]; return n; });

  const apply = () => {
    const ups: { id: string; k: string; v: string }[] = [];
    result.matched.forEach(({ id, row }) => active.forEach(({ col, f }) => {
      let v = (row[col] ?? "").trim(); if (f.num) v = cleanNum(v);
      if (v !== "" && (!f.num || isFinite(Number(v)))) ups.push({ id, k: f.k, v });
    }));
    onApply(ups, result.matched.length);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-3" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col gap-3 overflow-auto rounded-xl border border-border bg-card p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center"><p className="mr-auto font-bold text-foreground">Import from file</p><Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X /></Button></div>
        <p className="text-xs text-muted-foreground">{cols.length} columns found in your file. Each column was auto-detected — change "Use as" if anything is wrong, or choose "Skip" to ignore it.</p>
        <div className="divide-y divide-border rounded-lg border border-border">
          {cols.map((c) => (
            <div key={c.i} className="flex flex-wrap items-center gap-2 px-2 py-2 text-sm">
              <div className="min-w-0 flex-1"><p className="truncate font-medium">{c.h}</p><p className="truncate text-xs text-muted-foreground">{c.samples.slice(0, 3).join(" · ")}</p></div>
              <select className={`${posInput} h-9 w-48 ${use[c.i] ? "border-primary" : ""}`} value={use[c.i] ?? ""} onChange={(e) => setCol(c.i, e.target.value)} aria-label={`Use ${c.h} as`}>
                <option value="">Skip</option><option value="name">Product name (match)</option>
                {fields.map((f) => <option key={f.k} value={f.k}>{f.label}</option>)}
              </select>
            </div>))}
        </div>
        <div className="rounded-lg bg-muted p-2 text-sm">
          {nameCol < 0 ? <p className="text-destructive">Choose which column has the product names.</p> : <>
          <p><b>{result.matched.length}</b> products matched, <b className={result.missing.length ? "text-destructive" : ""}>{result.missing.length}</b> not found · updating: {active.map((a) => a.f.label).join(", ") || "nothing"}</p>
          {result.missing.length > 0 && <p className="mt-1 max-h-20 overflow-auto text-xs text-muted-foreground">{result.missing.slice(0, 50).join(", ")}{result.missing.length > 50 ? "…" : ""}</p>}</>}
        </div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={apply} disabled={!active.length || !result.matched.length}>Update &amp; Save</Button></div>
      </div>
    </div>, document.body);
}
