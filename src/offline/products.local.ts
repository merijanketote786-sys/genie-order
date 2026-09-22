import type { DbProduct } from "@/lib/products.functions";
import { commit, db, now, type OfflineProduct } from "./store";

type Arg<T> = { data: T } | undefined;
const num = (v: unknown) => (v == null || v === "" ? null : Number(v));

export async function getProducts() {
  const products = db().products.map((r): DbProduct => {
    const customSale = num(r.custom_sale_price);
    const customP100 = num(r.custom_p100_price);
    const customP250 = num(r.custom_p250_price);
    const customP500 = num(r.custom_p500_price);
    return {
      name: r.name,
      unit: r.unit,
      p100: customP100 ?? num(r.p100_staff_price),
      p250: customP250 ?? num(r.p250_staff_price),
      p500: customP500 ?? num(r.p500_staff_price),
      sale: customSale ?? num(r.sale_price),
      stock: num(r.stock),
      customSale,
      customP100,
      customP250,
      customP500,
    };
  });
  return { ok: true, products };
}

type PriceInput = { name: string; sale?: number | null; p100?: number | null; p250?: number | null; p500?: number | null };

function applyPrices(item: PriceInput) {
  const row = db().products.find((p) => p.name === item.name);
  if (!row) return false;
  row.custom_sale_price = item.sale ?? null;
  row.custom_p100_price = item.p100 ?? null;
  row.custom_p250_price = item.p250 ?? null;
  row.custom_p500_price = item.p500 ?? null;
  return true;
}

export async function saveProductPrices(arg: Arg<PriceInput>) {
  const ok = applyPrices(arg!.data);
  commit();
  return ok ? { ok: true, message: "Saved" } : { ok: false, message: "Product nahi mila" };
}

export async function saveProductPricesBulk(arg: Arg<{ items: PriceInput[] }>) {
  let saved = 0;
  let failed = 0;
  for (const item of arg!.data.items) (applyPrices(item) ? saved++ : failed++);
  commit();
  return {
    ok: failed === 0,
    saved,
    failed,
    message: failed === 0 ? `${saved} products save ho gaye` : `${saved} save, ${failed} fail`,
  };
}

type Row = { name: string; unit: string; sale_price: number; stock: number };

function applyRows(rows: Row[], sheetName: string) {
  const d = db();
  let inserted = 0;
  let updated = 0;
  for (const r of rows) {
    const existing = d.products.find((p) => p.name.toLowerCase() === r.name.toLowerCase());
    if (existing) {
      existing.unit = r.unit || existing.unit;
      existing.sale_price = r.sale_price;
      existing.stock = r.stock;
      existing.p100_staff_price = Math.round(r.sale_price / 10) || null;
      existing.p250_staff_price = Math.round(r.sale_price / 4) || null;
      existing.p500_staff_price = Math.round(r.sale_price / 2) || null;
      updated += 1;
    } else {
      const fresh: OfflineProduct = {
        name: r.name,
        unit: r.unit || "kg",
        sale_price: r.sale_price,
        p100_staff_price: Math.round(r.sale_price / 10) || null,
        p250_staff_price: Math.round(r.sale_price / 4) || null,
        p500_staff_price: Math.round(r.sale_price / 2) || null,
        stock: r.stock,
        custom_sale_price: null,
        custom_p100_price: null,
        custom_p250_price: null,
        custom_p500_price: null,
      };
      d.products.push(fresh);
      inserted += 1;
    }
  }
  d.products.sort((a, b) => a.name.localeCompare(b.name));
  d.sync = {
    synced_at: now(),
    total_rows: rows.length,
    updated_count: updated,
    inserted_count: inserted,
    skipped_count: 0,
    error_count: 0,
    status: "success",
  };
  commit();
  return {
    ok: true as const,
    message: `${inserted} naye, ${updated} update (${sheetName})`,
    inserted,
    updated,
    skipped: 0,
    total: rows.length,
    notes: [] as string[],
  };
}

/** Offline me sirf paste-table se rates update hoti hain (tab/comma separated). */
export async function syncProductsFromText(arg: Arg<{ text: string }>) {
  const lines = arg!.data.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: Row[] = [];
  for (const line of lines) {
    const cols = line.split(/\t|,|\s{2,}|\|/).map((c) => c.trim()).filter(Boolean);
    if (cols.length < 2) continue;
    const name = cols[0];
    const price = Number((cols[1] ?? "").replace(/[^\d.]/g, ""));
    if (!name || /item\s*name/i.test(name) || !Number.isFinite(price) || price <= 0) continue;
    const unit = cols[2] && !/^\d+$/.test(cols[2]) ? cols[2] : "kg";
    const stock = Number((cols[3] ?? "0").replace(/[^\d.]/g, "")) || 0;
    rows.push({ name, unit, sale_price: price, stock });
  }
  if (rows.length === 0) return { ok: false as const, message: "Koi rate row nahi mili. Name aur price ka table paste karein." };
  return applyRows(rows, "Paste");
}

export async function applyProductRows(arg: Arg<{ rows: Row[] }>) {
  return applyRows(arg!.data.rows, "Import");
}

export async function syncProductsFromSheet() {
  return {
    ok: false as const,
    message: "Offline app me Excel file sync band hai. Rates paste kar ke update karein.",
  };
}

export async function previewProductsFromDocument() {
  return {
    ok: false as const,
    message: "PDF/tasveer padhne ke liye internet chahiye. Offline me rates paste karein.",
  };
}

export async function getSyncStatus() {
  const d = db();
  return { productCount: d.products.length, last: d.sync };
}

export type { DbProduct };
