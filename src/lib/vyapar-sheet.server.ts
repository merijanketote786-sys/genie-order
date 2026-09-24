import { read, utils } from "xlsx";

export type SheetRow = { name: string; unit: string; sale_price: number; stock: number };

const NAME_KEYS = ["item name", "product name", "name", "item", "product", "description"];
const PRICE_KEYS = [
  "sale price",
  "sales price",
  "selling price",
  "sale rate",
  "rate",
  "price",
  "mrp",
  "unit price",
];
const UNIT_KEYS = ["unit", "base unit", "item unit", "uom", "measuring unit"];
const STOCK_KEYS = [
  "stock",
  "closing stock",
  "current stock",
  "stock quantity",
  "quantity",
  "qty",
  "available quantity",
];

const UNIT_MAP: Record<string, string> = {
  kg: "kg",
  kgs: "kg",
  kilogram: "kg",
  kilograms: "kg",
  kilo: "kg",
  gm: "grammes",
  gms: "grammes",
  g: "grammes",
  gram: "grammes",
  grams: "grammes",
  gramme: "grammes",
  grammes: "grammes",
  ltr: "litre",
  ltrs: "litre",
  liter: "litre",
  liters: "litre",
  litre: "litre",
  litres: "litre",
  l: "litre",
  pc: "pcs",
  pcs: "pcs",
  piece: "piece",
  pieces: "piece",
  nos: "pcs",
  no: "pcs",
  unit: "pcs",
  units: "pcs",
  bottle: "bottles",
  bottles: "bottles",
  btl: "bottles",
  bundle: "bundles",
  bundles: "bundles",
  bdl: "bundles",
  packet: "pcs",
  packets: "pcs",
  pkt: "pcs",
  box: "pcs",
  boxes: "pcs",
};

const clean = (v: unknown) => String(v ?? "").trim();
const key = (v: unknown) =>
  clean(v)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function findCol(headers: string[], candidates: string[]) {
  for (const cand of candidates) {
    const i = headers.indexOf(cand);
    if (i !== -1) return i;
  }
  for (const cand of candidates) {
    const i = headers.findIndex((h) => h.includes(cand));
    if (i !== -1) return i;
  }
  return -1;
}

function toNumber(v: unknown) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = clean(v).replace(/[^0-9.\-]/g, "");
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function mapUnit(raw: unknown, name: string) {
  const u = key(raw).split(" ")[0] ?? "";
  if (u && UNIT_MAP[u]) return UNIT_MAP[u]!;
  const fromName = /\/\s*(kg|ltr|litre|gram|g|piece|pcs)\s*$/i.exec(name.trim());
  if (fromName) {
    const m = key(fromName[1]);
    if (UNIT_MAP[m]) return UNIT_MAP[m]!;
  }
  return "pcs";
}

export type ParseResult =
  | { ok: true; rows: SheetRow[]; skipped: number; sheetName: string; notes: string[] }
  | { ok: false; error: string };

export function parseVyaparSheet(bytes: Uint8Array): ParseResult {
  let matrix: unknown[][];
  let sheetName = "";
  try {
    const wb = read(bytes, { type: "array" });
    sheetName = wb.SheetNames[0] ?? "";
    const sheet = sheetName ? wb.Sheets[sheetName] : undefined;
    if (!sheet) return { ok: false, error: "No sheet found in the file." };
    matrix = utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" });
  } catch {
    return { ok: false, error: "Could not read file. Export Excel (.xlsx) or CSV from Vyapar." };
  }

  return parseMatrix(matrix, sheetName);
}

/** Splits a pasted table (tab / comma / pipe / semicolon separated) into a matrix. */
export function parseDelimitedText(text: string): ParseResult {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => l.trim().length > 0);

  if (lines.length < 2) {
    return {
      ok: false,
      error: "The pasted data is too short. The first line should be column names (Item Name, Sale Price).",
    };
  }

  const candidates: Array<{ sep: RegExp; score: number }> = [
    { sep: /\t/, score: 0 },
    { sep: /\|/, score: 0 },
    { sep: /;/, score: 0 },
    { sep: /,/, score: 0 },
  ];
  for (const c of candidates) {
    c.score = lines
      .slice(0, 10)
      .reduce((s, l) => s + (l.split(c.sep).length - 1), 0);
  }
  const best = candidates.sort((a, b) => b.score - a.score)[0];
  if (!best || best.score === 0) {
    return {
      ok: false,
      error: "Could not separate columns. Copy rows from Excel or separate them with commas.",
    };
  }

  const matrix = lines.map((l) =>
    l.split(best.sep).map((cell) => cell.trim().replace(/^"(.*)"$/, "$1")),
  );
  return parseMatrix(matrix, "Pasted data");
}

function parseMatrix(matrix: unknown[][], sheetName: string): ParseResult {
  let headerIdx = -1;
  let headers: string[] = [];
  let nameCol = -1;
  let priceCol = -1;

  for (let i = 0; i < Math.min(matrix.length, 30); i += 1) {
    const row = (matrix[i] ?? []).map(key);
    const n = findCol(row, NAME_KEYS);
    const p = findCol(row, PRICE_KEYS);
    if (n !== -1 && p !== -1) {
      headerIdx = i;
      headers = row;
      nameCol = n;
      priceCol = p;
      break;
    }
  }

  if (headerIdx === -1) {
    const anyRow = matrix.slice(0, 30).map((r) => r.map(key));
    const hasName = anyRow.some((r) => findCol(r, NAME_KEYS) !== -1);
    return {
      ok: false,
      error: hasName
        ? "No 'Sale Price' (rate) column found in the sheet."
        : "No 'Item Name' and 'Sale Price' columns found in the sheet.",
    };
  }

  if (priceCol === nameCol) {
    return {
      ok: false,
      error: "No separate rate column found in the sheet. Export 'Item Details' from Vyapar with a Sale Price column.",
    };
  }

  const unitColRaw = findCol(headers, UNIT_KEYS);
  const stockColRaw = findCol(headers, STOCK_KEYS);
  const unitCol = unitColRaw === nameCol || unitColRaw === priceCol ? -1 : unitColRaw;
  const stockCol = stockColRaw === nameCol || stockColRaw === priceCol ? -1 : stockColRaw;

  const rows: SheetRow[] = [];
  let skipped = 0;
  let noPrice = 0;
  const noPriceNames: string[] = [];

  for (let i = headerIdx + 1; i < matrix.length; i += 1) {
    const r = matrix[i] ?? [];
    const name = clean(r[nameCol]);
    if (!name) {
      skipped += 1;
      continue;
    }
    if (/^(total|grand total|sub total)$/i.test(name)) {
      skipped += 1;
      continue;
    }
    const price = toNumber(r[priceCol]);
    if (price <= 0) {
      skipped += 1;
      noPrice += 1;
      if (noPriceNames.length < 10) noPriceNames.push(name);
      continue;
    }
    rows.push({
      name,
      unit: mapUnit(unitCol === -1 ? "" : r[unitCol], name),
      sale_price: price,
      stock: stockCol === -1 ? 0 : toNumber(r[stockCol]),
    });
  }

  if (rows.length === 0) {
    return {
      ok: false,
      error: noPrice
        ? `Every row's rate is 0 or empty (${noPrice} rows) — nothing was updated.`
        : "No product rows found in the sheet.",
    };
  }
  if (rows.length > 5000) {
    return { ok: false, error: "More than 5000 rows. Please shrink the file." };
  }

  const notes: string[] = [];
  if (noPrice) {
    notes.push(
      `${noPrice} rows had a rate of 0 or empty — skipped (old rates preserved): ${noPriceNames
        .slice(0, 5)
        .join(", ")}`,
    );
  }

  return { ok: true, rows, skipped, sheetName, notes };
}
