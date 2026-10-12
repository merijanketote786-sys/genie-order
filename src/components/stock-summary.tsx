import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FullScreenPopup } from "@/components/fullscreen-popup";
import { Download, FileSpreadsheet, Loader2, Printer, X } from "lucide-react";
import { createPortal } from "react-dom";

type Row = { name: string; unit: string; sku: string | null; barcode: string | null; sale_price: number; purchase_price: number | null; wholesale_price: number | null; stock: number; is_active: boolean; min_stock: number | null };
type Col = { key: string; label: string; num?: boolean; get: (r: Row) => string | number };

const n = (v: number | null | undefined) => Number(v ?? 0);
const money = (v: number) => v.toLocaleString("en-PK", { maximumFractionDigits: 2 });
const COLS: Col[] = [
  { key: "name", label: "Item name", get: (r) => r.name },
  { key: "unit", label: "Unit", get: (r) => r.unit },
  { key: "sku", label: "Item code", get: (r) => r.sku ?? "" },
  { key: "barcode", label: "Barcode", get: (r) => r.barcode ?? "" },
  { key: "sale", label: "Sale price", num: true, get: (r) => n(r.sale_price) },
  { key: "purchase", label: "Purchase price", num: true, get: (r) => n(r.purchase_price) },
  { key: "wholesale", label: "Wholesale price", num: true, get: (r) => n(r.wholesale_price) },
  { key: "stock", label: "Stock qty", num: true, get: (r) => n(r.stock) },
  { key: "value", label: "Stock value", num: true, get: (r) => n(r.stock) * n(r.purchase_price) },
];

const FILTERS = [
  { key: "active", label: "Active products", test: (r: Row) => r.is_active },
  { key: "inactive", label: "Inactive products", test: (r: Row) => !r.is_active },
  { key: "low", label: "Low stock items", test: (r: Row) => r.is_active && n(r.stock) > 0 && n(r.min_stock) > 0 && n(r.stock) <= n(r.min_stock) },
  { key: "out", label: "Out of stock items", test: (r: Row) => r.is_active && n(r.stock) <= 0 },
] as const;

type Biz = { name: string; address: string; phone: string; email: string; website: string; taxId: string };
type Size = "a4" | "a5";
const bizLines = (b: Biz) => [b.address, b.phone && `Ph: ${b.phone}`, b.email, b.website, b.taxId && `NTN/GST: ${b.taxId}`].filter(Boolean) as string[];

async function buildPdf(rows: Row[], cols: Col[], biz: Biz, size: Size) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: size });
  const W = doc.internal.pageSize.getWidth(), m = size === "a5" ? 8 : 12;
  let y = m + 4;
  doc.setFont("helvetica", "bold"); doc.setFontSize(size === "a5" ? 13 : 16); doc.text(biz.name || "HB Chemicals Pakistan", W / 2, y, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(size === "a5" ? 7.5 : 9);
  for (const l of bizLines(biz)) { y += 4.5; doc.text(l, W / 2, y, { align: "center" }); }
  y += 3; doc.setDrawColor(150); doc.line(m, y, W - m, y);
  y += 6; doc.setFont("helvetica", "bold"); doc.setFontSize(size === "a5" ? 10 : 12); doc.text("Stock Summary", m, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text(`${new Date().toLocaleString("en-PK")} · ${rows.length} items`, W - m, y, { align: "right" });
  const total = rows.reduce((s, r) => s + n(r.stock) * n(r.purchase_price), 0);
  const pageTotals: Record<number, number> = {};
  let lastRowBottom = 0, lastRowPage = 1;
  autoTable(doc, {
    startY: y + 3, margin: { left: m, right: m, top: m, bottom: m + 8 }, showHead: "everyPage", showFoot: "never",
    didDrawCell: (d) => {
      if (d.section === "body" && d.column.index === 0) { const r = rows[d.row.index]; if (r) pageTotals[d.pageNumber] = (pageTotals[d.pageNumber] ?? 0) + n(r.stock) * n(r.purchase_price); }
      if (d.section === "body" && d.row.index === rows.length - 1) { lastRowBottom = d.cell.y + d.cell.h; lastRowPage = d.pageNumber; }
    },
    didDrawPage: (d) => {
      const pg = d.pageNumber, H = doc.internal.pageSize.getHeight();
      doc.setFontSize(7);
      doc.text(`Page ${pg}`, W / 2, H - m / 2, { align: "center" });
      doc.setFont("helvetica", "bold");
      doc.text(`Page total: Rs ${money(pageTotals[pg] ?? 0)}`, W - m, H - m / 2, { align: "right" });
      doc.setFont("helvetica", "normal");
    },
    head: [["#", ...cols.map((c) => c.label)]],
    body: rows.map((r, i) => [i + 1, ...cols.map((c) => (c.num ? money(Number(c.get(r))) : String(c.get(r))))]),
    styles: { fontSize: size === "a5" ? (cols.length > 6 ? 5.5 : 6.5) : (cols.length > 6 ? 7 : 8), cellPadding: size === "a5" ? 1 : 1.5, overflow: "linebreak" },
    headStyles: { fillColor: [30, 41, 59] },
    columnStyles: Object.fromEntries(cols.map((c, i) => [i + 1, c.num ? { halign: "right" } : {}])),
  });
  const qtyTotal = rows.reduce((s, r) => s + n(r.stock), 0);
  doc.setPage(doc.getNumberOfPages());
  doc.setFont("helvetica", "bold"); doc.setFontSize(7);
  doc.text(`Grand total: ${rows.length} items · Stock qty ${money(qtyTotal)} · Stock value Rs ${money(total)}`, m, doc.internal.pageSize.getHeight() - m / 2, { align: "left" });
  return doc;
}

export function StockSummary({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["stock-summary"], enabled: open,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.from("products").select("name,unit,sku,barcode,sale_price,purchase_price,wholesale_price,stock,is_active,min_stock").eq("scope", "pos").order("name").limit(10000);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const { data: biz } = useQuery({
    queryKey: ["stock-summary-biz"], enabled: open,
    queryFn: async (): Promise<Biz> => {
      const { data } = await supabase.from("pos_settings").select("config").maybeSingle();
      const c = (data?.config ?? {}) as { business?: Partial<Biz>; receiptBusiness?: string };
      const b = c.business ?? {};
      return { name: b.name || c.receiptBusiness || "", address: b.address ?? "", phone: b.phone ?? "", email: b.email ?? "", website: b.website ?? "", taxId: b.taxId ?? "" };
    },
  });
  const [size, setSize] = useState<Size>("a4");
  const [pages, setPages] = useState<string[]>([]);
  const [url, setUrl] = useState("");
  const [ask, setAsk] = useState<null | "print" | "pdf" | "xlsx">(null);
  const [sel, setSel] = useState<string[]>(COLS.map((c) => c.key));
  const [statusSel, setStatusSel] = useState<string[]>(["active"]);

  const filteredRows = useMemo(() => rows.filter((r) => FILTERS.some((f) => statusSel.includes(f.key) && f.test(r))), [rows, statusSel]);

  useEffect(() => {
    if (!open || !filteredRows.length || !biz) return;
    let live = true;
    setUrl(""); setPages([]);
    (async () => {
      const d = await buildPdf(filteredRows, COLS, biz, size);
      const buf = d.output("arraybuffer");
      const pdfjs = await import("pdfjs-dist");
      const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
      pdfjs.GlobalWorkerOptions.workerSrc = worker;
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
      const out: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const pg = await pdf.getPage(i); const vp = pg.getViewport({ scale: 2 });
        const cv = document.createElement("canvas"); cv.width = vp.width; cv.height = vp.height;
        await pg.render({ canvasContext: cv.getContext("2d")!, viewport: vp, canvas: cv }).promise;
        out.push(cv.toDataURL("image/jpeg", 0.85));
      }
      if (live) { setPages(out); setUrl("ok"); }
    })().catch((e) => { console.error("Stock Summary preview failed:", e); if (live) setUrl("ok"); });
    return () => { live = false; };
  }, [open, filteredRows, biz, size]);

  const total = useMemo(() => rows.reduce((s, r) => s + n(r.stock) * n(r.purchase_price), 0), [rows]);
  const fname = `stock-summary-${new Date().toISOString().slice(0, 10)}`;

  const run = async () => {
    const cols = COLS.filter((c) => sel.includes(c.key));
    const kind = ask; setAsk(null);
    if (kind === "xlsx") {
      const X = await import("xlsx");
      const ws = X.utils.aoa_to_sheet([cols.map((c) => c.label), ...filteredRows.map((r) => cols.map((c) => c.get(r)))]);
      const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, "Stock"); X.writeFile(wb, `${fname}.xlsx`);
      return;
    }
    const doc = await buildPdf(filteredRows, cols, biz ?? { name: "", address: "", phone: "", email: "", website: "", taxId: "" }, size);
    if (kind === "pdf") { doc.save(`${fname}.pdf`); return; }
    doc.autoPrint();
    const w = window.open(URL.createObjectURL(doc.output("blob")));
    if (!w) doc.save(`${fname}.pdf`);
  };

  return (
    <FullScreenPopup open={open} title="Stock Summary" onClose={onClose}>
      <div className="flex h-full flex-col gap-2 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-auto text-sm text-muted-foreground">{rows.length} items · Stock value <b className="text-foreground">Rs {money(total)}</b></p>
          <div className="flex overflow-hidden rounded-md border border-border">{(["a4", "a5"] as const).map((k) => <button key={k} type="button" onClick={() => setSize(k)} className={`px-3 py-1 text-xs font-semibold ${size === k ? "bg-primary text-primary-foreground" : "bg-card text-foreground"}`}>{k.toUpperCase()}</button>)}</div>
          <Button size="sm" variant="outline" disabled={!rows.length} onClick={() => setAsk("print")}><Printer /> Print</Button>
          <Button size="sm" variant="outline" disabled={!rows.length} onClick={() => setAsk("pdf")}><Download /> Download PDF</Button>
          <Button size="sm" variant="outline" disabled={!rows.length} onClick={() => setAsk("xlsx")}><FileSpreadsheet /> Download Excel</Button>
        </div>
        <div className="min-h-[60vh] flex-1 overflow-auto rounded-lg border border-border bg-muted p-2 sm:p-4">
          {isLoading || (filteredRows.length && !url) ? <div className="grid h-full place-items-center"><Loader2 className="animate-spin" /></div>
            : !filteredRows.length ? <p className="p-6 text-center text-sm text-muted-foreground">No items.</p>
            : <div className="mx-auto flex flex-col items-center gap-4">{pages.map((src, i) => <div key={i} className="w-full" style={{ maxWidth: size === "a4" ? 794 : 560 }}><img src={src} alt={`Page ${i + 1}`} className="w-full bg-card shadow-lg" /><p className="mt-1 text-center text-xs text-muted-foreground">Page {i + 1} of {pages.length}</p></div>)}{!pages.length && <p className="p-6 text-sm text-muted-foreground">Preview unavailable — use Download PDF.</p>}</div>}
        </div>
      </div>
      {ask && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[60] grid place-items-center bg-foreground/50 p-3" role="dialog" aria-modal="true" aria-label="Choose fields">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between"><p className="font-bold text-foreground">Choose fields</p><Button size="icon" variant="ghost" onClick={() => setAsk(null)} aria-label="Close"><X /></Button></div>
            <label className="mb-2 flex items-center gap-2 border-b border-border pb-2 text-sm font-semibold"><input type="checkbox" checked={sel.length === COLS.length} onChange={(e) => setSel(e.target.checked ? COLS.map((c) => c.key) : [])} /> Select all</label>
            <div className="grid grid-cols-2 gap-2">
              {COLS.map((c) => <label key={c.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={sel.includes(c.key)} onChange={(e) => setSel((s) => e.target.checked ? COLS.filter((x) => s.includes(x.key) || x.key === c.key).map((x) => x.key) : s.filter((k) => k !== c.key))} />{c.label}</label>)}
            </div>
            <p className="mt-3 border-t border-border pt-2 text-sm font-semibold text-foreground">Which items?</p>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {FILTERS.map((f) => <label key={f.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={statusSel.includes(f.key)} onChange={(e) => setStatusSel((s) => e.target.checked ? [...s, f.key] : s.filter((k) => k !== f.key))} />{f.label}</label>)}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{filteredRows.length} items selected</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAsk(null)}>Cancel</Button>
              <Button disabled={!sel.length || !filteredRows.length} onClick={run}>{ask === "print" ? "Print" : ask === "pdf" ? "Download PDF" : "Download Excel"}</Button>
            </div>
          </div>
        </div>, document.body)}
    </FullScreenPopup>
  );
}
