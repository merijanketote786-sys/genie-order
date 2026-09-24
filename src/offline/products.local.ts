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
  return ok ? { ok: true, message: "Saved" } : { ok: false, message: "Product not found" };
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
    message: failed === 0 ? `${saved} products saved` : `${saved} saved, ${failed} failed`,
  };
}

type Row = { name: string; unit: string; sale_price: number; stock: number };

const NAME_KEYS = ["item name", "product name", "name", "item", "product", "description"];
const PRICE_KEYS = ["sale price", "sales price", "selling price", "sale rate", "rate", "price", "mrp", "unit price"];
const UNIT_KEYS = ["unit", "base unit", "item unit", "uom", "measuring unit"];
const STOCK_KEYS = ["stock", "closing stock", "current stock", "stock quantity", "quantity", "qty", "available quantity"];

const cleanCell = (value: unknown) => String(value ?? "").trim();
const headerKey = (value: unknown) =>
  cleanCell(value).toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

function findColumn(headers: string[], candidates: string[]) {
  for (const candidate of candidates) {
    const index = headers.indexOf(candidate);
    if (index !== -1) return index;
  }
  for (const candidate of candidates) {
    const index = headers.findIndex((header) => header.includes(candidate));
    if (index !== -1) return index;
  }
  return -1;
}

function numberCell(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(cleanCell(value).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function unitCell(value: unknown, name: string) {
  const raw = headerKey(value).split(" ")[0] ?? "";
  const units: Record<string, string> = {
    kg: "kg", kgs: "kg", kilogram: "kg", kilograms: "kg", kilo: "kg",
    gm: "grammes", gms: "grammes", g: "grammes", gram: "grammes", grams: "grammes", grammes: "grammes",
    ltr: "litre", ltrs: "litre", liter: "litre", liters: "litre", litre: "litre", litres: "litre", l: "litre",
    pc: "pcs", pcs: "pcs", piece: "piece", pieces: "piece", nos: "pcs", unit: "pcs", units: "pcs",
    bottle: "bottles", bottles: "bottles", btl: "bottles", bundle: "bundles", bundles: "bundles", bdl: "bundles",
    packet: "pcs", packets: "pcs", pkt: "pcs", box: "pcs", boxes: "pcs",
  };
  if (units[raw]) return units[raw];
  const suffix = /\/\s*(kg|ltr|litre|gram|g|piece|pcs)\s*$/i.exec(name);
  return suffix ? (units[headerKey(suffix[1])] ?? "pcs") : "pcs";
}

function rowsFromMatrix(matrix: unknown[][]): { rows: Row[]; skipped: number; error?: string } {
  let headerIndex = -1;
  let headers: string[] = [];
  let nameColumn = -1;
  let priceColumn = -1;

  for (let index = 0; index < Math.min(matrix.length, 30); index += 1) {
    const candidate = (matrix[index] ?? []).map(headerKey);
    const name = findColumn(candidate, NAME_KEYS);
    const price = findColumn(candidate, PRICE_KEYS);
    if (name !== -1 && price !== -1 && name !== price) {
      headerIndex = index;
      headers = candidate;
      nameColumn = name;
      priceColumn = price;
      break;
    }
  }

  if (headerIndex === -1) {
    return { rows: [], skipped: 0, error: "Could not find 'Item Name' and 'Sale Price' columns in the sheet." };
  }

  const unitRaw = findColumn(headers, UNIT_KEYS);
  const stockRaw = findColumn(headers, STOCK_KEYS);
  const unitColumn = unitRaw === nameColumn || unitRaw === priceColumn ? -1 : unitRaw;
  const stockColumn = stockRaw === nameColumn || stockRaw === priceColumn ? -1 : stockRaw;
  const rows: Row[] = [];
  let skipped = 0;

  for (let index = headerIndex + 1; index < matrix.length; index += 1) {
    const source = matrix[index] ?? [];
    const name = cleanCell(source[nameColumn]);
    const price = numberCell(source[priceColumn]);
    if (!name || /^(total|grand total|sub total)$/i.test(name) || price <= 0) {
      skipped += 1;
      continue;
    }
    rows.push({
      name,
      unit: unitCell(unitColumn === -1 ? "" : source[unitColumn], name),
      sale_price: price,
      stock: stockColumn === -1 ? 0 : numberCell(source[stockColumn]),
    });
  }

  if (rows.length === 0) return { rows, skipped, error: "No product row with a rate found in the sheet." };
  if (rows.length > 5000) return { rows: [], skipped, error: "There are more than 5000 rows. Please use a smaller file." };
  return { rows, skipped };
}

function applyRows(rows: Row[], sheetName: string, skippedCount = 0) {
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
    skipped_count: skippedCount,
    error_count: 0,
    status: "success",
  };
  commit();
  return {
    ok: true as const,
    message: `${inserted} new, ${updated} updated (${sheetName})`,
    total_rows: rows.length + skippedCount,
    inserted_count: inserted,
    updated_count: updated,
    skipped_count: skippedCount,
    error_count: 0,
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
  if (rows.length === 0) return { ok: false as const, message: "No rate row found. Please paste a table with name and price." };
  return applyRows(rows, "Paste");
}

export async function applyProductRows(arg: Arg<{ rows: Row[] }>) {
  return applyRows(arg!.data.rows, "Import");
}

export async function syncProductsFromSheet(arg: Arg<{ fileName: string; fileBase64: string }>) {
  const input = arg?.data;
  if (!input) return { ok: false as const, message: "File not found." };
  const extension = (input.fileName.split(".").pop() ?? "").toLowerCase();
  if (!["xlsx", "xls", "csv"].includes(extension)) {
    return { ok: false as const, message: "Please upload only Excel (.xlsx/.xls) or CSV files." };
  }

  try {
    const binary = atob(input.fileBase64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    if (bytes.length > 10 * 1024 * 1024) return { ok: false as const, message: "File is larger than 10MB." };

    const { read, utils } = await import("xlsx");
    const workbook = read(bytes, { type: "array" });
    const sheetName = workbook.SheetNames[0] ?? "Excel";
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return { ok: false as const, message: "No sheet found in the file." };
    const matrix = utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });
    const parsed = rowsFromMatrix(matrix);
    if (parsed.error) return { ok: false as const, message: parsed.error };
    return applyRows(parsed.rows, sheetName, parsed.skipped);
  } catch {
    return { ok: false as const, message: "Could not read the file. Please re-export Excel from Vyapar." };
  }
}

export async function previewProductsFromDocument() {
  return {
    ok: false as const,
    message: "Reading PDF/image requires internet. Please paste rates while offline.",
  };
}

export async function getSyncStatus() {
  const d = db();
  return { productCount: d.products.length, last: d.sync };
}

export type { DbProduct };
