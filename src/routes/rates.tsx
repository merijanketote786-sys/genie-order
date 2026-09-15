import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import priceList from "@/data/price-list.json";
import { getProducts, getSyncStatus, saveProductPrices } from "@/lib/products.functions";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, RotateCcw, Save, Search, SlidersHorizontal, Tag, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/rates")({
  validateSearch: (search: Record<string, unknown>) => ({
    admin: search["admin"] === "1" || search["admin"] === 1 ? "1" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Staff Rate List — HB Chemicals" },
      {
        name: "description",
        content:
          "Item ka naam likhein aur foran sale rate, 100 gram rate aur available quantity dekhein.",
      },
      { property: "og:title", content: "Staff Rate List — HB Chemicals" },
      {
        property: "og:description",
        content: "Item search karein aur rates with quantities foran dekhein.",
      },
    ],
  }),
  component: RatesPage,
});

type Item = {
  name: string;
  unit: string;
  p100: number | null;
  p250?: number | null;
  p500?: number | null;
  sale: number | null;
  stock: number | null;
  customSale?: number | null;
  customP100?: number | null;
  customP250?: number | null;
  customP500?: number | null;
};

const FALLBACK_ITEMS = priceList as Item[];

function cleanName(name: string) {
  return name.replace(/\s*\/(kg|piece|ltr|litre|gram|g)\s*$/i, "").trim();
}

function money(n: number | null) {
  if (n === null || n === 0) return "—";
  return n.toLocaleString("en-PK");
}

function score(item: Item, q: string) {
  const n = cleanName(item.name).toLowerCase();
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.includes(q)) return 2;
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 1 && words.every((w) => n.includes(w))) return 3;
  return -1;
}

function RatesPage() {
  const { admin } = Route.useSearch();
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["products"],
    queryFn: () => getProducts(),
    staleTime: 5 * 60 * 1000,
  });

  const ITEMS = data?.products?.length ? (data.products as Item[]) : FALLBACK_ITEMS;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return ITEMS.map((item) => ({ item, s: score(item, q) }))
      .filter((r) => r.s >= 0)
      .sort((a, b) => a.s - b.s || cleanName(a.item.name).localeCompare(cleanName(b.item.name)))
      .slice(0, 60)
      .map((r) => r.item);
  }, [query, ITEMS]);

  const copyItem = async (item: Item) => {
    const lines = [
      cleanName(item.name),
      item.sale ? `Rate (per ${item.unit || "unit"}): ${money(item.sale)}` : null,
      item.p100 ? `100 gram: ${money(item.p100)}` : null,
      item.p250 ? `250 gram: ${money(item.p250)}` : null,
      item.p500 ? `500 gram: ${money(item.p500)}` : null,
      item.stock !== null ? `Available: ${item.stock} ${item.unit || ""}`.trim() : null,
    ].filter(Boolean);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(item.name);
      toast.success("Copy ho gaya");
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Copy nahi ho saka");
    }
  };

  return (
    <AppShell title="Staff Rate List" subtitle="Item ka naam likho → rate + quantity" active="/rates">
      <div className="sticky top-0 z-10 bg-gradient-to-b from-background via-background/95 to-transparent pb-3 pt-4">
        <div className="glass-panel flex items-center gap-2 rounded-full px-4 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-primary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Item ka naam likhein... (e.g. glycerine)"
            className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            autoComplete="off"
          />
          {query ? (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        {query ? (
          <p className="mt-2 px-2 text-[11px] text-muted-foreground">
            {results.length} item{results.length === 1 ? "" : "s"} mile
          </p>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        {admin === "1" ? <SyncStatusPanel /> : null}
        {!query ? (
          <EmptyState total={ITEMS.length} onPick={setQuery} />
        ) : results.length === 0 ? (
          <div className="glass-panel mx-auto mt-6 w-full max-w-xl rounded-3xl p-6 text-center">
            <h2 className="font-display text-lg font-bold">Koi item nahi mila</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Spelling check karein ya thoda chhota naam likhein (e.g. "glycer").
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {results.map((item) => (
              <li
                key={item.name}
                className="glass-panel rounded-2xl px-4 py-3 transition-colors hover:border-primary/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display text-[15px] font-bold leading-tight text-foreground">
                      {cleanName(item.name)}
                    </p>
                    <span className="mt-1 inline-block rounded-full border border-border/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {item.unit || "unit"}
                    </span>
                  </div>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Copy rate"
                    onClick={() => copyItem(item)}
                    className="shrink-0"
                  >
                    {copied === item.name ? (
                      <Check className="h-4 w-4 text-primary" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Stat label={`Per ${item.unit || "unit"}`} value={money(item.sale)} accent />
                  <Stat label="100 gram" value={money(item.p100)} />
                  <Stat label="250 gram" value={money(item.p250 ?? null)} />
                  <Stat label="500 gram" value={money(item.p500 ?? null)} />
                  <Stat
                    label="Available"
                    value={item.stock === null ? "—" : `${item.stock}`}
                    muted={!item.stock || item.stock <= 0}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}

function Stat({
  label,
  value,
  accent,
  muted,
}: {
  label: string;
  value: string;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface-2/60 px-2.5 py-2 text-center">
      <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </p>
      <p
        className={
          accent
            ? "mt-0.5 font-mono text-sm font-bold text-primary"
            : muted
              ? "mt-0.5 font-mono text-sm text-muted-foreground"
              : "mt-0.5 font-mono text-sm text-foreground"
        }
      >
        {value}
      </p>
    </div>
  );
}

function EmptyState({ total, onPick }: { total: number; onPick: (q: string) => void }) {
  const quick = ["Glycerine", "Cocobetain", "BTMS", "Vitamin E", "Bee wax", "Alpha Arbutin"];
  return (
    <div className="glass-panel mx-auto mt-6 w-full max-w-xl rounded-3xl p-6 text-center">
      <p className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
        Staff only
      </p>
      <h2 className="mt-2 font-display text-xl font-bold text-foreground">
        {total} items ki rate list
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Item ka naam likhein — sale rate, 100 gram rate aur available quantity foran samne aa jayegi.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {quick.map((q) => (
          <button
            key={q}
            onClick={() => onPick(q)}
            className="rounded-full border border-border/70 bg-surface-2/60 px-3 py-1.5 text-xs text-foreground hover:border-primary/50 hover:text-primary"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function SyncStatusPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["sync-status"],
    queryFn: () => getSyncStatus(),
    refetchInterval: 60_000,
  });

  const last = data?.last ?? null;

  return (
    <div className="glass-panel mb-3 rounded-2xl px-4 py-3 text-xs">
      <p className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
        Sync status
      </p>
      {isLoading ? (
        <p className="mt-2 text-muted-foreground">Loading…</p>
      ) : (
        <div className="mt-2 space-y-1 text-muted-foreground">
          <p>
            Products in database: <span className="text-foreground">{data?.productCount ?? 0}</span>
          </p>
          <p>
            Last sync:{" "}
            <span className="text-foreground">
              {last ? new Date(last.synced_at).toLocaleString("en-PK") : "—"}
            </span>
          </p>
          {last ? (
            <>
              <p>
                Updated <span className="text-foreground">{last.updated_count}</span> · Inserted{" "}
                <span className="text-foreground">{last.inserted_count}</span> · Skipped{" "}
                <span className="text-foreground">{last.skipped_count}</span>
              </p>
              <p>
                Status: <span className="text-foreground">{last.status}</span> · Errors:{" "}
                <span className={last.error_count ? "text-destructive" : "text-foreground"}>
                  {last.error_count}
                </span>
              </p>
            </>
          ) : (
            <p>Abhi tak koi sync nahi hua.</p>
          )}
        </div>
      )}
    </div>
  );
}
