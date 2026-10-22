import { Button } from "@/components/ui/button";
import { posInput, rs } from "@/components/pos-subnav";
import { bulkUpdateProducts, deletePosProducts, type InvProduct } from "@/lib/inventory.functions";
import { UnitSelect } from "@/components/unit-select";
import { usePosCategories } from "@/lib/pos-catalog";
import { ChevronDown, Search, Trash2, Upload, X } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useUnsavedGuard } from "@/hooks/use-unsaved-guard";
import { BulkCsvImport, parseCsv, detectTable } from "@/components/bulk-csv-import";
import { Switch } from "@/components/ui/switch";
import { applyPctRates, priced } from "@/lib/bulk-pricing";

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
  { k: "sale_price", label: "Sale price", w: "w-56", num: true },
  { k: "wholesale_price", label: "Wholesale price", w: "w-60", num: true },
  { k: "wholesale_min_qty", label: "Min wholesale qty", w: "w-32", num: true },
  { k: "min_sale_price", label: "Min sale price", w: "w-32", num: true },
  { k: "stock", label: "Stock qty", w: "w-24", num: true },
  { k: "stock_value", label: "Stock value", w: "w-32", num: true },
  { k: "min_stock", label: "Min stock", w: "w-24", num: true },
  { k: "tax_percent", label: "Tax %", w: "w-20", num: true },
  { k: "is_active", label: "Active", w: "w-16" },
];
type Row = Record<string, string>;
const base = (p: InvProduct): Row => ({
  name: p.name, sku: p.sku, barcode: p.barcode, category: p.category, brand: p.brand, unit: p.unit,
  purchase_price: p.purchasePrice?.toString() ?? "", sale_price: String(p.salePrice ?? 0), wholesale_price: p.wholesalePrice?.toString() ?? "",
  wholesale_min_qty: p.wholesaleMinQty?.toString() ?? "",
  min_sale_price: p.minSalePrice?.toString() ?? "", stock: String(p.stock), min_stock: p.minStock?.toString() ?? "", tax_percent: p.taxPercent?.toString() ?? "",
  is_active: p.isActive === false ? "false" : "true",
});
const MK_KEY = "pos-bulk-markup";
const val = (r: Row) => { const s = Number(r.stock) || 0, c = Number(r.purchase_price) || 0; return r.purchase_price === "" ? "" : String(Math.round(Math.max(0, s) * c * 100) / 100); };

function MkHead({ label, on, pct, onOn, onPct, disabled }: { label: string; on: boolean; pct: string; onOn: (v: boolean) => void; onPct: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-1 normal-case">
      <input type="checkbox" checked={on} onChange={(e) => onOn(e.target.checked)} aria-label={`Auto ${label} for all`} title="Auto % from purchase price for all products" />
      <span className="truncate">{label}</span>
      <input className={`${posInput} h-6 w-12 px-1 text-right text-[11px]`} value={pct} inputMode="decimal" onChange={(e) => onPct(e.target.value)} aria-label={`${label} percent`} />%
    </div>
  );
}

// Category cell: tap opens a small popup listing only the categories saved in the Categories section
function CatPicker({ value, original, options, onPick, label }: { value: string; original: string; options: string[]; onPick: (v: string) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const [cq, setCq] = useState("");
  const opts = options.filter((o) => o.toLowerCase().includes(cq.trim().toLowerCase()));
  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setCq(""); }} aria-label={label}
        className={`${posInput} flex h-9 w-full items-center justify-between gap-1 px-2 text-left ${value !== original ? "border-primary" : ""}`}>
        <span className={`truncate ${value ? "" : "text-muted-foreground"}`}>{value || "Select category"}</span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>
      {open && createPortal(
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-xs rounded-xl border border-border bg-card p-3 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold text-foreground">{label}</p>
              <Button type="button" variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setOpen(false); }} aria-label="Close"><X /></Button>
            </div>
            <input autoFocus className={`${posInput} mb-2 h-9 w-full px-2`} placeholder="Search category" value={cq} onChange={(e) => setCq(e.target.value)} />
            <div className="max-h-56 overflow-auto">
              {value && <button type="button" className="block w-full rounded-md px-2 py-2 text-left text-sm text-destructive hover:bg-accent" onClick={() => { onPick(""); setOpen(false); }}>Clear category</button>}
              {opts.map((o) => <button key={o} type="button" className={`block w-full rounded-md px-2 py-2 text-left text-sm hover:bg-accent ${o === value ? "bg-accent font-semibold" : ""}`} onClick={() => { onPick(o); setOpen(false); }}>{o}</button>)}
              {!opts.length && <p className="px-2 py-3 text-center text-xs text-muted-foreground">No saved category matches — add it in the Categories section first.</p>}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

const DRAFT_KEY = "pos-bulk-update-draft-v2";

export function BulkUpdateProducts({ products, inactiveProducts, onClose, onSaved }: { products: InvProduct[]; inactiveProducts?: InvProduct[]; onClose: () => void; onSaved: () => void }) {
  // Active + inactive items in one pool so filters can show either
  const pool = useMemo(() => [...products, ...(inactiveProducts ?? [])], [products, inactiveProducts]);
  const orig = useMemo(() => Object.fromEntries(pool.map((p) => [p.id, base(p)])), [pool]);
  const [edits, setEdits] = useState<Record<string, Row>>({});
  // Unsaved edits stay on this device (no internet needed) until Save.
  const [draftReady, setDraftReady] = useState(false);
  // Draft stores only changed fields with the value they were changed from; a field is restored only
  // if the product still has that original value, so untouched or since-changed fields are never overwritten.
  useEffect(() => { try { const v = localStorage.getItem(DRAFT_KEY); if (v) { const d = JSON.parse(v) as Record<string, Record<string, { from: string; to: string }>>; const keep: Record<string, Row> = {}; let stale = 0;
    Object.entries(d).forEach(([id, f]) => { const o = orig[id]; if (!o || typeof f !== "object") return; const row = { ...o }; let ch = false; Object.entries(f).forEach(([k, x]) => { if (!x || typeof x !== "object" || !(k in o)) return; if (o[k] === x.from) { row[k] = x.to; ch = true; } else stale++; }); if (ch) keep[id] = row; });
    if (Object.keys(keep).length) { setEdits(keep); toast.info(`${Object.keys(keep).length} unsaved change(s) restored${stale ? ` (${stale} skipped — item changed since)` : ""}`); } } } catch { /* ignore */ } setDraftReady(true); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (!draftReady) return; const t = window.setTimeout(() => { try {
    const d: Record<string, Record<string, { from: string; to: string }>> = {};
    Object.entries(edits).forEach(([id, r]) => { const o = orig[id]; if (!o) return; Object.keys(o).forEach((k) => { if (k !== "stock_value" && r[k] !== undefined && r[k] !== o[k]) (d[id] ??= {})[k] = { from: o[k], to: r[k] }; }); });
    if (Object.keys(d).length) localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); else localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } }, 400); return () => window.clearTimeout(t); }, [edits, draftReady, orig]);
  const [qRaw, setQ] = useState("");
  const q = useDeferredValue(qRaw);
  const [fKind, setFKind] = useState("all");
  const [fCat, setFCat] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [applyCol, setApplyCol] = useState("sale_price");
  const [applyMode, setApplyMode] = useState<"set" | "pct" | "add" | "cost">("set");
  const [applyVal, setApplyVal] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeCol, setActiveCol] = useState<string | null>(null);
  const [csv, setCsv] = useState<{ headers: string[]; rows: string[][] } | null>(null);

  const cats = useMemo(() => [...new Set(pool.map((p) => p.category).filter(Boolean))].sort(), [pool]);
  const { data: savedCats } = usePosCategories();
  const catOptions = useMemo(() => [...new Set((savedCats ?? []).map((c) => c.name))].sort(), [savedCats]);
  const isLow = (p: InvProduct) => p.minStock != null && p.stock <= p.minStock;
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return pool.filter((p) => {
      const active = p.isActive !== false;
      if (fKind === "active" && !active) return false;
      if (fKind === "inactive" && active) return false;
      if (fKind === "low" && !isLow(p)) return false;
      if (fKind === "out" && p.stock > 0) return false;
      if (fKind === "no_purchase" && p.purchasePrice != null) return false;
      if (fKind === "no_sale" && Number(p.salePrice ?? 0) > 0) return false;
      if (fKind === "has_min" && p.minStock == null) return false;
      if (fKind === "no_min" && p.minStock != null) return false;
      if (fCat && p.category !== fCat) return false;
      return !t || [p.name, p.sku, p.barcode, p.category, p.brand].some((v) => v.toLowerCase().includes(t));
    });
  }, [pool, q, fKind, fCat]);
  const rowOf = (id: string): Row => { const r = { ...orig[id], ...edits[id] }; return { ...r, stock_value: edits[id]?.stock_value ?? val(r) }; };
  // Auto pricing from purchase price: sale = purchase + sale%, wholesale = purchase + wholesale%
  const [mk, setMk] = useState({ salePct: "45", wsPct: "15", saleOn: true, wsOn: true, pctOn: true });
  useEffect(() => { try { const v = localStorage.getItem(MK_KEY); if (v) setMk((m) => ({ ...m, ...JSON.parse(v) })); } catch { /* ignore */ } }, []);
  const updMk = (p: Partial<typeof mk>) => setMk((m) => { const n = { ...m, ...p }; try { localStorage.setItem(MK_KEY, JSON.stringify(n)); } catch { /* ignore */ } return n; });
  const [rowMk, setRowMk] = useState<Record<string, { sale?: boolean; ws?: boolean }>>({});
  // Per-product markup % (overrides the global %). Saved on this device.
  const RP_KEY = "pos-bulk-row-pct";
  const [rowPct, setRowPctState] = useState<Record<string, { sale?: string; ws?: string }>>({});
  useEffect(() => { try { const v = localStorage.getItem(RP_KEY); if (v) setRowPctState(JSON.parse(v)); } catch { /* ignore */ } }, []);
  const saveRowPct = (fn: (m: Record<string, { sale?: string; ws?: string }>) => Record<string, { sale?: string; ws?: string }>) => setRowPctState((m) => { const n = fn(m); try { localStorage.setItem(RP_KEY, JSON.stringify(n)); } catch { /* ignore */ } return n; });
  const pctOf = (id: string, f: "sale" | "ws") => { const v = rowPct[id]?.[f]; return v != null && v.trim() !== "" ? v : f === "sale" ? mk.salePct : mk.wsPct; };
  const autoOn = (id: string, f: "sale" | "ws") => rowMk[id]?.[f] ?? (f === "sale" ? mk.saleOn : mk.wsOn);
  // Percentage rates go through the shared rule so the "Rate by %" switch can turn the
  // whole feature off: applyPctRates returns the row untouched whenever the switch is off.
  const applyMk = (id: string, cur: Row, only?: "sale" | "ws", force?: { sale?: boolean; ws?: boolean }, over?: { sale?: string; ws?: string }) => {
    const n = applyPctRates(cur, {
      on: mk.pctOn,
      sale: only !== "ws" && (force?.sale ?? autoOn(id, "sale")),
      ws: only !== "sale" && (force?.ws ?? autoOn(id, "ws")),
      salePct: over?.sale ?? pctOf(id, "sale"),
      wsPct: over?.ws ?? pctOf(id, "ws"),
    });
    cur.sale_price = n.sale_price; cur.wholesale_price = n.wholesale_price;
  };
  const setRowPct = (id: string, f: "sale" | "ws", v: string) => {
    if (!mk.pctOn) return;
    saveRowPct((m) => ({ ...m, [id]: { ...m[id], [f]: v } }));
    setRowMk((m) => ({ ...m, [id]: { ...m[id], [f]: true } }));
    const pct = v.trim() !== "" ? v : f === "sale" ? mk.salePct : mk.wsPct;
    setEdits((e) => { const cur = { ...orig[id], ...e[id] }; applyMk(id, cur, f, { [f]: true }, { [f]: pct }); return { ...e, [id]: cur }; });
  };
  const toggleRowMk = (id: string, f: "sale" | "ws") => {
    if (!mk.pctOn) return;
    const on = !autoOn(id, f);
    setRowMk((m) => ({ ...m, [id]: { ...m[id], [f]: on } }));
    if (on) setEdits((e) => { const cur = { ...orig[id], ...e[id] }; applyMk(id, cur, f, { [f]: true }); return { ...e, [id]: cur }; });
  };
  const set = (id: string, k: string, v: string) => setEdits((e) => {
    const cur = { ...orig[id], ...e[id], [k]: v };
    if (k === "stock_value") { const s = Number(cur.stock) || 0; if (s > 0 && v !== "") cur.purchase_price = String(Math.round((Number(v) / s) * 100) / 100); }
    else delete cur.stock_value;
    if (k === "purchase_price" || k === "stock_value") applyMk(id, cur);
    return { ...e, [id]: cur };
  });
  const dirtyIds = useMemo(() => Object.keys(edits).filter((id) => COLS.some((c) => c.k !== "stock_value" && (edits[id][c.k] ?? orig[id][c.k]) !== orig[id][c.k])), [edits, orig]);
  const dirtySet = useMemo(() => new Set(dirtyIds), [dirtyIds]);
  const [limit, setLimit] = useState(80);
  useEffect(() => { setLimit(80); }, [q, fKind, fCat]);
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = moreRef.current; if (!el) return; const ob = new IntersectionObserver((en) => { if (en.some((x) => x.isIntersecting)) setLimit((l) => l + 80); }, { rootMargin: "300px" }); ob.observe(el); return () => ob.disconnect(); }, [limit, list.length]);
  const searchRef = useRef<HTMLInputElement>(null);

  const targetIds = () => (picked.size ? [...picked] : list.map((p) => p.id));
  // Recalculate sale / wholesale from purchase price for all visible (or selected) products.
  // Without explicit pcts each product uses its own % (or the global one); with explicit pcts the
  // same % is applied to every target product and stored as their per-product %.
  const applyMarkup = (fields: { sale: boolean; ws: boolean }, pcts?: { salePct: string; wsPct: string }) => {
    if (!mk.pctOn) return toast.error("Rate by % is off — switch it on to apply percentage pricing");
    if (!fields.sale && !fields.ws) return toast.error("Tick Sale or Wholesale first");
    const ids = targetIds();
    let done = 0, skipped = 0;
    if (pcts) saveRowPct((m) => { const n = { ...m }; ids.forEach((id) => { n[id] = { ...n[id], ...(fields.sale ? { sale: pcts.salePct } : {}), ...(fields.ws ? { ws: pcts.wsPct } : {}) }; }); return n; });
    setEdits((e) => {
      const n = { ...e }; done = 0; skipped = 0;
      ids.forEach((id) => {
        const cur = { ...orig[id], ...e[id] };
        const was = { sale: cur.sale_price, ws: cur.wholesale_price };
        const r2 = applyPctRates(cur, { on: true, sale: fields.sale && rowMk[id]?.sale !== false, ws: fields.ws && rowMk[id]?.ws !== false, salePct: pcts?.salePct ?? pctOf(id, "sale"), wsPct: pcts?.wsPct ?? pctOf(id, "ws") });
        cur.sale_price = r2.sale_price; cur.wholesale_price = r2.wholesale_price;
        const ch = cur.sale_price !== was.sale || cur.wholesale_price !== was.ws;
        if (ch) { n[id] = cur; done++; } else skipped++;
      });
      return n;
    });
    setTimeout(() => toast.success(`Prices calculated for ${done} products${skipped ? ` (${skipped} skipped — no purchase price)` : ""} — press Save`), 0);
  };

  const applyAll = () => {
    const ids = targetIds();
    const col = COLS.find((c) => c.k === applyCol)!;
    if (col.num && applyMode !== "set" && applyVal.trim() === "") return toast.error("Enter a value");
    if (!mk.pctOn && (applyMode === "pct" || applyMode === "cost")) return toast.error("Rate by % is off — switch it on to use the percentage methods");
    if (applyMode === "cost" && (applyCol === "sale_price" || applyCol === "wholesale_price")) {
      return applyMarkup(applyCol === "sale_price" ? { sale: true, ws: false } : { sale: false, ws: true }, { ...mk, salePct: applyVal, wsPct: applyVal });
    }
    let n = 0;
    setEdits((e) => {
      const out = { ...e }; n = 0;
      ids.forEach((id) => {
        const cur = { ...orig[id], ...e[id] };
        let v = applyVal;
        if (col.num && applyMode !== "set") {
          const base0 = applyMode === "cost" ? Number(cur.purchase_price) || 0 : Number(cur[applyCol]) || 0, x = Number(applyVal) || 0;
          v = String(Math.round((applyMode === "add" ? base0 + x : base0 * (1 + x / 100)) * 100) / 100);
        }
        cur[applyCol] = v; delete cur.stock_value;
        if (applyCol === "purchase_price") applyMk(id, cur);
        out[id] = cur; n++;
      });
      return out;
    });
    setTimeout(() => toast.success(`Applied to ${n} products — press Save`), 0);
  };

  const save = async () => {
    if (!dirtyIds.length) return toast.info("No changes");
    if (typeof navigator !== "undefined" && !navigator.onLine) return toast.error("No internet — your changes are kept on this device. Connect to the internet and press Save.");
    for (const id of dirtyIds) {
      const r = rowOf(id);
      if (!r.name.trim()) return toast.error("Product name cannot be empty");
      for (const c of COLS) if (c.num && c.k !== "stock_value" && r[c.k] !== "" && (!isFinite(Number(r[c.k])) || (c.k !== "stock" && Number(r[c.k]) < 0))) return toast.error(`${r.name}: ${c.label} is invalid`);
    }
    const rows = dirtyIds.map((id) => { const r = rowOf(id); const o: Record<string, string> = { id }; COLS.forEach((c) => { if (c.k !== "stock_value" && r[c.k] !== orig[id][c.k]) o[c.k] = r[c.k].trim(); }); return o; });
    setSaving(true);
    try {
      for (let i = 0; i < rows.length; i += 500) await bulkUpdateProducts({ data: { rows: rows.slice(i, i + 500) } });
      toast.success(`${rows.length} products updated`); setEdits({}); try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } onSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); } finally { setSaving(false); }
  };

  const del = async (ids: string[]) => {
    if (!ids.length) return toast.info("Select products first");
    if (!confirm(`Delete ${ids.length} product(s)? They will still appear on past bills.`)) return;
    try { const r = await deletePosProducts({ data: { ids } }); toast.success(`${r.deleted} product(s) deleted`); setPicked(new Set()); setEdits((e) => { const n = { ...e }; ids.forEach((i) => delete n[i]); return n; }); onSaved(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
  };

  const guardNode = useUnsavedGuard(dirtyIds.length > 0, save);
  const saveRef = useRef(save); saveRef.current = save;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); void saveRef.current(); }
      else if (mod && e.key.toLowerCase() === "f") { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); }
      else if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  const allPicked = list.length > 0 && list.every((p) => picked.has(p.id));

  // Arrow keys move the cursor between editable fields (up/down/left/right)
  const gridKeys = (e: React.KeyboardEvent) => {
    let k = e.key;
    if (k === "Enter" && (e.target as HTMLElement).tagName === "INPUT") k = e.shiftKey ? "ArrowUp" : "ArrowDown";
    if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(k)) return;
    if ((k === "ArrowUp" || k === "ArrowDown") && (e.target as HTMLElement).tagName === "SELECT" && e.key !== "Enter" && !e.altKey) return;
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
    if (e.key === "Enter" || k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown") {
      // Several inputs can share one cell (auto tick, %, rate): move within the cell first.
      const inCell = [...td.querySelectorAll<HTMLElement>("input:not([disabled]), select:not([disabled])")];
      const ii = inCell.indexOf(t);
      if (e.key !== "Enter" && (k === "ArrowLeft" || k === "ArrowRight") && inCell.length > 1) {
        const nx = inCell[ii + (k === "ArrowRight" ? 1 : -1)];
        if (nx) { e.preventDefault(); nx.focus(); if (nx instanceof HTMLInputElement && nx.type !== "checkbox") nx.select(); return; }
      }
    }
    const rows = [...body.querySelectorAll(":scope > tr")];
    if (k === "ArrowDown" && rows.indexOf(tr) >= rows.length - 3) setLimit((l) => l + 80);
    const ri = rows.indexOf(tr), ci = [...tr.children].indexOf(td);
    const nri = k === "ArrowUp" ? ri - 1 : k === "ArrowDown" ? ri + 1 : ri;
    const nci = k === "ArrowLeft" ? ci - 1 : k === "ArrowRight" ? ci + 1 : ci;
    const cellInputs = [...(rows[nri]?.children[nci]?.querySelectorAll<HTMLElement>("input:not([disabled]), select:not([disabled]), button") ?? [])];
    const same = td.querySelectorAll("input:not([disabled]), select:not([disabled])");
    const pos = [...same].indexOf(t);
    const target = nri !== ri ? cellInputs[pos >= 0 ? Math.min(pos, cellInputs.length - 1) : 0] : k === "ArrowLeft" ? cellInputs[cellInputs.length - 1] : cellInputs[0];
    if (target) { e.preventDefault(); target.focus(); if (target.tagName === "INPUT") (target as HTMLInputElement).select(); }
  };
  return (
    <section className="space-y-2 rounded-xl border border-border bg-card p-3">
      {guardNode}
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto font-bold text-foreground">Bulk update items <span className="text-xs font-normal text-muted-foreground">{dirtyIds.length} changed</span>
          <span className="ml-2 hidden text-[11px] font-normal text-muted-foreground lg:inline">Keys: / search · Enter next row · Shift+Enter up · arrows move · Ctrl+S save</span></p>
        <Button variant="destructive" onClick={() => del([...picked])} disabled={!picked.size || saving}><Trash2 /> Delete ({picked.size})</Button>
        <Button variant="outline" onClick={() => setEdits({})} disabled={!dirtyIds.length || saving}>Reset</Button>
        <Button onClick={save} disabled={saving || !dirtyIds.length}>{saving ? "Saving..." : `Save (${dirtyIds.length})`}</Button>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X /></Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2 text-sm">
        <span className="text-xs text-muted-foreground">{picked.size ? `${picked.size} selected` : "All visible"} products:</span>
        <select className={`${posInput} w-40`} value={applyCol} onChange={(e) => setApplyCol(e.target.value)} aria-label="Field">{COLS.filter((c) => !["name", "sku", "barcode", "stock_value", "is_active"].includes(c.k)).map((c) => <option key={c.k} value={c.k}>{c.label}</option>)}</select>
        {COLS.find((c) => c.k === applyCol)?.num ? <select className={`${posInput} w-32`} value={applyMode} onChange={(e) => setApplyMode(e.target.value as "set")} aria-label="Method"><option value="set">This value</option><option value="pct" disabled={!mk.pctOn}>% increase/decrease</option><option value="add">+/− amount</option>{applyCol === "sale_price" || applyCol === "wholesale_price" ? <option value="cost" disabled={!mk.pctOn}>% over purchase price</option> : null}</select> : null}
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
      {csv && <BulkCsvImport headers={csv.headers} rows={csv.rows} products={pool} onClose={() => setCsv(null)}
        fields={COLS.filter((c) => !["name", "stock_value", "is_active"].includes(c.k)).map((c) => ({ k: c.k, label: c.label, num: c.num }))}
        onApply={async (ups) => {
          const by = new Map<string, Record<string, string>>();
          ups.forEach((u) => { if (u.v !== orig[u.id]?.[u.k]) { const o = by.get(u.id) ?? { id: u.id }; o[u.k] = u.v; by.set(u.id, o); } });
          const rows = [...by.values()]; setCsv(null);
          if (!rows.length) return toast.info("Prices are already the same — nothing to update");
          setSaving(true);
          try { for (let i = 0; i < rows.length; i += 500) await bulkUpdateProducts({ data: { rows: rows.slice(i, i + 500) } }); toast.success(`${rows.length} products updated`); onSaved(); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); } finally { setSaving(false); }
        }} />}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Show:</span>
        <select className={`${posInput} w-60`} value={fKind} onChange={(e) => setFKind(e.target.value)} aria-label="Filter items">
          <option value="all">All items</option>
          <option value="active">Active items</option>
          <option value="inactive">Inactive items</option>
          <option value="low">Low stock (at or below min)</option>
          <option value="out">Out of stock</option>
          <option value="no_purchase">No purchase price</option>
          <option value="no_sale">No sale price</option>
          <option value="has_min">Min stock set</option>
          <option value="no_min">No min stock set</option>
        </select>
        <select className={`${posInput} w-44`} value={fCat} onChange={(e) => setFCat(e.target.value)} aria-label="Filter by category">
          <option value="">Every category</option>
          {cats.map((c) => <option key={c}>{c}</option>)}
        </select>
        <span className="text-xs text-muted-foreground">{list.length} of {pool.length} items shown</span>
      </div>
      <div className={`flex flex-wrap items-center gap-3 rounded-lg border border-border p-2 text-xs text-muted-foreground ${mk.pctOn ? "" : "opacity-60"}`}>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-2 py-1 font-medium text-foreground" title="Master switch: when off, no rate is calculated by percentage"><Switch checked={mk.pctOn} onCheckedChange={(v) => updMk({ pctOn: v })} aria-label="Apply rate by percentage" />Rate by %</label>
        <span className="font-medium text-foreground">Auto price from purchase price:</span>
        <label className="inline-flex items-center gap-1 whitespace-nowrap"><input type="checkbox" disabled={!mk.pctOn} checked={mk.saleOn} onChange={(e) => { updMk({ saleOn: e.target.checked }); setRowMk((m) => Object.fromEntries(Object.entries(m).map(([id, x]) => [id, { ...x, sale: undefined }]))); }} aria-label="Auto sale price for all" />Sale +<input className={`${posInput} h-8 w-16 px-1 text-right`} disabled={!mk.pctOn} value={mk.salePct} inputMode="decimal" onChange={(e) => updMk({ salePct: e.target.value })} aria-label="Sale price percent" />%</label>
        <label className="inline-flex items-center gap-1 whitespace-nowrap"><input type="checkbox" disabled={!mk.pctOn} checked={mk.wsOn} onChange={(e) => { updMk({ wsOn: e.target.checked }); setRowMk((m) => Object.fromEntries(Object.entries(m).map(([id, x]) => [id, { ...x, ws: undefined }]))); }} aria-label="Auto wholesale price for all" />Wholesale +<input className={`${posInput} h-8 w-16 px-1 text-right`} disabled={!mk.pctOn} value={mk.wsPct} inputMode="decimal" onChange={(e) => updMk({ wsPct: e.target.value })} aria-label="Wholesale price percent" />%</label>
        <Button type="button" size="sm" disabled={!mk.pctOn} onClick={() => applyMarkup({ sale: mk.saleOn, ws: mk.wsOn }, { salePct: mk.salePct, wsPct: mk.wsPct })}>Apply to {picked.size ? `${picked.size} selected` : `all ${list.length} shown`}</Button>
        <span>{mk.pctOn ? "Untick to type a custom rate. Each product also has its own small tick." : "Rate by % is off — no rate is calculated from a percentage. Type rates directly, or use This value / +/− amount."}</span>
      </div>
      <label className="flex h-10 items-center gap-2 rounded-lg border border-border px-3 focus-within:border-primary">
        <Search className="size-4 text-primary" /><input className="min-w-0 flex-1 bg-transparent text-sm outline-none" ref={searchRef} value={qRaw} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); const el = document.querySelector<HTMLInputElement>("[data-bulk-grid] tbody tr td:nth-child(3) input, [data-bulk-grid] tbody tr input:not([type=checkbox])"); el?.focus(); el?.select(); } }} placeholder="Search product (press / or Ctrl+F) — Enter jumps to the list" aria-label="Search product" />
      </label>
      {/* Mobile: one card per product so no field is hidden behind sideways scrolling */}
      <div className="max-h-[60vh] space-y-2 overflow-auto sm:hidden">
        {list.slice(0, Math.min(limit, 300)).map((p) => { const r = rowOf(p.id); const dirty = dirtySet.has(p.id); const numIn = (k: string, lab: string) => (
          <label key={k} className="block text-[11px] font-medium text-muted-foreground"><span className="flex items-center justify-between gap-1">{lab}{k === "sale_price" || k === "wholesale_price" ? <span className="inline-flex items-center gap-1" title="Auto % from purchase price"><input type="checkbox" className="size-3.5" disabled={!mk.pctOn} checked={autoOn(p.id, k === "sale_price" ? "sale" : "ws")} onChange={() => toggleRowMk(p.id, k === "sale_price" ? "sale" : "ws")} aria-label={`Auto ${lab} ${p.name}`} /><input className={`${posInput} h-6 w-12 px-1 text-right text-[11px]`} disabled={!mk.pctOn} value={rowPct[p.id]?.[k === "sale_price" ? "sale" : "ws"] ?? ""} placeholder={k === "sale_price" ? mk.salePct : mk.wsPct} inputMode="decimal" onChange={(e) => setRowPct(p.id, k === "sale_price" ? "sale" : "ws", e.target.value)} aria-label={`${lab} percent ${p.name}`} />%</span> : null}</span>
            <input className={`${posInput} mt-0.5 h-9 w-full px-2 text-right text-foreground`} value={r[k]} inputMode="decimal" onChange={(e) => set(p.id, k, e.target.value)} aria-label={`${lab} ${p.name}`} />
          </label>);
          return (
            <div key={p.id} className={`rounded-lg border border-border p-2 ${dirty ? "bg-accent" : "bg-card"}`}>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={picked.has(p.id)} onChange={() => setPicked((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })} aria-label={`Select ${p.name}`} />
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{p.name}</p>
                <Button variant="ghost" size="icon" onClick={() => del([p.id])} aria-label={`Delete ${p.name}`}><Trash2 className="text-destructive" /></Button>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="col-span-2 block text-[11px] font-medium text-muted-foreground">Category
                  <div className="mt-0.5"><CatPicker value={r.category} original={orig[p.id].category} options={catOptions} onPick={(v) => set(p.id, "category", v)} label={`Category — ${p.name}`} /></div>
                </label>
                <label className="block text-[11px] font-medium text-muted-foreground">Unit
                  <div className="mt-0.5"><UnitSelect className={`${posInput} h-9 w-full px-1`} value={r.unit} onChange={(v) => set(p.id, "unit", v)} label={`Unit ${p.name}`} /></div>
                </label>
                <label className="block text-[11px] font-medium text-muted-foreground">Active
                  <select className={`${posInput} mt-0.5 h-9 w-full px-1`} value={r.is_active} onChange={(e) => set(p.id, "is_active", e.target.value)} aria-label={`Active ${p.name}`}><option value="true">Yes</option><option value="false">No</option></select>
                </label>
                {numIn("purchase_price", "Purchase price")}
                {numIn("sale_price", "Sale price")}
                {numIn("wholesale_price", "Wholesale price")}
                {numIn("wholesale_min_qty", "Min wholesale qty")}
                {numIn("min_sale_price", "Min sale price")}
                {numIn("stock", "Stock qty")}
                {numIn("min_stock", "Min stock")}
                {numIn("tax_percent", "Tax %")}
                <label className="block text-[11px] font-medium text-muted-foreground">Item code
                  <input className={`${posInput} mt-0.5 h-9 w-full px-2`} value={r.sku} onChange={(e) => set(p.id, "sku", e.target.value)} aria-label={`Item code ${p.name}`} />
                </label>
                <label className="block text-[11px] font-medium text-muted-foreground">Barcode
                  <input className={`${posInput} mt-0.5 h-9 w-full px-2`} value={r.barcode} onChange={(e) => set(p.id, "barcode", e.target.value)} aria-label={`Barcode ${p.name}`} />
                </label>
                <label className="col-span-2 block text-[11px] font-medium text-muted-foreground">Brand
                  <input className={`${posInput} mt-0.5 h-9 w-full px-2`} value={r.brand} onChange={(e) => set(p.id, "brand", e.target.value)} aria-label={`Brand ${p.name}`} />
                </label>
              </div>
            </div>
          );
        })}
        {list.length > Math.min(limit, 300) && <p className="py-2 text-center text-xs text-muted-foreground">{limit < 300 ? "Scroll for more…" : "Showing first 300 — use search or filters to narrow the list."}</p>}
        {limit < Math.min(list.length, 300) && <div ref={limit < 300 ? moreRef : undefined} className="h-1 sm:hidden" />}
      </div>
      <div data-bulk-grid className="hidden max-h-[60vh] overflow-auto rounded-lg border border-border sm:block">
        <table className="w-full min-w-[2300px] table-fixed border-collapse text-sm">
          <colgroup>
            <col className="w-12" />
            {COLS.map((c) => <col key={c.k} className={c.w} />)}
            <col className="w-14" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0] shadow-border"><tr className="text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <th className="sticky left-0 z-20 bg-card px-2 py-2"><input type="checkbox" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(list.map((p) => p.id)))} aria-label="Select all" /></th>
            {COLS.map((c, i) => <th key={c.k} style={c.k === "name" ? undefined : tint(i, activeCol === c.k ? 45 : 18)} className={`truncate px-2 py-2 transition-colors ${activeCol === c.k ? "text-foreground" : ""} ${c.k === "name" ? "sticky left-12 z-20 border-r border-border bg-card" : ""}`} title={c.label}>{c.k === "sale_price" || c.k === "wholesale_price" ? <MkHead label={c.label} on={c.k === "sale_price" ? mk.saleOn : mk.wsOn} pct={c.k === "sale_price" ? mk.salePct : mk.wsPct} onOn={(v) => { updMk(c.k === "sale_price" ? { saleOn: v } : { wsOn: v }); setRowMk((m) => Object.fromEntries(Object.entries(m).map(([id, x]) => [id, { ...x, [c.k === "sale_price" ? "sale" : "ws"]: undefined }]))); }} onPct={(v) => updMk(c.k === "sale_price" ? { salePct: v } : { wsPct: v })} disabled={!mk.pctOn} /> : c.label}</th>)}
            <th className="px-2 py-2">Delete</th>
          </tr></thead>
          <tbody onKeyDown={gridKeys} onBlur={() => setActiveCol(null)}>
            {list.slice(0, limit).map((p) => { const r = rowOf(p.id); return (
              <tr key={p.id} className={`border-t border-border ${dirtySet.has(p.id) ? "bg-accent" : ""}`}>
                <td className={`sticky left-0 z-10 px-2 py-1 ${dirtySet.has(p.id) ? "bg-accent" : "bg-card"}`}><input type="checkbox" checked={picked.has(p.id)} onChange={() => setPicked((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })} aria-label={`Select ${p.name}`} /></td>
                {COLS.map((c, i) => (
                  <td key={c.k} onFocus={() => setActiveCol(c.k)} style={c.k === "name" || dirtySet.has(p.id) && activeCol !== c.k ? undefined : tint(i, activeCol === c.k ? 32 : 8)} className={`px-1 py-1 transition-colors ${c.k === "name" ? `sticky left-12 z-10 border-r border-border ${dirtySet.has(p.id) ? "bg-accent" : "bg-card"}` : ""}`}>
                    {c.k === "is_active" ? <select className={`${posInput} h-9 w-full px-1 ${r.is_active !== orig[p.id].is_active ? "border-primary" : ""}`} value={r.is_active} onChange={(e) => set(p.id, "is_active", e.target.value)} aria-label={`Active ${p.name}`}><option value="true">Yes</option><option value="false">No</option></select>
                      : c.k === "category" ? <CatPicker value={r.category} original={orig[p.id].category} options={catOptions} onPick={(v) => set(p.id, "category", v)} label={`Category — ${p.name}`} />
                      : c.k === "sale_price" || c.k === "wholesale_price" ? <div className="flex items-center gap-1"><input type="checkbox" className="size-3.5 shrink-0" disabled={!mk.pctOn} title="Auto % from purchase price (untick for custom rate)" checked={autoOn(p.id, c.k === "sale_price" ? "sale" : "ws")} onChange={() => toggleRowMk(p.id, c.k === "sale_price" ? "sale" : "ws")} aria-label={`Auto ${c.label} ${p.name}`} /><span className="inline-flex shrink-0 items-center text-[11px] text-muted-foreground"><input className={`${posInput} h-9 w-11 px-1 text-right text-[11px]`} disabled={!mk.pctOn} value={rowPct[p.id]?.[c.k === "sale_price" ? "sale" : "ws"] ?? ""} placeholder={c.k === "sale_price" ? mk.salePct : mk.wsPct} inputMode="decimal" title="This product's % over purchase price" onChange={(e) => setRowPct(p.id, c.k === "sale_price" ? "sale" : "ws", e.target.value)} aria-label={`${c.label} percent ${p.name}`} />%</span><input className={`${posInput} h-9 w-full min-w-0 px-2 text-right ${r[c.k] !== orig[p.id][c.k] ? "border-primary" : ""}`} value={r[c.k]} inputMode="decimal" onChange={(e) => set(p.id, c.k, e.target.value)} aria-label={`${c.label} ${p.name}`} /></div>
                      : c.k === "unit" ? <UnitSelect className={`${posInput} h-9 w-full px-1 ${r.unit !== orig[p.id].unit ? "border-primary" : ""}`} value={r.unit} onChange={(v) => set(p.id, "unit", v)} label={`Unit ${p.name}`} /> : <input className={`${posInput} h-9 w-full px-2 ${c.num ? "text-right" : ""} ${c.k !== "stock_value" && r[c.k] !== orig[p.id][c.k] ? "border-primary" : ""}`} value={r[c.k]} inputMode={c.num ? "decimal" : undefined}
                      title={c.k === "stock_value" ? "Changing stock value will auto-calculate the purchase price" : undefined} onChange={(e) => set(p.id, c.k, e.target.value)} aria-label={`${c.label} ${p.name}`} />}
                  </td>
                ))}
                <td className="px-1 py-1 text-center"><Button variant="ghost" size="icon" onClick={() => del([p.id])} aria-label={`Delete ${p.name}`}><Trash2 className="text-destructive" /></Button></td>
              </tr>
            ); })}
          </tbody>
        </table>
        {list.length > limit && <div ref={moreRef} className="py-2 text-center text-xs text-muted-foreground"><Button size="sm" variant="ghost" onClick={() => setLimit((l) => l + 200)}>Show more ({list.length - limit} left)</Button></div>}
      </div>
      <p className="text-xs text-muted-foreground">Changing stock qty records the difference in the stock ledger as "Bulk update". Stock value = stock × purchase price; changing the value auto-derives the purchase price. Total value: {rs(list.reduce((s, p) => s + (Number(rowOf(p.id).stock_value) || 0), 0))}</p>
    </section>
  );
}
