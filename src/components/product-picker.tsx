/**
 * Compact product picker — used inside an icon popup on the Invoice/Order pages.
 * Search for a product from the rate list, choose pack size + qty, and insert the line.
 */
import { getProducts, type DbProduct } from "@/lib/products.functions";
import { createPosProduct } from "@/lib/inventory.functions";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, CornerDownLeft, Loader2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type Pack = "100" | "250" | "500" | "unit";

const PACKS: Array<{ id: Pack; label: string }> = [
  { id: "100", label: "100g/ml" },
  { id: "250", label: "250g/ml" },
  { id: "500", label: "500g/ml" },
  { id: "unit", label: "1 unit" },
];

function priceFor(p: DbProduct, pack: Pack): number | null {
  if (pack === "100") return p.p100;
  if (pack === "250") return p.p250;
  if (pack === "500") return p.p500;
  return p.sale;
}


/** Removes the unit suffix (/kg, /gram...) from the end of the name. */
function cleanName(name: string): string {
  return name
    .replace(/\s*\/\s*(kg|kilogram|g|gm|gram|gramme|ml|ltr|litre|liter|pcs|pc|piece|bottle|bundle)s?\b/gi, "")
    .trim();
}

function packLabel(p: DbProduct, pack: Pack): string {
  if (pack === "100") return "100gram";
  if (pack === "250") return "250gram";
  if (pack === "500") return "500gram";
  return p.unit || "unit";
}

export function productLine(p: DbProduct, pack: Pack, qty: number): string {
  const unitPrice = priceFor(p, pack);
  const base =
    unitPrice == null
      ? cleanName(p.name)
      : `${cleanName(p.name)} ${Math.round(unitPrice)}/${packLabel(p, pack)}`;
  return qty > 1 ? `${qty} × ${base}` : base;
}

export function ProductPickerBody({
  onUse,
  useLabel = "Add",
}: {
  onUse?: (line: string, product: DbProduct) => void;
  useLabel?: string;
}) {
  const load = useServerFn(getProducts);
  const createProduct = useServerFn(createPosProduct);
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingNew, setPendingNew] = useState<string | null>(null);
  const [savingNew, setSavingNew] = useState(false);
  const [pack, setPack] = useState<Pack>("250");
  const [qty, setQty] = useState("1");

  const { data, isFetching } = useQuery({
    queryKey: ["product-picker"],
    queryFn: () => load({}),
    staleTime: 5 * 60_000,
    retry: 0,
  });

  const products = data?.products ?? [];
  const results = useMemo(() => {
    const q = term.trim().toLowerCase();
    const list = q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products;
    return list.slice(0, 30);
  }, [products, term]);

  const qtyNum = Math.max(1, Number(qty.replace(/[^\d]/g, "")) || 1);

  const copy = async (line: string) => {
    try {
      await navigator.clipboard.writeText(line);
      toast.success("Product line copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Enter product name"
          aria-label="Product search"
          className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-9 text-sm text-foreground outline-none transition focus:border-ring focus:ring-2 focus:ring-ring/30"
        />
        {isFetching ? (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {results.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted-foreground">
          {isFetching ? "Loading rate list…" : "No product found."}
        </p>
      ) : (
        <ul className="max-h-64 space-y-1.5 overflow-y-auto">
          {results.map((p) => {
            const active = selected === p.name;
            const line = productLine(p, pack, qtyNum);
            const unitPrice = priceFor(p, pack);
            return (
              <li key={p.name}>
                <div
                  className={`rounded-xl border px-3 py-2 transition ${active ? "border-primary bg-accent/40" : "border-border bg-background"}`}
                >
                  <button
                    type="button"
                    onClick={() => setSelected(active ? null : p.name)}
                    className="w-full text-left"
                  >
                    <p className="truncate text-sm font-semibold text-foreground">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.sale != null ? `1 ${p.unit} = ${p.sale}` : `unit: ${p.unit}`}
                      {p.p250 != null ? ` · 250 = ${p.p250}` : ""}
                      {p.p500 != null ? ` · 500 = ${p.p500}` : ""}
                    </p>
                  </button>

                  {active ? (
                    <div className="mt-2 space-y-2">
                      <div className="flex flex-wrap gap-1.5">
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
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-semibold text-muted-foreground" htmlFor="pp-qty">
                          Qty
                        </label>
                        <input
                          id="pp-qty"
                          value={qty}
                          onChange={(e) => setQty(e.target.value)}
                          inputMode="numeric"
                          className="h-9 w-20 rounded-lg border border-input bg-background px-2 text-sm outline-none focus:border-ring"
                        />
                        <span className="truncate text-xs text-muted-foreground">
                          {unitPrice == null ? "No rate for this pack" : line}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => copy(line)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted"
                        >
                          <Copy className="size-3.5" /> Copy
                        </button>
                        {onUse ? (
                          <button
                            type="button"
                            onClick={() => onUse(line, p)}
                            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground hover:opacity-90"
                          >
                            <CornerDownLeft className="size-3.5" /> {useLabel}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
