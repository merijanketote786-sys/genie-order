import { fillTemplate, parseMessage, tokensOf, type Vars } from "@/lib/template-engine";

export const DEFAULT_INVOICE_TEMPLATE = `*INVOICE*

{{items}}

Product Total: {{product_total}}

Delivery Charges: {{delivery}}

Grand Total: {{grand_total}}`;

export const INVOICE_TEMPLATE_VARIABLES = [
  { label: "Items", token: "{{items}}" },
  { label: "Product Total", token: "{{product_total}}" },
  { label: "Delivery", token: "{{delivery}}" },
  { label: "Grand Total", token: "{{grand_total}}" },
  { label: "Date", token: "{{date}}" },
  { label: "Name", token: "{{name}}" },
  { label: "Phone", token: "{{phone}}" },
  { label: "City", token: "{{city}}" },
  { label: "Address", token: "{{address}}" },
] as const;

export type RateRow = {
  name: string;
  unit: string;
  sale: number | null;
  p100: number | null;
  p250: number | null;
  p500: number | null;
};

const STOP = new Set(["kg", "gram", "grams", "gm", "gms", "g", "ml", "litre", "liter", "ltr", "l", "pcs", "piece", "pieces", "x"]);
const words = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w) && !/^\d+$/.test(w));

function findRate(name: string, rates: RateRow[]): RateRow | null {
  const want = words(name);
  if (!want.length) return null;
  let best: { r: RateRow; score: number } | null = null;
  for (const r of rates) {
    const have = words(r.name);
    if (!have.length) continue;
    const hits = have.filter((w) => want.includes(w)).length;
    if (!hits) continue;
    const score = hits / Math.max(have.length, want.length);
    if (!best || score > best.score) best = { r, score };
  }
  return best && best.score >= 0.5 ? best.r : null;
}

/** Slab rule: ≤100g → 100g rate, ≤250g → 250g, ≤500g → 500g, else per-kg rate. */
export function slabPrice(r: RateRow, grams: number | null): number | null {
  if (grams == null) return r.sale;
  const slabs: [number, number | null][] = [[100, r.p100], [250, r.p250], [500, r.p500], [1000, r.sale]];
  for (const [limit, rate] of slabs) {
    if (grams <= limit && rate != null) return Math.round(rate * (grams / limit));
  }
  return r.sale != null ? Math.round(r.sale * (grams / 1000)) : null;
}

const NON_ITEM = /^(name|naam|phone|mobile|city|address|delivery|shipping|advance|grand|total|product total|payment|cod|status|note|create|invoice)\b/i;

type Item = { name: string; price: number | null };

export function parseItems(text: string, rates: RateRow[]): Item[] {
  const items: Item[] = [];
  for (const raw of text.split(/\n|,(?!\d{3}\b)/)) {
    let line = raw.replace(/^\s*(\d+\s*[).]|[*\-•])\s*/, "").replace(/\.{2,}/g, " ").trim();
    if (!line || NON_ITEM.test(line) || !/[a-z]/i.test(line)) continue;
    let qty = 1;
    const q = line.match(/(?:^|\s)(\d+)\s*(?:x|pcs|pc)\b/i) ?? line.match(/\bx\s*(\d+)\b/i);
    if (q) {
      qty = Number(q[1]);
      line = line.replace(q[0], " ").trim();
    }
    const size = line.match(/(\d+(?:\.\d+)?)\s*(kg|kilo|grams?|gms?|gm|g|ml|ltr|litre|liter|l)\b/i);
    let grams: number | null = null;
    if (size) {
      const n = Number(size[1]);
      grams = /^(kg|kilo|ltr|litre|liter|l)$/i.test(size[2]!) ? n * 1000 : n;
    }
    let price: number | null = null;
    const p = line.match(/(?:rs\.?\s*)?(\d[\d,]*(?:\.\d+)?)\s*(?:rs|\/-)?\s*$/i);
    if (p && !(size && line.trimEnd().endsWith(size[0]))) {
      price = Number(p[1]!.replace(/,/g, ""));
      line = line.slice(0, p.index).trim();
    } else {
      const r = findRate(line, rates);
      price = r ? slabPrice(r, grams) : null;
    }
    if (price != null) price = Math.round(price * qty);
    const label = qty > 1 ? `${line} x${qty}` : line;
    items.push({ name: label.replace(/\s+/g, " "), price });
  }
  return items;
}

const fmt = (n: number) => n.toLocaleString("en-PK");

/** Rule-based invoice generator (no AI). */
export function formatInvoice(text: string, template: string, rates: RateRow[]): { output: string; vars: Vars } {
  const { vars } = parseMessage(text, { extraKeys: tokensOf(template) });
  const items = parseItems(text, rates);
  const lines = items.map((it, i) => {
    const head = `${i + 1}. ${it.name}`;
    const dots = ".".repeat(Math.max(4, 40 - head.length));
    return `${head}${dots} ${it.price != null ? fmt(it.price) : ""}`;
  });
  const total = items.reduce((s, it) => s + (it.price ?? 0), 0);
  const delivery = Number((vars["delivery"] ?? "").replace(/[^\d.]/g, ""));
  vars["items"] = lines.join("\n\n");
  vars["product_total"] = items.length ? fmt(total) : "";
  vars["delivery"] = delivery > 0 ? fmt(delivery) : "";
  vars["grand_total"] = delivery > 0 ? fmt(total + delivery) : "";
  vars["date"] = vars["date"] || new Date().toLocaleDateString("en-GB");
  return { output: fillTemplate(template, vars), vars };
}
