/**
 * Labels — har user ka apna label designer + printer profiles.
 * Custom text, font size/position manual adjust, koi bhi barcode format,
 * aur har brand ke barcode printer (TSC 244 Pro, Zebra, Godex, Xprinter…) ke liye size presets.
 */
import { AppShell } from "@/components/app-shell";
import { Barcode } from "@/components/barcode";
import { LabelCanvas, type CanvasSelection } from "@/components/label-canvas";

import { WorkspaceHeader } from "@/components/workspace-header";
import { getProducts, type DbProduct } from "@/lib/products.functions";
import { getMySettings } from "@/lib/settings.functions";
import { getMyLabelSettings, saveMyLabelSettings } from "@/lib/label-settings.functions";
import {
  BARCODE_FORMATS,
  FIELD_VARIABLES,
  PRINTER_PRESETS,
  defaultConfig,
  renderTemplate,
  type LabelConfig,
  type LabelField,
  type LabelValues,
  type PrinterProfile,
  type TextAlign,
} from "@/lib/label-settings";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2,
  Plus,
  Printer,
  QrCode,
  RotateCcw,
  Save,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/labels")({
  head: () => ({
    meta: [
      { title: "Barcode Labels — HB Chemicals OrderBot" },
      {
        name: "description",
        content:
          "Apna label design karein — custom text, font size, position aur printer profile — phir barcode labels print karein.",
      },
      { property: "og:title", content: "Barcode Labels — HB Chemicals OrderBot" },
      {
        property: "og:description",
        content: "Custom barcode labels: apna text, apna font size aur apna printer — foran print.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LabelsPage,
});

type LabelRow = { id: string; name: string; code: string; price: string; pack: string; qty: number };
type Pack = "100" | "250" | "500" | "unit";

const PACKS: Array<{ id: Pack; label: string }> = [
  { id: "100", label: "100 gram" },
  { id: "250", label: "250 gram" },
  { id: "500", label: "500 gram" },
  { id: "unit", label: "1 unit" },
];

function cleanName(name: string) {
  return name
    .replace(/\s*\/\s*(kg|kilogram|g|gm|gram|ml|ltr|litre|liter|pcs|pc|piece|bottle)s?\b/gi, "")
    .trim();
}

function priceFor(p: DbProduct, pack: Pack): number | null {
  if (pack === "100") return p.p100;
  if (pack === "250") return p.p250;
  if (pack === "500") return p.p500;
  return p.sale;
}

function autoCode(name: string, pack: string) {
  const base = cleanName(name).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
  const suffix = pack.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 4);
  return (base || "ITEM") + (suffix ? `-${suffix}` : "");
}

const inputCls =
  "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30";
const smallInput =
  "h-9 w-full rounded-lg border border-input bg-background px-2 text-xs text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/30";

function LabelsPage() {
  const loadProducts = useServerFn(getProducts);
  const loadLabelSettings = useServerFn(getMyLabelSettings);
  const persistLabelSettings = useServerFn(saveMyLabelSettings);

  const [rows, setRows] = useState<LabelRow[]>([]);
  const [term, setTerm] = useState("");
  const [pack, setPack] = useState<Pack>("250");
  const [manual, setManual] = useState({ name: "", code: "", price: "", pack: "", qty: "1" });
  const [config, setConfig] = useState<LabelConfig>(() => defaultConfig());
  const [showDesign, setShowDesign] = useState(false);
  const [selection, setSelection] = useState<CanvasSelection>(null);
  const [zoom, setZoom] = useState(7);


  const settings = useQuery({
    queryKey: ["my-settings"],
    queryFn: () => getMySettings(),
    staleTime: 5 * 60_000,
  });
  const business = settings.data?.workspace.businessName?.trim() || "";
  const currency = settings.data?.workspace.currency?.trim() || "Rs";

  const labelSettings = useQuery({
    queryKey: ["my-label-settings"],
    queryFn: () => loadLabelSettings({}),
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (labelSettings.data?.config) setConfig(labelSettings.data.config);
  }, [labelSettings.data]);

  const save = useMutation({
    mutationFn: () => persistLabelSettings({ data: { config } }),
    onSuccess: (res) => {
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    },
    onError: () => toast.error("Save nahi hua, dobara koshish karein"),
  });

  const products = useQuery({
    queryKey: ["product-picker"],
    queryFn: () => loadProducts({}),
    staleTime: 5 * 60_000,
    retry: 0,
  });

  const results = useMemo(() => {
    const list = products.data?.products ?? [];
    const q = term.trim().toLowerCase();
    return (q ? list.filter((p) => p.name.toLowerCase().includes(q)) : list).slice(0, 25);
  }, [products.data, term]);

  const printer =
    config.printers.find((p) => p.id === config.activePrinterId) ?? config.printers[0] ?? defaultConfig().printers[0]!;

  const addProduct = (p: DbProduct) => {
    const label = PACKS.find((x) => x.id === pack)?.label ?? "";
    const price = priceFor(p, pack);
    const name = cleanName(p.name);
    setRows((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name,
        code: autoCode(name, pack === "unit" ? p.unit || "U" : pack),
        price: price == null ? "" : String(Math.round(price)),
        pack: pack === "unit" ? p.unit || "unit" : label,
        qty: 1,
      },
    ]);
    toast.success(`${name} label list me add ho gaya`);
  };

  const addManual = () => {
    const name = manual.name.trim();
    if (!name && !manual.code.trim()) {
      toast.error("Naam ya code likhein");
      return;
    }
    setRows((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name,
        code: manual.code.trim() || autoCode(name, manual.pack.trim()),
        price: manual.price.trim(),
        pack: manual.pack.trim(),
        qty: Math.max(1, Number(manual.qty.replace(/[^\d]/g, "")) || 1),
      },
    ]);
    setManual({ name: "", code: "", price: "", pack: "", qty: "1" });
  };

  const update = (id: string, patch: Partial<LabelRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

  const printLabels = useMemo(
    () => rows.flatMap((r) => Array.from({ length: r.qty }, (_, i) => ({ ...r, key: `${r.id}-${i}` }))),
    [rows],
  );

  const valuesFor = (r: LabelRow): LabelValues => ({
    business,
    name: r.name,
    price: r.price,
    currency,
    pack: r.pack,
    code: r.code,
    qty: String(r.qty),
    date: new Date().toLocaleDateString("en-GB"),
  });

  /* --------------------------- config mutators --------------------------- */

  const patchPrinter = (patch: Partial<PrinterProfile>) =>
    setConfig((c) => ({
      ...c,
      printers: c.printers.map((p) => (p.id === printer.id ? { ...p, ...patch } : p)),
    }));

  const addPrinter = (presetIndex: number) => {
    const preset = PRINTER_PRESETS[presetIndex]!;
    const id = crypto.randomUUID();
    setConfig((c) => ({ ...c, printers: [...c.printers, { id, ...preset }], activePrinterId: id }));
  };

  const removePrinter = () => {
    if (config.printers.length <= 1) {
      toast.error("Kam se kam ek printer profile rakhna zaroori hai");
      return;
    }
    setConfig((c) => {
      const left = c.printers.filter((p) => p.id !== printer.id);
      return { ...c, printers: left, activePrinterId: left[0]!.id };
    });
  };

  const patchField = (id: string, patch: Partial<LabelField>) =>
    setConfig((c) => ({ ...c, fields: c.fields.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));

  const addField = () => {
    const id = crypto.randomUUID();
    setConfig((c) => ({
      ...c,
      fields: [
        ...c.fields,
        {
          id,
          label: `Custom text ${c.fields.length + 1}`,
          template: "Apna text likhein",
          enabled: true,
          xMm: 1,
          yMm: Math.min(printer.heightMm - 3, 2 + c.fields.length * 3.5),
          widthMm: Math.max(10, printer.widthMm - 2),
          fontPt: 7,
          bold: false,
          uppercase: false,
          align: "center",
        },
      ],
    }));
    return id;
  };


  const removeField = (id: string) =>
    setConfig((c) => ({ ...c, fields: c.fields.filter((f) => f.id !== id) }));

  const selectedField =
    selection?.kind === "field" ? config.fields.find((f) => f.id === selection.id) ?? null : null;


  const previewRow: LabelRow = rows[0] ?? {
    id: "preview",
    name: "Acetanilide",
    code: "ACETANILID-250",
    price: "920",
    pack: "250 gram",
    qty: 1,
  };

  return (
    <AppShell title="Labels" subtitle="Apna label design karein aur print karein" active="/labels">
      <style>{`
        #label-sheet { position: fixed; left: -10000px; top: 0; }
      `}</style>



      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pb-8 pt-3">
        <WorkspaceHeader
          icon={QrCode}
          eyebrow="Labeling"
          title="Barcode Labels"
          description="Apna text, font size aur position khud set karein. Har user ka apna label setup aur printer profile save hota hai."
          meta={[`${printer.widthMm} x ${printer.heightMm} mm`, config.barcode.format, `${printer.dpi} dpi`]}
        />

        {/* printer bar */}
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[200px] flex-1 text-xs font-semibold text-muted-foreground">
              Printer profile
              <select
                value={printer.id}
                onChange={(e) => setConfig((c) => ({ ...c, activePrinterId: e.target.value }))}
                className={`${inputCls} mt-1`}
              >
                {config.printers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.widthMm}x{p.heightMm}mm
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-[200px] flex-1 text-xs font-semibold text-muted-foreground">
              Naya profile (preset se)
              <select
                value=""
                onChange={(e) => e.target.value !== "" && addPrinter(Number(e.target.value))}
                className={`${inputCls} mt-1`}
              >
                <option value="">Preset chunein…</option>
                {PRINTER_PRESETS.map((p, i) => (
                  <option key={p.name} value={i}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setShowDesign((v) => !v)}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted"
            >
              <Settings2 className="size-4" /> {showDesign ? "Design band karein" : "Design edit karein"}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Print dabane par browser ka print dialog khulta hai — wahan apna printer (TSC 244 Pro ya koi bhi
            brand) chunein aur paper size {printer.widthMm}x{printer.heightMm} mm, scale 100%, margins none rakhein.
          </p>
        </section>

        {showDesign ? (
          <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-sm font-bold text-foreground">Label design</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfig(defaultConfig())}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted"
                >
                  <RotateCcw className="size-4" /> Reset
                </button>
                <button
                  type="button"
                  onClick={() => save.mutate()}
                  disabled={save.isPending}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save
                </button>
              </div>
            </div>

            {/* printer size */}
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Labeled title="Profile naam">
                <input
                  className={smallInput}
                  value={printer.name}
                  onChange={(e) => patchPrinter({ name: e.target.value })}
                />
              </Labeled>
              <Labeled title="Width (mm)">
                <NumInput value={printer.widthMm} step={1} onChange={(v) => patchPrinter({ widthMm: v })} />
              </Labeled>
              <Labeled title="Height (mm)">
                <NumInput value={printer.heightMm} step={1} onChange={(v) => patchPrinter({ heightMm: v })} />
              </Labeled>
              <Labeled title="DPI">
                <select
                  className={smallInput}
                  value={printer.dpi}
                  onChange={(e) => patchPrinter({ dpi: Number(e.target.value) as 203 })}
                >
                  <option value={203}>203</option>
                  <option value={300}>300</option>
                  <option value={600}>600</option>
                </select>
              </Labeled>
              <Labeled title="Gap (mm)">
                <NumInput value={printer.gapMm} step={0.5} onChange={(v) => patchPrinter({ gapMm: v })} />
              </Labeled>
              <Labeled title="">
                <button
                  type="button"
                  onClick={removePrinter}
                  className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:bg-muted"
                >
                  <Trash2 className="size-4" /> Profile delete
                </button>
              </Labeled>
            </div>

            {/* WYSIWYG canvas */}
            <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-muted-foreground">
                  Label pe click kar ke element chunein, drag kar ke move karein, corner se resize karein.
                </p>
                <label className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                  Zoom
                  <input
                    type="range"
                    min={3}
                    max={14}
                    step={0.5}
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                  />
                </label>
              </div>

              <div className="flex justify-center overflow-auto">
                <LabelCanvas
                  config={config}
                  printer={printer}
                  values={valuesFor(previewRow)}
                  scale={zoom}
                  selection={selection}
                  onSelect={setSelection}
                  onPatchField={(id, patch) => patchField(id, patch as Partial<LabelField>)}
                  onPatchBarcode={(patch) => setConfig((c) => ({ ...c, barcode: { ...c.barcode, ...patch } }))}
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {config.fields.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelection({ kind: "field", id: f.id })}
                    className={`h-8 rounded-lg border px-2.5 text-[11px] font-semibold transition ${
                      selection?.kind === "field" && selection.id === f.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:bg-muted"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSelection({ kind: "barcode" })}
                  className={`h-8 rounded-lg border px-2.5 text-[11px] font-semibold transition ${
                    selection?.kind === "barcode"
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  Barcode
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const id = addField();
                    setSelection({ kind: "field", id });
                  }}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-dashed border-border px-2.5 text-[11px] font-semibold text-foreground hover:bg-muted"
                >
                  <Plus className="size-3.5" /> Custom text
                </button>
              </div>
            </div>

            {/* selected element inspector */}
            {selectedField ? (
              <div className="rounded-xl border border-border bg-background p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    className={`${smallInput} w-40`}
                    value={selectedField.label}
                    aria-label="Text block naam"
                    onChange={(e) => patchField(selectedField.id, { label: e.target.value })}
                  />
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={selectedField.enabled}
                      onChange={(e) => patchField(selectedField.id, { enabled: e.target.checked })}
                    />
                    Show
                  </label>
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        patchField(selectedField.id, { fontPt: Math.max(3, selectedField.fontPt - 0.5) })
                      }
                      className="inline-flex size-9 items-center justify-center rounded-lg border border-border text-xs font-bold hover:bg-muted"
                      aria-label="Font chhota"
                    >
                      A-
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        patchField(selectedField.id, { fontPt: Math.min(72, selectedField.fontPt + 0.5) })
                      }
                      className="inline-flex size-9 items-center justify-center rounded-lg border border-border text-xs font-bold hover:bg-muted"
                      aria-label="Font bara"
                    >
                      A+
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        removeField(selectedField.id);
                        setSelection(null);
                      }}
                      aria-label="Text hatayein"
                      className="inline-flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>

                <input
                  className={`${inputCls} mt-2`}
                  value={selectedField.template}
                  aria-label="Text"
                  placeholder="Apna text ya {{name}} jaise variables"
                  onChange={(e) => patchField(selectedField.id, { template: e.target.value })}
                />
                <div className="mt-2 flex flex-wrap gap-1">
                  {FIELD_VARIABLES.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() =>
                        patchField(selectedField.id, { template: `${selectedField.template} ${v}`.trim() })
                      }
                      className="rounded-md border border-border px-2 py-1 text-[10px] font-semibold text-muted-foreground hover:bg-muted"
                    >
                      {v}
                    </button>
                  ))}
                </div>

                <div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <Labeled title="Font (pt)">
                    <NumInput
                      value={selectedField.fontPt}
                      step={0.5}
                      onChange={(v) => patchField(selectedField.id, { fontPt: v })}
                    />
                  </Labeled>
                  <Labeled title="X (mm)">
                    <NumInput
                      value={selectedField.xMm}
                      step={0.5}
                      onChange={(v) => patchField(selectedField.id, { xMm: v })}
                    />
                  </Labeled>
                  <Labeled title="Y (mm)">
                    <NumInput
                      value={selectedField.yMm}
                      step={0.5}
                      onChange={(v) => patchField(selectedField.id, { yMm: v })}
                    />
                  </Labeled>
                  <Labeled title="Width (mm)">
                    <NumInput
                      value={selectedField.widthMm}
                      step={0.5}
                      onChange={(v) => patchField(selectedField.id, { widthMm: v })}
                    />
                  </Labeled>
                  <Labeled title="Align">
                    <select
                      className={smallInput}
                      value={selectedField.align}
                      onChange={(e) => patchField(selectedField.id, { align: e.target.value as TextAlign })}
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </Labeled>
                  <Labeled title="Style">
                    <div className="flex h-9 items-center gap-3 text-xs font-semibold text-muted-foreground">
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={selectedField.bold}
                          onChange={(e) => patchField(selectedField.id, { bold: e.target.checked })}
                        />
                        Bold
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={selectedField.uppercase}
                          onChange={(e) => patchField(selectedField.id, { uppercase: e.target.checked })}
                        />
                        CAPS
                      </label>
                    </div>
                  </Labeled>
                </div>
              </div>
            ) : null}

            {selection?.kind === "barcode" ? (
              <div className="rounded-xl border border-border bg-background p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h4 className="font-display text-xs font-bold text-foreground">Barcode</h4>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={config.barcode.enabled}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, barcode: { ...c.barcode, enabled: e.target.checked } }))
                      }
                    />
                    Show
                  </label>
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={config.barcode.showText}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, barcode: { ...c.barcode, showText: e.target.checked } }))
                      }
                    />
                    Code text
                  </label>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
                  <Labeled title="Format">
                    <select
                      className={smallInput}
                      value={config.barcode.format}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, barcode: { ...c.barcode, format: e.target.value as never } }))
                      }
                    >
                      {BARCODE_FORMATS.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </Labeled>
                  <Labeled title="X (mm)">
                    <NumInput
                      value={config.barcode.xMm}
                      step={0.5}
                      onChange={(v) => setConfig((c) => ({ ...c, barcode: { ...c.barcode, xMm: v } }))}
                    />
                  </Labeled>
                  <Labeled title="Y (mm)">
                    <NumInput
                      value={config.barcode.yMm}
                      step={0.5}
                      onChange={(v) => setConfig((c) => ({ ...c, barcode: { ...c.barcode, yMm: v } }))}
                    />
                  </Labeled>
                  <Labeled title="Width (mm)">
                    <NumInput
                      value={config.barcode.widthMm}
                      step={0.5}
                      onChange={(v) => setConfig((c) => ({ ...c, barcode: { ...c.barcode, widthMm: v } }))}
                    />
                  </Labeled>
                  <Labeled title="Height (mm)">
                    <NumInput
                      value={config.barcode.heightMm}
                      step={0.5}
                      onChange={(v) => setConfig((c) => ({ ...c, barcode: { ...c.barcode, heightMm: v } }))}
                    />
                  </Labeled>
                  <Labeled title="Bar width">
                    <NumInput
                      value={config.barcode.moduleWidth}
                      step={0.1}
                      onChange={(v) => setConfig((c) => ({ ...c, barcode: { ...c.barcode, moduleWidth: v } }))}
                    />
                  </Labeled>
                  <Labeled title="Code font (pt)">
                    <NumInput
                      value={config.barcode.textPt}
                      step={0.5}
                      onChange={(v) => setConfig((c) => ({ ...c, barcode: { ...c.barcode, textPt: v } }))}
                    />
                  </Labeled>
                </div>
              </div>
            ) : null}

          </section>
        ) : null}

        {/* item sources */}
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-border bg-card p-4">
            <h3 className="font-display text-sm font-bold text-foreground">Rate list se product</h3>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {PACKS.map((op) => (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => setPack(op.id)}
                  className={`h-8 rounded-lg border px-2.5 text-xs font-semibold transition ${
                    pack === op.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:bg-muted"
                  }`}
                >
                  {op.label}
                </button>
              ))}
            </div>
            <div className="relative mt-3">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Product ka naam likhein"
                aria-label="Product search"
                className={`${inputCls} pl-9`}
              />
              {products.isFetching ? (
                <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              ) : null}
            </div>
            <ul className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
              {results.length === 0 ? (
                <li className="py-3 text-center text-xs text-muted-foreground">
                  {products.isFetching
                    ? "Rate list load ho rahi hai…"
                    : "Koi product nahi mila — neeche manual label bana lein."}
                </li>
              ) : (
                results.map((p) => {
                  const price = priceFor(p, pack);
                  return (
                    <li key={p.name}>
                      <button
                        type="button"
                        onClick={() => addProduct(p)}
                        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-left hover:bg-muted"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-foreground">
                            {cleanName(p.name)}
                          </span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {price == null ? "Is pack ka rate nahi" : `${currency} ${Math.round(price)}`}
                          </span>
                        </span>
                        <Plus className="size-4 shrink-0 text-primary" />
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </section>

          <section className="rounded-2xl border border-border bg-card p-4">
            <h3 className="font-display text-sm font-bold text-foreground">Manual label</h3>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <input
                className={`${inputCls} sm:col-span-2`}
                placeholder="Product naam"
                value={manual.name}
                onChange={(e) => setManual({ ...manual, name: e.target.value })}
              />
              <input
                className={inputCls}
                placeholder="Code (khali = auto)"
                value={manual.code}
                onChange={(e) => setManual({ ...manual, code: e.target.value })}
              />
              <input
                className={inputCls}
                placeholder="Price"
                inputMode="numeric"
                value={manual.price}
                onChange={(e) => setManual({ ...manual, price: e.target.value })}
              />
              <input
                className={inputCls}
                placeholder="Pack (250 gram)"
                value={manual.pack}
                onChange={(e) => setManual({ ...manual, pack: e.target.value })}
              />
              <input
                className={inputCls}
                placeholder="Qty"
                inputMode="numeric"
                value={manual.qty}
                onChange={(e) => setManual({ ...manual, qty: e.target.value })}
              />
            </div>
            <button
              type="button"
              onClick={addManual}
              className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90"
            >
              <Plus className="size-4" /> Label add karein
            </button>
          </section>
        </div>

        <section className="pb-10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-sm font-bold text-foreground">
              Print list · {printLabels.length} label{printLabels.length === 1 ? "" : "s"}
            </h3>
            <div className="flex gap-2">
              {rows.length ? (
                <button
                  type="button"
                  onClick={() => setRows([])}
                  className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted"
                >
                  <Trash2 className="size-4" /> Clear
                </button>
              ) : null}
              <button
                type="button"
                disabled={!printLabels.length}
                onClick={() => window.print()}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                <Printer className="size-4" /> Print
              </button>
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
              Abhi koi label nahi. Upar se product chunein ya manual label add karein.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {rows.map((r) => (
                <li key={r.id} className="rounded-2xl border border-border bg-card p-3">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="grid gap-2 sm:grid-cols-4">
                      <input
                        className={`${inputCls} sm:col-span-2`}
                        value={r.name}
                        aria-label="Naam"
                        onChange={(e) => update(r.id, { name: e.target.value })}
                      />
                      <input
                        className={inputCls}
                        value={r.code}
                        aria-label="Barcode code"
                        onChange={(e) => update(r.id, { code: e.target.value })}
                      />
                      <input
                        className={inputCls}
                        value={r.price}
                        aria-label="Price"
                        inputMode="numeric"
                        onChange={(e) => update(r.id, { price: e.target.value })}
                      />
                      <input
                        className={inputCls}
                        value={r.pack}
                        aria-label="Pack"
                        onChange={(e) => update(r.id, { pack: e.target.value })}
                      />
                      <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                        Qty
                        <input
                          className={`${inputCls} w-20`}
                          value={String(r.qty)}
                          inputMode="numeric"
                          onChange={(e) =>
                            update(r.id, { qty: Math.max(1, Number(e.target.value.replace(/[^\d]/g, "")) || 1) })
                          }
                        />
                      </label>
                    </div>
                    <div className="flex items-start justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => remove(r.id)}
                        aria-label="Label hatayein"
                        className="inline-flex size-10 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex justify-center rounded-xl bg-muted/40 p-3">
                    <LabelCard config={config} printer={printer} values={valuesFor(r)} preview />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <PrintSheet>
          {printLabels.map((r) => (
            <LabelCard key={r.key} config={config} printer={printer} values={valuesFor(r)} />
          ))}
        </PrintSheet>
      </div>

    </AppShell>
  );
}

function PrintSheet({ children }: { children: React.ReactNode }) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const el = document.createElement("div");
    el.id = "label-sheet";
    document.body.appendChild(el);
    setHost(el);
    return () => {
      el.remove();
    };
  }, []);
  if (!host) return null;
  return createPortal(<>{children}</>, host);
}

function Labeled({ title, children }: { title: string; children: React.ReactNode }) {

  return (
    <label className="block text-[11px] font-semibold text-muted-foreground">
      {title ? <span className="mb-1 block">{title}</span> : <span className="mb-1 block">&nbsp;</span>}
      {children}
    </label>
  );
}

function NumInput({
  value,
  step,
  onChange,
}: {
  value: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      step={step}
      value={value}
      className={smallInput}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onChange(n);
      }}
    />
  );
}

function LabelCard({
  config,
  printer,
  values,
  preview,
}: {
  config: LabelConfig;
  printer: PrinterProfile;
  values: LabelValues;
  preview?: boolean;
}) {
  const b = config.barcode;
  return (
    <div
      className={`label-card relative overflow-hidden bg-white text-black ${
        preview ? "rounded-md border border-border shadow-sm" : ""
      }`}
      style={{ width: `${printer.widthMm}mm`, height: `${printer.heightMm}mm` }}
    >
      {config.fields
        .filter((f) => f.enabled)
        .map((f) => {
          const text = renderTemplate(f.template, values);
          if (!text) return null;
          return (
            <div
              key={f.id}
              style={{
                position: "absolute",
                left: `${f.xMm}mm`,
                top: `${f.yMm}mm`,
                width: `${f.widthMm}mm`,
                fontSize: `${f.fontPt}pt`,
                fontWeight: f.bold ? 700 : 400,
                textTransform: f.uppercase ? "uppercase" : "none",
                textAlign: f.align,
                lineHeight: 1.1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {text}
            </div>
          );
        })}

      {b.enabled && values.code.trim() ? (
        <div
          style={{
            position: "absolute",
            left: `${b.xMm}mm`,
            top: `${b.yMm}mm`,
            width: `${b.widthMm}mm`,
            height: `${b.heightMm}mm`,
          }}
        >
          <Barcode
            value={values.code}
            format={b.format}
            height={Math.max(10, b.heightMm * 3.78)}
            moduleWidth={b.moduleWidth}
            displayValue={b.showText}
            fontSize={Math.round(b.textPt * 1.6)}
          />
        </div>
      ) : null}
    </div>
  );
}
