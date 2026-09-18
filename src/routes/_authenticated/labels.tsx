/**
 * Labels — 50x25mm (1 up) barcode labels, TSC 244 Pro pe print karne ke liye.
 * Product rate list se chunein ya manual likhein, qty dein, phir print karein.
 */
import { AppShell } from "@/components/app-shell";
import { Barcode } from "@/components/barcode";
import { WorkspaceHeader } from "@/components/workspace-header";
import { getProducts, type DbProduct } from "@/lib/products.functions";
import { getMySettings } from "@/lib/settings.functions";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Printer, QrCode, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/labels")({
  head: () => ({
    meta: [
      { title: "Barcode Labels — HB Chemicals OrderBot" },
      {
        name: "description",
        content:
          "Product labels banayein aur TSC 244 Pro printer pe 50x25mm barcode labels print karein.",
      },
      { property: "og:title", content: "Barcode Labels — HB Chemicals OrderBot" },
      {
        property: "og:description",
        content: "Rate list se product chunein ya manual likhein aur foran barcode labels print karein.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LabelsPage,
});

type LabelRow = {
  id: string;
  name: string;
  code: string;
  price: string;
  pack: string;
  qty: number;
};

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

/** Product naam se saaf barcode code banata hai (sirf A-Z aur digits). */
function autoCode(name: string, pack: string) {
  const base = cleanName(name)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10);
  const suffix = pack.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 4);
  return (base || "ITEM") + (suffix ? `-${suffix}` : "");
}

function LabelsPage() {
  const loadProducts = useServerFn(getProducts);
  const [rows, setRows] = useState<LabelRow[]>([]);
  const [term, setTerm] = useState("");
  const [pack, setPack] = useState<Pack>("250");
  const [manual, setManual] = useState({ name: "", code: "", price: "", pack: "", qty: "1" });

  const settings = useQuery({
    queryKey: ["my-settings"],
    queryFn: () => getMySettings(),
    staleTime: 5 * 60_000,
  });
  const business = settings.data?.workspace.businessName?.trim() || "HB Chemicals Pakistan";
  const currency = settings.data?.workspace.currency?.trim() || "Rs";

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

  const addProduct = (p: DbProduct) => {
    const label = PACKS.find((x) => x.id === pack)?.label ?? "";
    const price = priceFor(p, pack);
    const name = cleanName(p.name);
    setRows((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name,
        code: autoCode(name, pack === "unit" ? (p.unit || "U") : pack),
        price: price == null ? "" : String(Math.round(price)),
        pack: pack === "unit" ? p.unit || "unit" : label,
        qty: 1,
      },
    ]);
    toast.success(`${name} label list me add ho gaya`);
  };

  const addManual = () => {
    const name = manual.name.trim();
    if (!name) {
      toast.error("Product ka naam likhein");
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

  const inputCls =
    "h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30";

  return (
    <AppShell title="Labels" subtitle="Barcode labels banayein aur print karein" active="/labels">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #label-sheet, #label-sheet * { visibility: visible !important; }
          #label-sheet { position: absolute; inset: 0; display: block !important; }
          @page { size: 50mm 25mm; margin: 0; }
          .label-card { page-break-after: always; break-after: page; }
          .label-card:last-child { page-break-after: auto; break-after: auto; }
        }
      `}</style>

      <WorkspaceHeader
        icon={QrCode}
        eyebrow="Labeling"
        title="Barcode Labels"
        description="Rate list se product chunein ya manual likhein, qty dein aur TSC 244 Pro pe 50x25mm labels print karein."
        meta={["50 x 25 mm", "Code 128", "1 up"]}
      />

      <div className="grid gap-4 pb-8 pt-4 lg:grid-cols-2">
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
                {products.isFetching ? "Rate list load ho rahi hai…" : "Koi product nahi mila."}
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
                        <span className="block truncate text-sm font-semibold text-foreground">{cleanName(p.name)}</span>
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
                  <LabelCard business={business} currency={currency} row={r} preview />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div id="label-sheet" className="hidden">
        {printLabels.map((r) => (
          <LabelCard key={r.key} business={business} currency={currency} row={r} />
        ))}
      </div>
    </AppShell>
  );
}

function LabelCard({
  business,
  currency,
  row,
  preview,
}: {
  business: string;
  currency: string;
  row: LabelRow;
  preview?: boolean;
}) {
  return (
    <div
      className={`label-card flex flex-col items-center justify-between overflow-hidden bg-white px-[1.5mm] py-[1mm] text-black ${
        preview ? "rounded-md border border-border shadow-sm" : ""
      }`}
      style={{ width: "50mm", height: "25mm" }}
    >
      <p className="w-full truncate text-center text-[6.5pt] font-bold uppercase leading-tight">{business}</p>
      <p className="w-full truncate text-center text-[8pt] font-bold leading-tight">{row.name}</p>
      <p className="w-full truncate text-center text-[7pt] leading-tight">
        {row.price ? `${currency} ${row.price}` : ""}
        {row.price && row.pack ? " / " : ""}
        {row.pack}
      </p>
      <Barcode value={row.code} height={26} className="h-[7mm] w-[40mm]" />
      <p className="w-full truncate text-center text-[6pt] leading-tight tracking-wide">{row.code}</p>
    </div>
  );
}
