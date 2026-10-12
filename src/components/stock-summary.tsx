import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { FullScreenPopup } from "@/components/fullscreen-popup";
import { Download, FileSpreadsheet, Loader2, Printer, X } from "lucide-react";
import { createPortal } from "react-dom";

type Row = { name: string; unit: string; sku: string | null; barcode: string | null; sale_price: number; purchase_price: number | null; wholesale_price: number | null; stock: number };
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

async function buildPdf(rows: Row[], cols: Col[]) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: cols.length > 6 ? "landscape" : "portrait", unit: "mm", format: "a4" });
  doc.setFontSize(14); doc.text("Stock Summary", 14, 14);
  doc.setFontSize(9); doc.text(new Date().toLocaleString("en-PK"), 14, 20);
  const total = rows.reduce((s, r) => s + n(r.stock) * n(r.purchase_price), 0);
  const hasVal = cols.some((c) => c.key === "value");
  autoTable(doc, {
    startY: 24,
    head: [["#", ...cols.map((c) => c.label)]],
    body: rows.map((r, i) => [i + 1, ...cols.map((c) => (c.num ? money(Number(c.get(r))) : String(c.get(r))))]),
    foot: hasVal ? [["", ...cols.map((c, i) => (c.key === "value" ? money(total) : i === 0 ? "Total" : ""))]] : undefined,
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [30, 41, 59] },
    footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: "bold" },
    columnStyles: Object.fromEntries(cols.map((c, i) => [i + 1, c.num ? { halign: "right" } : {}])),
  });
  return doc;
}

export function StockSummary({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["stock-summary"], enabled: open,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.from("products").select("name,unit,sku,barcode,sale_price,purchase_price,wholesale_price,stock").eq("scope", "pos").eq("is_active", true).order("name").limit(10000);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  const [url, setUrl] = useState("");
  const [ask, setAsk] = useState<null | "print" | "pdf" | "xlsx">(null);
  const [sel, setSel] = useState<string[]>(COLS.map((c) => c.key));

  useEffect(() => {
    if (!open || !rows.length) return;
    let live = true, u = "";
    buildPdf(rows, COLS).then((d) => { if (!live) return; u = URL.createObjectURL(d.output("blob")); setUrl(u); });
    return () => { live = false; if (u) URL.revokeObjectURL(u); };
  }, [open, rows]);

  const total = useMemo(() => rows.reduce((s, r) => s + n(r.stock) * n(r.purchase_price), 0), [rows]);
  const fname = `stock-summary-${new Date().toISOString().slice(0, 10)}`;

  const run = async () => {
    const cols = COLS.filter((c) => sel.includes(c.key));
    const kind = ask; setAsk(null);
    if (kind === "xlsx") {
      const X = await import("xlsx");
      const ws = X.utils.aoa_to_sheet([cols.map((c) => c.label), ...rows.map((r) => cols.map((c) => c.get(r)))]);
      const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, "Stock"); X.writeFile(wb, `${fname}.xlsx`);
      return;
    }
    const doc = await buildPdf(rows, cols);
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
          <Button size="sm" variant="outline" disabled={!rows.length} onClick={() => setAsk("print")}><Printer /> Print</Button>
          <Button size="sm" variant="outline" disabled={!rows.length} onClick={() => setAsk("pdf")}><Download /> Download PDF</Button>
          <Button size="sm" variant="outline" disabled={!rows.length} onClick={() => setAsk("xlsx")}><FileSpreadsheet /> Download Excel</Button>
        </div>
        <div className="min-h-[60vh] flex-1 overflow-hidden rounded-lg border border-border bg-muted">
          {isLoading || (rows.length && !url) ? <div className="grid h-full place-items-center"><Loader2 className="animate-spin" /></div>
            : !rows.length ? <p className="p-6 text-center text-sm text-muted-foreground">No items.</p>
            : <iframe title="Stock summary PDF" src={url} className="h-full min-h-[60vh] w-full border-0" />}
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
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAsk(null)}>Cancel</Button>
              <Button disabled={!sel.length} onClick={run}>{ask === "print" ? "Print" : ask === "pdf" ? "Download PDF" : "Download Excel"}</Button>
            </div>
          </div>
        </div>, document.body)}
    </FullScreenPopup>
  );
}
