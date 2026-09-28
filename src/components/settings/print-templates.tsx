import { Button } from "@/components/ui/button";
import { INVOICE_FONTS, INVOICE_TEXT_FIELDS, type InvoiceFont, type InvoiceTextField, type PaperFormat, type PosConfig, type TemplateId } from "@/lib/pos-config";
import { Check, Save } from "lucide-react";

type Upd = (path: string, v: unknown) => void;
type Tpl = {
  id: string; name: string; printer: string; size: string; orientation: "Portrait" | "Landscape" | "Roll";
  format: PaperFormat; design: TemplateId; w: number; h: number; apply: Record<string, unknown>;
};

const A4 = (m: number, font: number, head: number) => ({
  "printing.layout.marginTop": m, "printing.layout.marginBottom": m, "printing.layout.marginLeft": m, "printing.layout.marginRight": m,
  "printing.layout.fontPt": font, "printing.layout.tableFontPt": font - 0.5, "printing.layout.headerPt": head,
});
const A5 = (o: "portrait" | "landscape", m: number, font: number) => ({ "printing.a5.orientation": o, "printing.a5.marginMm": m, "printing.a5.fontPt": font });
const TH = (font: number, extra: Record<string, unknown> = {}) => ({ "printing.thermal.fontPt": font, "printing.thermal.marginMm": 2, ...extra });
const CU = (w: number, h: number | null, m: number, font: number) => ({ "printing.custom.widthMm": w, "printing.custom.heightMm": h, ...A4(m, font, font + 6) });

export const PRINT_TEMPLATES: Tpl[] = [
  { id: "a4-modern", name: "A4 Modern", printer: "Laser / Inkjet", size: "A4", orientation: "Portrait", format: "a4", design: "modern", w: 210, h: 297, apply: A4(12, 10, 18) },
  { id: "a4-classic", name: "A4 Classic", printer: "Laser / Inkjet", size: "A4", orientation: "Portrait", format: "a4", design: "classic", w: 210, h: 297, apply: A4(15, 10.5, 20) },
  { id: "a4-compact", name: "A4 Compact (many items)", printer: "Laser / Inkjet", size: "A4", orientation: "Portrait", format: "a4", design: "compact", w: 210, h: 297, apply: A4(8, 8.5, 15) },
  { id: "a4-minimal", name: "A4 Minimal", printer: "Laser / Inkjet", size: "A4", orientation: "Portrait", format: "a4", design: "minimal", w: 210, h: 297, apply: A4(12, 10, 16) },
  { id: "a4-land", name: "A4 Landscape (wide table)", printer: "Laser / Inkjet", size: "297 × 210 mm", orientation: "Landscape", format: "custom", design: "modern", w: 297, h: 210, apply: CU(297, 210, 10, 10) },
  { id: "letter", name: "Letter", printer: "Laser / Inkjet", size: "8.5 × 11 in", orientation: "Portrait", format: "custom", design: "classic", w: 216, h: 279, apply: CU(216, 279, 12, 10) },
  { id: "a5-modern", name: "A5 Modern", printer: "Laser / Inkjet (half page)", size: "A5", orientation: "Portrait", format: "a5", design: "modern", w: 148, h: 210, apply: A5("portrait", 7, 8.5) },
  { id: "a5-compact", name: "A5 Compact", printer: "Laser / Inkjet (half page)", size: "A5", orientation: "Portrait", format: "a5", design: "compact", w: 148, h: 210, apply: A5("portrait", 5, 7.5) },
  { id: "a5-land-classic", name: "A5 Landscape Classic", printer: "Laser / Dot matrix", size: "A5", orientation: "Landscape", format: "a5", design: "classic", w: 210, h: 148, apply: A5("landscape", 7, 8.5) },
  { id: "a5-land-retail", name: "A5 Landscape Retail", printer: "Laser / Dot matrix", size: "A5", orientation: "Landscape", format: "a5", design: "retail", w: 210, h: 148, apply: A5("landscape", 6, 8) },
  { id: "t80-std", name: "Thermal 80mm Standard", printer: "Thermal receipt (80mm)", size: "80 mm roll", orientation: "Roll", format: "t80", design: "thermal", w: 80, h: 150, apply: TH(8.5, { "printing.thermal.showBarcode": false, "printing.thermal.showQr": false, "printing.thermal.showQtyRate": true }) },
  { id: "t80-full", name: "Thermal 80mm Detailed (barcode + QR)", printer: "Thermal receipt (80mm)", size: "80 mm roll", orientation: "Roll", format: "t80", design: "thermal", w: 80, h: 170, apply: TH(9, { "printing.thermal.showBarcode": true, "printing.thermal.showQr": true, "printing.thermal.showQtyRate": true }) },
  { id: "t58-std", name: "Thermal 58mm Standard", printer: "Thermal receipt (58mm)", size: "58 mm roll", orientation: "Roll", format: "t58", design: "thermal", w: 58, h: 140, apply: TH(8, { "printing.thermal.showBarcode": false, "printing.thermal.showQr": false, "printing.thermal.showQtyRate": true }) },
  { id: "t58-compact", name: "Thermal 58mm Compact", printer: "Thermal receipt (58mm)", size: "58 mm roll", orientation: "Roll", format: "t58", design: "thermal", w: 58, h: 120, apply: TH(7, { "printing.thermal.showBarcode": false, "printing.thermal.showQr": false, "printing.thermal.showQtyRate": false }) },
];

const DOCS = ["pos", "sale", "quotation", "return", "purchase", "purchase_return", "receipt"] as const;

export function PrintTemplatesPicker({ draft, upd, disabled, dirty = false, saving = false, onSave }: { draft: PosConfig; upd: Upd; disabled: boolean; dirty?: boolean; saving?: boolean; onSave?: () => void }) {
  const current = draft.printing?.preset;
  const chosen = PRINT_TEMPLATES.find((t) => t.id === current);
  const choose = (t: Tpl) => {
    for (const [k, v] of Object.entries(t.apply)) upd(k, v);
    upd(`printing.templates.${t.format}`, t.design);
    for (const d of DOCS) upd(`printing.defaults.${d}`, t.format);
    upd("printing.preset", t.id);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Pick one template that matches your printer, then press <b className="text-foreground">Save</b>. Every bill, return, purchase and receipt will print in this size.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {PRINT_TEMPLATES.map((t) => {
          const on = current === t.id;
          const s = 64 / Math.max(t.w, t.h);
          return (
            <button key={t.id} type="button" disabled={disabled} onClick={() => choose(t)}
              className={`relative flex gap-3 rounded-xl border p-3 text-left transition disabled:opacity-60 ${on ? "border-primary bg-primary/5 ring-2 ring-primary" : "border-border bg-background hover:border-primary/60"}`}>
              <div className="grid size-16 shrink-0 place-items-center">
                <div className="flex flex-col gap-0.5 rounded-sm border border-foreground/40 bg-card p-1" style={{ width: t.w * s, height: t.h * s }}>
                  <div className="h-1 w-2/3 rounded bg-foreground/50" />
                  <div className="h-0.5 w-full rounded bg-foreground/20" />
                  <div className="h-0.5 w-full rounded bg-foreground/20" />
                  <div className="h-0.5 w-4/5 rounded bg-foreground/20" />
                </div>
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.printer}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{t.size} · {t.orientation}</p>
              </div>
              {on ? <Check className="absolute right-2 top-2 size-4 text-primary" /> : null}
            </button>
          );
        })}
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-foreground">Invoice typography</h3>
        <label className="block max-w-xs text-xs font-medium text-muted-foreground">Font style — entire invoice
          <select className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground" disabled={disabled}
            value={draft.printing?.fontFamily ?? "default"} onChange={(e) => upd("printing.fontFamily", e.target.value as InvoiceFont)}>
            {(Object.entries(INVOICE_FONTS) as [InvoiceFont, string][]).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Font size for each invoice field (pt) · leave blank to use template size</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {(Object.entries(INVOICE_TEXT_FIELDS) as [InvoiceTextField, string][]).map(([key, label]) => (
              <label key={key} className="flex min-w-0 items-center justify-between gap-2 text-xs text-foreground">
                <span className="min-w-0">{label}</span>
                <input className="h-9 w-20 shrink-0 rounded-md border border-border bg-background px-2 text-sm text-foreground" type="number" inputMode="decimal"
                  min={5} max={36} step={0.5} disabled={disabled} value={draft.printing?.fontSizes?.[key] ?? ""} placeholder="Auto"
                  aria-label={`${label} font size (pt)`}
                  onChange={(e) => {
                    const raw = e.target.value;
                    upd(`printing.fontSizes.${key}`, raw === "" ? undefined : Number.isFinite(Number(raw)) ? Math.min(36, Math.max(0, Number(raw))) : undefined);
                  }}
                  onBlur={(e) => {
                    if (e.target.value !== "") upd(`printing.fontSizes.${key}`, Math.min(36, Math.max(5, Number(e.target.value) || 5)));
                  }} />
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3">

        <div className="mr-auto min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {chosen ? `Selected template: ${chosen.name}` : "No template selected yet"}
          </p>
          <p className="text-xs text-muted-foreground">
            {disabled
              ? "You can view templates; only Admin can save them."
              : dirty
                ? "Changes are not saved yet — press Save template to apply them."
                : chosen
                  ? "Saved and active on every device."
                  : "Pick a template above, then press Save template."}
          </p>
        </div>
        <Button size="sm" disabled={disabled || saving || !dirty || !onSave} onClick={() => onSave?.()}>
          {dirty ? <Save /> : <Check />}
          {saving ? "Saving…" : dirty ? "Save template" : "Saved"}
        </Button>
      </div>
    </div>
  );
}

